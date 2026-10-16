import { randomUUID } from 'node:crypto';

import { ListObjectsV2Command, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { Client } from '@temporalio/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { generationFolder, userPhotoKey } from '../../src/storage/keys.js';
import type { StorageService } from '../../src/storage/storage.service.js';
import { FileDeletion } from '../../src/temporal/file-deletion.js';
import { createTestApp, type TestApp } from '../support/test-app.js';
import { startTcpProxy, type TcpProxy } from '../support/tcp-proxy.js';
import {
  createTestS3Client,
  createTestStorageService,
  testStorageSettings,
} from '../support/test-storage.js';
import {
  startTestWorker,
  testTemporalSettings,
  type TestWorker,
} from '../support/test-temporal.js';

const ADMIN = { 'X-Admin-Token': process.env['ADMIN_API_TOKEN'] ?? '' };
const BODY = new Uint8Array([82, 73, 70, 70, 1, 2, 3]);
const { bucket } = testStorageSettings();

// Files share the emulator's bucket and the databases are the file's own: ids are random.
async function createUser(prisma: PrismaClient): Promise<string> {
  const digits = String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
  const user = await prisma.user.create({
    data: { phone: `+79${digits}`, email: `${randomUUID()}@example.test`, firstName: 'Test' },
  });
  return user.id;
}

async function createSession(
  prisma: PrismaClient,
  userId: string,
  isActive: boolean,
): Promise<string> {
  const session = await prisma.fittingSession.create({ data: { userId, isActive } });
  return session.id;
}

// Writes the generation's row and its input and result files.
async function createGeneration(
  prisma: PrismaClient,
  s3: S3Client,
  userId: string,
  sessionId: string,
  userImageKey?: string,
): Promise<{ id: string; keys: string[] }> {
  const id = randomUUID();
  const folder = generationFolder(userId, id);
  const keys = [`${folder}input.webp`, `${folder}result.webp`];
  await prisma.aiGeneration.create({
    data: {
      id,
      sessionId,
      userImageKey: userImageKey ?? keys[0] ?? '',
      resultImageKey: keys[1] ?? null,
      status: 'completed',
      aiProvider: 'test',
      aiModel: 'test',
    },
  });
  await put(s3, keys);
  return { id, keys };
}

async function put(s3: S3Client, keys: string[]): Promise<void> {
  for (const key of keys) {
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: BODY }));
  }
}

async function keysUnder(s3: S3Client, prefix: string): Promise<string[]> {
  const found = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
  return (found.Contents ?? []).map((object) => object.Key ?? '');
}

async function expectKeysGone(s3: S3Client, prefix: string): Promise<void> {
  await vi.waitFor(async () => expect(await keysUnder(s3, prefix)).toEqual([]), {
    timeout: 30_000,
    interval: 250,
  });
}

function remove(testApp: TestApp, path: string) {
  return request(testApp.app.getHttpServer()).delete(path).set(ADMIN);
}

