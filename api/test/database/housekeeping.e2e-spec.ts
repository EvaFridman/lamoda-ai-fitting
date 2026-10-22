import { randomUUID } from 'node:crypto';

import { ListObjectsV2Command, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { ApplicationFailure, Client, Connection, WorkflowFailedError } from '@temporalio/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { userPhotoKey } from '../../src/storage/keys.js';
import type { StorageService } from '../../src/storage/storage.service.js';
import { WorkflowStarter } from '../../src/temporal/workflow-starter.js';
import { signIn } from '../support/sign-in.js';
import { createTestApp, type TestApp } from '../support/test-app.js';
import {
  createTestS3Client,
  createTestStorageService,
  testStorageSettings,
} from '../support/test-storage.js';
import {
  startTestWorker,
  startTestWorkerWith,
  testTemporalSettings,
  type TestWorker,
} from '../support/test-temporal.js';

const BODY = new Uint8Array([82, 73, 70, 70, 1, 2, 3]);
const { bucket } = testStorageSettings();
const MINUTE = 60_000;

interface HousekeepingResult {
  photosExpired: number;
  deletionsStarted: number;
}

describe('housekeeping workflow (spec 0019 A24, A38)', () => {
  const settings = testTemporalSettings();
  let testApp: TestApp;
  let s3: S3Client;
  let storage: StorageService;
  let worker: TestWorker;
  let client: Client;

  beforeAll(async () => {
    s3 = createTestS3Client();
    storage = createTestStorageService();
    testApp = await createTestApp({ temporal: settings });
    client = testApp.app.get(Client);
    worker = await startTestWorker(settings, storage, testApp.prisma);
  }, 120_000);

  afterAll(async () => {
    await worker.stop();
    await testApp.close();
    storage.onApplicationShutdown();
    s3.destroy();
  });

  async function runHousekeeping(): Promise<HousekeepingResult> {
    return client.workflow.execute('housekeeping', {
      taskQueue: settings.taskQueue,
      workflowId: `housekeeping-test-${randomUUID()}`,
      workflowExecutionTimeout: '60 seconds',
    });
  }

  async function keysUnder(prefix: string): Promise<string[]> {
    const found = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
    return (found.Contents ?? []).map((object) => object.Key ?? '');
  }

  // A photo's row and file; `ageMs` moves its creation time back.
  async function createPhoto(
    userId: string,
    options: { transient: boolean; isDefault?: boolean; ageMs?: number },
  ): Promise<{ id: string; key: string }> {
    const key = userPhotoKey(userId);
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: BODY }));
    const row = await testApp.prisma.userPhoto.create({
      data: {
        userId,
        imageKey: key,
        isDefault: options.isDefault ?? false,
        transient: options.transient,
        width: 10,
        height: 10,
        createdAt: new Date(Date.now() - (options.ageMs ?? 0)),
      },
    });
    return { id: row.id, key };
  }

  async function expectGone(key: string): Promise<void> {
    await vi.waitFor(async () => expect(await keysUnder(key)).toEqual([]), {
      timeout: 30_000,
      interval: 250,
    });
  }

  async function outboxOf(rowId: string) {
    return testApp.prisma.fileDeletion.findMany({ where: { rowId } });
  }

  it('returns zeros when there is nothing to do', async () => {
    await expect(runHousekeeping()).resolves.toEqual({ photosExpired: 0, deletionsStarted: 0 });
  }, 60_000);

  it('starts a deletion whose start failed, deletes the file and then the row (A38)', async () => {
    const who = await signIn(testApp.app);
    const photo = await createPhoto(who.userId, { transient: false, isDefault: true });
    const start = vi
      .spyOn(testApp.app.get(WorkflowStarter), 'start')
      .mockRejectedValue(new Error('Temporal is down'));
    try {
      await request(testApp.app.getHttpServer())
        .delete(`/me/photos/${photo.id}`)
        .set({ Cookie: who.cookie })
        .expect(204);
    } finally {
      start.mockRestore();
    }
    const [queued] = await outboxOf(photo.id);
    expect(queued).toMatchObject({ kind: 'photo', prefixes: [photo.key], startedAt: null });
    // Older than a minute: the schedule no longer leaves it to the api that wrote it.
    await testApp.prisma.fileDeletion.update({
      where: { id: queued?.id ?? '' },
      data: { createdAt: new Date(Date.now() - 2 * MINUTE) },
    });

    const result = await runHousekeeping();

    expect(result).toEqual({ photosExpired: 0, deletionsStarted: 1 });
    await expectGone(photo.key);
    await vi.waitFor(async () => expect(await outboxOf(photo.id)).toEqual([]), {
      timeout: 30_000,
      interval: 250,
    });
  }, 90_000);

  it('leaves a row younger than a minute alone', async () => {
    const rowId = randomUUID();
    const key = userPhotoKey(randomUUID());
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: BODY }));
    await testApp.prisma.fileDeletion.create({
      data: { kind: 'photo', rowId, prefixes: [key], createdAt: new Date(Date.now() - 20_000) },
    });

    const result = await runHousekeeping();

    expect(result).toEqual({ photosExpired: 0, deletionsStarted: 0 });
    expect(await keysUnder(key)).toEqual([key]);
    const [row] = await outboxOf(rowId);
    expect(row?.startedAt).toBeNull();
    await testApp.prisma.fileDeletion.deleteMany({ where: { rowId } });
  }, 60_000);

  it('leaves a row already started alone', async () => {
    const rowId = randomUUID();
    const key = userPhotoKey(randomUUID());
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: BODY }));
    await testApp.prisma.fileDeletion.create({
      data: {
        kind: 'photo',
        rowId,
        prefixes: [key],
        createdAt: new Date(Date.now() - 5 * MINUTE),
        startedAt: new Date(Date.now() - 4 * MINUTE),
      },
    });

    const result = await runHousekeeping();

    expect(result).toEqual({ photosExpired: 0, deletionsStarted: 0 });
    expect(await keysUnder(key)).toEqual([key]);
    await testApp.prisma.fileDeletion.deleteMany({ where: { rowId } });
  }, 60_000);

  it('deletes a transient photo older than an hour with its file and keeps the rest (A24)', async () => {
    const who = await signIn(testApp.app);
    const saved = await createPhoto(who.userId, {
      transient: false,
      isDefault: true,
      ageMs: 5 * 60 * MINUTE,
    });
    const fresh = await createPhoto(who.userId, { transient: true, ageMs: 5 * MINUTE });
    const old = await createPhoto(who.userId, { transient: true, ageMs: 2 * 60 * MINUTE });

    const result = await runHousekeeping();

    expect(result).toEqual({ photosExpired: 1, deletionsStarted: 1 });
    expect(await testApp.prisma.userPhoto.findUnique({ where: { id: old.id } })).toBeNull();
    await expectGone(old.key);
    await vi.waitFor(async () => expect(await outboxOf(old.id)).toEqual([]), {
      timeout: 30_000,
      interval: 250,
    });
    const rows = await testApp.prisma.userPhoto.findMany({ where: { userId: who.userId } });
    expect(rows.map((row) => row.id).sort()).toEqual([saved.id, fresh.id].sort());
    expect(await keysUnder(saved.key)).toEqual([saved.key]);
    expect(await keysUnder(fresh.key)).toEqual([fresh.key]);
  }, 90_000);

  it('returns zeros again once everything is done', async () => {
    await expect(runHousekeeping()).resolves.toEqual({ photosExpired: 0, deletionsStarted: 0 });
  }, 60_000);
});

