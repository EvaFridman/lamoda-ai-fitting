import { randomUUID } from 'node:crypto';

import { ListObjectsV2Command, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { ApplicationFailure, Client, Connection, WorkflowFailedError } from '@temporalio/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { quotaMonth } from '../../src/fittings/quota-month.js';
import { generationResultKey, userPhotoKey } from '../../src/storage/keys.js';
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
  fittingsEnded?: number;
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
    await expect(runHousekeeping()).resolves.toEqual({
      fittingsEnded: 0,
      photosExpired: 0,
      deletionsStarted: 0,
    });
  }, 60_000);

  describe('ending the stuck fittings (A70)', () => {
    const month = (at: Date) => quotaMonth(at);

    // A user with a session and a spent quota of `used`, measured in the month of `createdAt`.
    async function userWith(used: number, createdAt: Date) {
      const who = await signIn(testApp.app);
      const session = await testApp.prisma.fittingSession.create({ data: { userId: who.userId } });
      await testApp.prisma.fittingQuota.create({
        data: { userId: who.userId, month: month(createdAt), used },
      });
      return { userId: who.userId, sessionId: session.id };
    }

    function fitting(
      owner: { userId: string; sessionId: string },
      options: {
        status: 'pending' | 'processing' | 'completed';
        createdAt: Date;
        counts?: boolean;
        kind?: 'single' | null;
        parentId?: string;
        freeRegenerationUsed?: boolean;
        startedAt?: Date;
      },
    ) {
      const id = randomUUID();
      const done =
        options.status === 'completed'
          ? {
              startedAt: options.createdAt,
              finishedAt: options.createdAt,
              resultImageKey: generationResultKey(owner.userId, id),
            }
          : {};
      return testApp.prisma.aiGeneration.create({
        data: {
          ...done,
          id,
          sessionId: owner.sessionId,
          userId: owner.userId,
          kind: options.kind === undefined ? 'single' : options.kind,
          parentId: options.parentId,
          status: options.status,
          createdAt: options.createdAt,
          ...(options.startedAt === undefined ? {} : { startedAt: options.startedAt }),
          countsAgainstLimit: options.counts ?? true,
          freeRegenerationUsed: options.freeRegenerationUsed ?? false,
          fingerprint: options.kind === null ? null : randomUUID().replaceAll('-', '').repeat(2),
          aiProvider: 'fake',
          aiModel: 'gpt-image-2',
        },
      });
    }

    const usedOf = async (userId: string, at: Date) =>
      (
        await testApp.prisma.fittingQuota.findUniqueOrThrow({
          where: { userId_month: { userId, month: month(at) } },
        })
      ).used;

    it('ends the fittings older than an hour, gives the units back and leaves the rest alone', async () => {
      const old = new Date(Date.now() - 2 * 60 * MINUTE);
      const young = new Date(Date.now() - 30 * MINUTE);
      const paid = await userWith(2, old);
      const pending = await fitting(paid, { status: 'pending', createdAt: old });
      const processing = await fitting(paid, { status: 'processing', createdAt: old });
      const free = await userWith(1, old);
      const parent = await fitting(free, {
        status: 'completed',
        createdAt: old,
        freeRegenerationUsed: true,
      });
      const freeChild = await fitting(free, {
        status: 'pending',
        createdAt: old,
        counts: false,
        parentId: parent.id,
      });
      const bystander = await userWith(2, young);
      const fresh = await fitting(bystander, { status: 'pending', createdAt: young });
      const closed = await fitting(bystander, { status: 'pending', createdAt: old, kind: null });

      const result = await runHousekeeping();

      expect(result).toEqual({ fittingsEnded: 3, photosExpired: 0, deletionsStarted: 0 });
      for (const ended of [pending, processing, freeChild]) {
        expect(
          await testApp.prisma.aiGeneration.findUniqueOrThrow({ where: { id: ended.id } }),
        ).toMatchObject({
          status: 'failed',
          failureCode: 'provider_error',
          errorMessage: 'stuck',
          countsAgainstLimit: false,
        });
      }
      expect(await usedOf(paid.userId, old)).toBe(0);
      expect(await usedOf(free.userId, old)).toBe(1);
      expect(
        (await testApp.prisma.aiGeneration.findUniqueOrThrow({ where: { id: parent.id } }))
          .freeRegenerationUsed,
      ).toBe(false);
      for (const untouched of [fresh, closed]) {
        expect(
          await testApp.prisma.aiGeneration.findUniqueOrThrow({ where: { id: untouched.id } }),
        ).toMatchObject({ status: 'pending', failureCode: null, finishedAt: null });
      }
      expect(await usedOf(bystander.userId, young)).toBe(2);
    }, 60_000);

    it('ends none the second time', async () => {
      await expect(runHousekeeping()).resolves.toMatchObject({ fittingsEnded: 0 });
    }, 60_000);

    it('ends a row claimed over an hour ago as failed and keeps its unit spent', async () => {
      const old = new Date(Date.now() - 3 * 60 * MINUTE);
      const claimedAt = new Date(Date.now() - 2 * 60 * MINUTE);
      const paid = await userWith(2, old);
      const claimed = await fitting(paid, {
        status: 'processing',
        createdAt: old,
        startedAt: claimedAt,
      });
      const free = await userWith(1, old);
      const parent = await fitting(free, {
        status: 'completed',
        createdAt: old,
        freeRegenerationUsed: true,
      });
      const freeChild = await fitting(free, {
        status: 'processing',
        createdAt: old,
        startedAt: claimedAt,
        counts: false,
        parentId: parent.id,
      });

      expect(await runHousekeeping()).toMatchObject({ fittingsEnded: 2 });

      for (const ended of [claimed, freeChild]) {
        expect(
          await testApp.prisma.aiGeneration.findUniqueOrThrow({ where: { id: ended.id } }),
        ).toMatchObject({
          status: 'failed',
          failureCode: 'provider_error',
          errorMessage: 'stuck',
        });
      }
      expect(
        (await testApp.prisma.aiGeneration.findUniqueOrThrow({ where: { id: claimed.id } }))
          .countsAgainstLimit,
      ).toBe(true);
      expect(await usedOf(paid.userId, old)).toBe(2);
      expect(await usedOf(free.userId, old)).toBe(1);
      expect(
        (await testApp.prisma.aiGeneration.findUniqueOrThrow({ where: { id: parent.id } }))
          .freeRegenerationUsed,
      ).toBe(true);
    }, 60_000);

    it('leaves a row claimed within the hour running and does not count it', async () => {
      const old = new Date(Date.now() - 3 * 60 * MINUTE);
      const owner = await userWith(2, old);
      const running = await fitting(owner, {
        status: 'processing',
        createdAt: old,
        startedAt: new Date(Date.now() - 10 * MINUTE),
      });

      expect(await runHousekeeping()).toMatchObject({ fittingsEnded: 0 });

      expect(
        await testApp.prisma.aiGeneration.findUniqueOrThrow({ where: { id: running.id } }),
      ).toMatchObject({
        status: 'processing',
        failureCode: null,
        finishedAt: null,
        countsAgainstLimit: true,
      });
      expect(await usedOf(owner.userId, old)).toBe(2);
    }, 60_000);

    it('ends an unclaimed processing row and gives its unit back', async () => {
      const old = new Date(Date.now() - 3 * 60 * MINUTE);
      const owner = await userWith(2, old);
      const row = await fitting(owner, { status: 'processing', createdAt: old });

      expect(await runHousekeeping()).toMatchObject({ fittingsEnded: 1 });

      expect(
        await testApp.prisma.aiGeneration.findUniqueOrThrow({ where: { id: row.id } }),
      ).toMatchObject({ status: 'failed', countsAgainstLimit: false });
      expect(await usedOf(owner.userId, old)).toBe(1);
    }, 60_000);

    it('ends the oldest hundred of a longer queue and the rest on the next run', async () => {
      const old = new Date(Date.now() - 3 * 60 * MINUTE);
      const owner = await userWith(0, old);
      await testApp.prisma.aiGeneration.createMany({
        data: Array.from({ length: 101 }, (_, index) => ({
          sessionId: owner.sessionId,
          userId: owner.userId,
          kind: 'single' as const,
          status: 'pending' as const,
          countsAgainstLimit: false,
          fingerprint: `${index}`.padStart(64, '0'),
          aiProvider: 'fake',
          aiModel: 'gpt-image-2',
          createdAt: new Date(old.getTime() + index),
        })),
      });

      expect(await runHousekeeping()).toMatchObject({ fittingsEnded: 100 });
      expect(await runHousekeeping()).toMatchObject({ fittingsEnded: 1 });
    }, 90_000);
  });

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

    expect(result).toEqual({ fittingsEnded: 0, photosExpired: 0, deletionsStarted: 1 });
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

    expect(result).toEqual({ fittingsEnded: 0, photosExpired: 0, deletionsStarted: 0 });
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

    expect(result).toEqual({ fittingsEnded: 0, photosExpired: 0, deletionsStarted: 0 });
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

    expect(result).toEqual({ fittingsEnded: 0, photosExpired: 1, deletionsStarted: 1 });
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
    await expect(runHousekeeping()).resolves.toEqual({
      fittingsEnded: 0,
      photosExpired: 0,
      deletionsStarted: 0,
    });
  }, 60_000);
});