describe('files deleted through Temporal', () => {
  const settings = testTemporalSettings();
  let proxy: TcpProxy;
  let workerStorage: StorageService;
  let worker: TestWorker;
  let testApp: TestApp;
  let s3: S3Client;

  beforeAll(async () => {
    s3 = createTestS3Client();
    proxy = await startTcpProxy(testStorageSettings().endpoint);
    workerStorage = createTestStorageService(proxy.endpoint);
    worker = await startTestWorker(settings, workerStorage);
    testApp = await createTestApp(settings);
  }, 120_000);

  afterAll(async () => {
    await worker.stop();
    await testApp.close();
    workerStorage.onModuleDestroy();
    await proxy.close();
    s3.destroy();
  });

  it('deleting a user removes all their files and keeps another user’s', async () => {
    const { prisma } = testApp;
    const userId = await createUser(prisma);
    const otherId = await createUser(prisma);
    const photo = userPhotoKey(userId);
    const otherPhoto = userPhotoKey(otherId);
    const sessionId = await createSession(prisma, userId, true);
    const otherSession = await createSession(prisma, otherId, true);
    const first = await createGeneration(prisma, s3, userId, sessionId, photo);
    const second = await createGeneration(prisma, s3, userId, sessionId);
    const other = await createGeneration(prisma, s3, otherId, otherSession);
    await put(s3, [photo, otherPhoto]);
    expect(first.keys).toHaveLength(2);
    expect(second.keys).toHaveLength(2);
    expect(await keysUnder(s3, `keep/users/${userId}/`)).toHaveLength(5);

    await remove(testApp, `/users/${userId}`).expect(204);

    await expectKeysGone(s3, `keep/users/${userId}/`);
    expect((await keysUnder(s3, `keep/users/${otherId}/`)).sort()).toEqual(
      [otherPhoto, ...other.keys].sort(),
    );
  });

  it('deleting a session removes its generations’ folders and keeps the rest', async () => {
    const { prisma } = testApp;
    const userId = await createUser(prisma);
    const photo = userPhotoKey(userId);
    const sessionId = await createSession(prisma, userId, true);
    const otherSessionId = await createSession(prisma, userId, false);
    const first = await createGeneration(prisma, s3, userId, sessionId, photo);
    const second = await createGeneration(prisma, s3, userId, sessionId);
    const kept = await createGeneration(prisma, s3, userId, otherSessionId);
    await put(s3, [photo]);

    await remove(testApp, `/fitting-sessions/${sessionId}`).expect(204);

    await expectKeysGone(s3, generationFolder(userId, first.id));
    await expectKeysGone(s3, generationFolder(userId, second.id));
    expect((await keysUnder(s3, `keep/users/${userId}/`)).sort()).toEqual(
      [photo, ...kept.keys].sort(),
    );
  });

  it('deleting a session without generations answers 204 and removes nothing', async () => {
    const { prisma } = testApp;
    const userId = await createUser(prisma);
    const photo = userPhotoKey(userId);
    await put(s3, [photo]);
    const sessionId = await createSession(prisma, userId, true);

    await remove(testApp, `/fitting-sessions/${sessionId}`).expect(204);

    expect(await keysUnder(s3, photo)).toEqual([photo]);
  });

  it('deleting a generation removes its folder only, the photo it points at stays (M24)', async () => {
    const { prisma } = testApp;
    const userId = await createUser(prisma);
    const photo = userPhotoKey(userId);
    const sessionId = await createSession(prisma, userId, true);
    const doomed = await createGeneration(prisma, s3, userId, sessionId, photo);
    const kept = await createGeneration(prisma, s3, userId, sessionId);
    await put(s3, [photo]);

    await remove(testApp, `/ai-generations/${doomed.id}`).expect(204);

    await expectKeysGone(s3, generationFolder(userId, doomed.id));
    expect((await keysUnder(s3, `keep/users/${userId}/`)).sort()).toEqual(
      [photo, ...kept.keys].sort(),
    );
  });

  it('deleting a session of more than 20 generations removes every folder', async () => {
    const { prisma } = testApp;
    const userId = await createUser(prisma);
    const photo = userPhotoKey(userId);
    const sessionId = await createSession(prisma, userId, true);
    await put(s3, [photo]);
    const generations: { id: string; keys: string[] }[] = [];
    for (let i = 0; i < 25; i += 1) {
      generations.push(await createGeneration(prisma, s3, userId, sessionId, photo));
    }

    await remove(testApp, `/fitting-sessions/${sessionId}`).expect(204);

    await vi.waitFor(
      async () => expect(await keysUnder(s3, `keep/users/${userId}/generations/`)).toEqual([]),
      { timeout: 60_000, interval: 500 },
    );
    expect(await keysUnder(s3, photo)).toEqual([photo]);
  }, 120_000);

  it('deletes the files when the user id in the path is upper case', async () => {
    const { prisma } = testApp;
    const userId = await createUser(prisma);
    const sessionId = await createSession(prisma, userId, true);
    const photo = userPhotoKey(userId);
    await put(s3, [photo]);
    await createGeneration(prisma, s3, userId, sessionId, photo);

    await remove(testApp, `/users/${userId.toUpperCase()}`).expect(204);

    await expectKeysGone(s3, `keep/users/${userId}/`);
  });

  it('deletes the files when the generation id in the path is upper case', async () => {
    const { prisma } = testApp;
    const userId = await createUser(prisma);
    const sessionId = await createSession(prisma, userId, true);
    const generation = await createGeneration(prisma, s3, userId, sessionId);

    await remove(testApp, `/ai-generations/${generation.id.toUpperCase()}`).expect(204);

    await expectKeysGone(s3, generationFolder(userId, generation.id));
  });

  it('answers 404 to a repeated delete', async () => {
    const { prisma } = testApp;
    const userId = await createUser(prisma);
    const sessionId = await createSession(prisma, userId, true);
    const generation = await createGeneration(prisma, s3, userId, sessionId);

    await remove(testApp, `/ai-generations/${generation.id}`).expect(204);
    await remove(testApp, `/ai-generations/${generation.id}`).expect(404);
    await remove(testApp, `/fitting-sessions/${sessionId}`).expect(204);
    await remove(testApp, `/fitting-sessions/${sessionId}`).expect(404);
    await remove(testApp, `/users/${userId}`).expect(204);
    await remove(testApp, `/users/${userId}`).expect(404);
  });

  it('answers 404 for a missing row', async () => {
    await remove(testApp, `/users/${randomUUID()}`).expect(404);
    await remove(testApp, `/fitting-sessions/${randomUUID()}`).expect(404);
    await remove(testApp, `/ai-generations/${randomUUID()}`).expect(404);
  });

  it('answers 204 with the storage unreachable and deletes the files once it is back (AC10)', async () => {
    const { prisma } = testApp;
    const userId = await createUser(prisma);
    const sessionId = await createSession(prisma, userId, true);
    const generation = await createGeneration(prisma, s3, userId, sessionId);
    const client = testApp.app.get(Client);
    const handle = client.workflow.getHandle(`delete-files-generation-${generation.id}`);

    proxy.block();
    try {
      await remove(testApp, `/ai-generations/${generation.id}`).expect(204);

      // The activity has failed and been retried, and the files are still there.
      await vi.waitFor(
        async () => {
          const { raw } = await handle.describe();
          expect(raw.pendingActivities?.[0]?.attempt ?? 0).toBeGreaterThanOrEqual(2);
        },
        { timeout: 20_000, interval: 250 },
      );
      expect((await keysUnder(s3, generationFolder(userId, generation.id))).sort()).toEqual(
        generation.keys.slice().sort(),
      );
    } finally {
      proxy.unblock();
    }

    await vi.waitFor(
      async () => expect(await keysUnder(s3, generation.keys[0] ?? '')).toEqual([]),
      {
        timeout: 60_000,
        interval: 500,
      },
    );
    await expectKeysGone(s3, generationFolder(userId, generation.id));
  }, 120_000);
});