// The workflow's own logic on stub activities: one start that fails stops none of the others.
describe('housekeeping workflow with a start that fails', () => {
  const settings = testTemporalSettings();
  const started: string[] = [];
  let connection: Connection;
  let client: Client;
  let worker: TestWorker;
  const deletions = ['a', 'b', 'c'].map((name) => ({
    id: `${name}-${randomUUID()}`,
    kind: 'photo' as const,
    rowId: randomUUID(),
    prefixes: [] as string[],
  }));

  beforeAll(async () => {
    worker = await startTestWorkerWith(settings, {
      expireTransientPhotos: () => Promise.resolve([]),
      listUnstartedDeletions: () => Promise.resolve(deletions),
      startFileDeletion(deletion: { id: string }): Promise<void> {
        if (deletion.id === deletions[1]?.id) {
          return Promise.reject(ApplicationFailure.nonRetryable('refused', 'StartRefused'));
        }
        started.push(deletion.id);
        return Promise.resolve();
      },
    });
    connection = await Connection.connect({ address: settings.address });
    client = new Client({ connection, namespace: settings.namespace });
  }, 120_000);

  afterAll(async () => {
    await worker.stop();
    await connection.close();
  });

  it('starts the others and then fails with DeletionsNotStarted and the count only', async () => {
    const failure = await client.workflow
      .execute('housekeeping', {
        taskQueue: settings.taskQueue,
        workflowId: `housekeeping-test-${randomUUID()}`,
        workflowExecutionTimeout: '60 seconds',
      })
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    expect(started.sort()).toEqual([deletions[0]?.id, deletions[2]?.id].sort());
    expect(failure).toBeInstanceOf(WorkflowFailedError);
    const cause = (failure as WorkflowFailedError).cause as ApplicationFailure;
    expect(cause).toBeInstanceOf(ApplicationFailure);
    expect(cause.type).toBe('DeletionsNotStarted');
    expect(cause.message).toBe('1 of 3 deletions were not started');
  }, 60_000);
});