// The step for the stuck fittings, on stub activities: it goes first, and its failure stops
// none of the steps after it.
describe('housekeeping workflow with a step for stuck fittings', () => {
  const settings = testTemporalSettings();
  const order: string[] = [];
  let ending: () => Promise<number> = () => Promise.resolve(0);
  let connection: Connection;
  let client: Client;
  let worker: TestWorker;

  beforeAll(async () => {
    worker = await startTestWorkerWith(settings, {
      endStuckFittings() {
        order.push('endStuckFittings');
        return ending();
      },
      expireTransientPhotos() {
        order.push('expireTransientPhotos');
        return Promise.resolve([]);
      },
      listUnstartedDeletions() {
        order.push('listUnstartedDeletions');
        return Promise.resolve([]);
      },
      startFileDeletion: () => Promise.resolve(),
    });
    connection = await Connection.connect({ address: settings.address });
    client = new Client({ connection, namespace: settings.namespace });
  }, 120_000);

  afterAll(async () => {
    await worker.stop();
    await connection.close();
  });

  const run = () =>
    client.workflow.execute('housekeeping', {
      taskQueue: settings.taskQueue,
      workflowId: `housekeeping-test-${randomUUID()}`,
      workflowExecutionTimeout: '60 seconds',
    });

  it('runs it first and returns how many it ended', async () => {
    order.length = 0;
    ending = () => Promise.resolve(7);

    const result = await run();

    expect(order).toEqual(['endStuckFittings', 'expireTransientPhotos', 'listUnstartedDeletions']);
    expect(result).toEqual({ fittingsEnded: 7, photosExpired: 0, deletionsStarted: 0 });
  }, 60_000);

  it('goes on to the photos and the deletions when it fails, once', async () => {
    order.length = 0;
    ending = () => Promise.reject(new Error('database down'));

    const result = await run();

    expect(order).toEqual(['endStuckFittings', 'expireTransientPhotos', 'listUnstartedDeletions']);
    expect(result).toEqual({ photosExpired: 0, deletionsStarted: 0 });
    expect(result).not.toHaveProperty('fittingsEnded');
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
      endStuckFittings: () => Promise.resolve(0),
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