describe('a delete with no worker on the task queue', () => {
  let testApp: TestApp;
  let s3: S3Client;

  beforeAll(async () => {
    s3 = createTestS3Client();
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
    s3.destroy();
  });

  it('answers 204, the workflow waits and the files stay', async () => {
    const { prisma } = testApp;
    const userId = await createUser(prisma);
    const sessionId = await createSession(prisma, userId, true);
    const generation = await createGeneration(prisma, s3, userId, sessionId);

    await remove(testApp, `/ai-generations/${generation.id}`).expect(204);

    const handle = testApp.app
      .get(Client)
      .workflow.getHandle(`delete-files-generation-${generation.id}`);
    const { status } = await handle.describe();
    expect(status.name).toBe('RUNNING');
    expect(await keysUnder(s3, generationFolder(userId, generation.id))).toHaveLength(2);
  });

  it('starting the same workflow id twice while it runs does not fail', async () => {
    const userId = await createUser(testApp.prisma);
    const fileDeletion = testApp.app.get(FileDeletion);
    const prefixes = [`keep/users/${userId}/`];

    await expect(fileDeletion.startFileDeletion('user', userId, prefixes)).resolves.toBeUndefined();
    await expect(fileDeletion.startFileDeletion('user', userId, prefixes)).resolves.toBeUndefined();

    const handle = testApp.app.get(Client).workflow.getHandle(`delete-files-user-${userId}`);
    expect((await handle.describe()).status.name).toBe('RUNNING');
  });
});

describe('a delete with Temporal unreachable', () => {
  const unreachable = { address: '127.0.0.1:1', namespace: 'default', taskQueue: 'unreachable' };
  let testApp: TestApp;
  let s3: S3Client;

  beforeAll(async () => {
    s3 = createTestS3Client();
    testApp = await createTestApp(unreachable);
  }, 60_000);

  afterAll(async () => {
    s3.destroy();
    // Already closed by the test that closes it; closing twice is harmless there.
    await testApp.close().catch(() => undefined);
  });

  it('answers 204 within the start bound and leaves the files', async () => {
    const { prisma } = testApp;
    const userId = await createUser(prisma);
    const sessionId = await createSession(prisma, userId, true);
    const generation = await createGeneration(prisma, s3, userId, sessionId);
    const began = Date.now();

    await remove(testApp, `/ai-generations/${generation.id}`).expect(204);

    expect(Date.now() - began).toBeLessThan(7000);
    expect(await prisma.aiGeneration.findUnique({ where: { id: generation.id } })).toBeNull();
    expect(await keysUnder(s3, generationFolder(userId, generation.id))).toHaveLength(2);
  }, 20_000);

  it('closing the app during a start raises no unhandled rejection or uncaught exception', async () => {
    const { prisma } = testApp;
    const userId = await createUser(prisma);
    const sessionId = await createSession(prisma, userId, true);
    const generation = await createGeneration(prisma, s3, userId, sessionId);
    const raised: unknown[] = [];
    const onError = (error: unknown) => raised.push(error);
    process.on('uncaughtException', onError);
    process.on('unhandledRejection', onError);
    try {
      const answer = remove(testApp, `/ai-generations/${generation.id}`).then(
        (response) => response.status,
        () => 'connection closed',
      );
      // The row is gone, so the start is in progress.
      await vi.waitFor(
        async () =>
          expect(await prisma.aiGeneration.findUnique({ where: { id: generation.id } })).toBeNull(),
        { timeout: 10_000, interval: 10 },
      );

      await testApp.app.close();
      await answer;
      // Timers and sockets of the closed client get their turn to throw.
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      process.off('uncaughtException', onError);
      process.off('unhandledRejection', onError);
    }

    expect(raised).toEqual([]);
  }, 30_000);
});
