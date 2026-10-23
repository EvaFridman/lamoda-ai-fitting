import { createHash, randomUUID } from 'node:crypto';

import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { Client, Connection, WorkflowFailedError } from '@temporalio/client';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { FakeAiProvider } from '../../src/ai/ai-provider.js';
import { quotaMonth } from '../../src/fittings/quota-month.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import {
  generationFolder,
  generationResultKey,
  mediaKey,
  userPhotoKey,
} from '../../src/storage/keys.js';
import type { StorageService } from '../../src/storage/storage.service.js';
import { createFittingActivities } from '../../src/temporal/activities/fitting.activities.js';
import { fittingWorkflowId } from '../../src/temporal/fitting-workflow-id.js';
import { goodPhoto, refusedPhoto } from '../support/photos.js';
import { createTestDatabase } from '../support/test-database.js';
import { expectViolation } from '../support/violation.js';
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

const { bucket } = testStorageSettings();
const HOUR = 3_600_000;

interface Seed {
  userId: string;
  sessionId: string;
  photoId: string;
  photoKey: string;
  productId: string;
  generationId: string;
  month: string;
}

interface SeedOptions {
  transient?: boolean;
  countsAgainstLimit?: boolean;
  promptText?: string | null;
  quotaUsed?: number;
  createdAt?: Date;
  status?: 'pending' | 'processing';
  // The paid call was already claimed (`started_at` set).
  sent?: boolean;
  // The photo's bytes; a good one by default.
  photo?: Buffer;
  withoutPhoto?: boolean;
}

// The real activities of `generateFitting`, on the throwaway database, the emulator and the fake
// provider, run by the workflow on the throwaway Temporal (spec 0019 plan §4, A20, A24, A47, A67).
describe('generateFitting with the real activities (spec 0019 T11)', () => {
  const settings = testTemporalSettings();
  let prisma: PrismaClient;
  let s3: S3Client;
  let storage: StorageService;
  let fake: FakeAiProvider;
  let worker: TestWorker;
  let connection: Connection;
  let client: Client;

  beforeAll(async () => {
    prisma = await createTestDatabase();
    s3 = createTestS3Client();
    storage = createTestStorageService();
    fake = new FakeAiProvider({ model: 'gpt-image-2', checkTimeoutMs: 4000, timeoutSeconds: 180 });
    worker = await startTestWorker(settings, storage, prisma, fake);
    connection = await Connection.connect({ address: settings.address });
    client = new Client({ connection, namespace: settings.namespace });
  }, 120_000);

  afterAll(async () => {
    await worker.stop();
    await connection.close();
    storage.onApplicationShutdown();
    s3.destroy();
    await prisma.$disconnect();
  });

  async function put(key: string, body: Buffer): Promise<void> {
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));
  }

  async function keysUnder(prefix: string): Promise<string[]> {
    const found = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
    return (found.Contents ?? []).map((object) => object.Key ?? '');
  }

  // A user with a session, a photo in the bucket (as a row too, unless `withoutPhoto`), a product
  // with a catalog image and a generation of them, as the start of a try-on leaves them (T12).
  async function seed(options: SeedOptions = {}): Promise<Seed> {
    const user = await prisma.user.create({
      data: { email: `user-${randomUUID()}@example.com`, emailVerified: true },
    });
    const userId = user.id;
    const session = await prisma.fittingSession.create({ data: { userId } });
    const photoKey = userPhotoKey(userId);
    await put(photoKey, options.photo ?? (await goodPhoto({ format: 'webp' })));
    const photo = await prisma.userPhoto.create({
      data: {
        userId,
        imageKey: photoKey,
        transient: options.transient ?? false,
        isDefault: !(options.transient ?? false),
        width: 64,
        height: 96,
      },
    });
    if (options.withoutPhoto === true) {
      await prisma.userPhoto.delete({ where: { id: photo.id } });
    }
    const brand = await prisma.brand.create({ data: { name: `Brand ${randomUUID()}` } });
    const category = await prisma.category.create({
      data: { name: `Category ${randomUUID()}`, slug: `c-${randomUUID()}`, isActive: true },
    });
    const product = await prisma.product.create({
      data: {
        article: `A-${randomUUID()}`,
        name: 'Платье',
        price: 1000,
        brandId: brand.id,
        categoryId: category.id,
      },
    });
    const imageKey = `test/${randomUUID()}.webp`;
    await put(mediaKey(imageKey), await goodPhoto({ format: 'webp', width: 80, height: 120 }));
    await prisma.productImage.create({ data: { productId: product.id, imageKey } });

    const createdAt = options.createdAt ?? new Date();
    const generation = await prisma.aiGeneration.create({
      data: {
        sessionId: session.id,
        userId,
        photoId: options.withoutPhoto === true ? null : photo.id,
        kind: 'single',
        promptText: options.promptText ?? null,
        fingerprint: createHash('sha256').update(randomUUID()).digest('hex'),
        status: options.status ?? 'pending',
        startedAt: options.sent === true ? new Date() : null,
        countsAgainstLimit: options.countsAgainstLimit ?? true,
        aiProvider: 'fake',
        aiModel: 'gpt-image-2',
        createdAt,
      },
    });
    await prisma.generationProduct.create({
      data: { generationId: generation.id, productId: product.id },
    });
    const month = quotaMonth(createdAt);
    await prisma.fittingQuota.create({
      data: { userId, month, used: options.quotaUsed ?? 1 },
    });
    return {
      userId,
      sessionId: session.id,
      photoId: photo.id,
      photoKey,
      productId: product.id,
      generationId: generation.id,
      month,
    };
  }

  function startRun(generationId: string) {
    return client.workflow.start('generateFitting', {
      taskQueue: settings.taskQueue,
      workflowId: fittingWorkflowId(generationId),
      workflowExecutionTimeout: '120 seconds',
      args: [{ generationId, timeoutSeconds: 30 }],
    });
  }

  async function run(generationId: string): Promise<void> {
    await (await startRun(generationId)).result();
  }

  const rowOf = (id: string) => prisma.aiGeneration.findUniqueOrThrow({ where: { id } });
  const usedOf = async (userId: string, month: string) =>
    (await prisma.fittingQuota.findUniqueOrThrow({ where: { userId_month: { userId, month } } }))
      .used;

  // Runs the workflow and returns the arguments of every call the fake model got.
  async function modelCallsOf(generationId: string): Promise<unknown[][]> {
    const spy = vi.spyOn(fake, 'generate');
    try {
      await run(generationId);
      return spy.mock.calls.map((call) => [...call]);
    } finally {
      spy.mockRestore();
    }
  }

  async function expectOutboxCleared(rowId: string): Promise<void> {
    await vi.waitFor(
      async () => expect(await prisma.fileDeletion.findMany({ where: { rowId } })).toEqual([]),
      { timeout: 30_000, interval: 250 },
    );
  }

  describe('a completed fitting', () => {
    it('writes the moderated result, sets its key and leaves the quota spent', async () => {
      const s = await seed();

      await run(s.generationId);

      const row = await rowOf(s.generationId);
      const resultKey = generationResultKey(s.userId, s.generationId);
      expect(row).toMatchObject({
        status: 'completed',
        resultImageKey: resultKey,
        failureCode: null,
        errorMessage: null,
        countsAgainstLimit: true,
        providerRequestId: null,
      });
      expect(row.startedAt).not.toBeNull();
      expect(row.finishedAt).not.toBeNull();
      expect(await keysUnder(generationFolder(s.userId, s.generationId))).toEqual([resultKey]);
      const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: resultKey }));
      const meta = await sharp(await object.Body?.transformToByteArray()).metadata();
      expect(meta).toMatchObject({ format: 'webp', width: 1024, height: 1536 });
      expect(await usedOf(s.userId, s.month)).toBe(1);
      expect(await prisma.userPhoto.findUnique({ where: { id: s.photoId } })).not.toBeNull();
    }, 60_000);

    it('changes nothing when the workflow runs again for the ended row', async () => {
      const s = await seed();
      await run(s.generationId);
      const before = await rowOf(s.generationId);

      await run(s.generationId);

      expect(await rowOf(s.generationId)).toEqual(before);
      expect(await usedOf(s.userId, s.month)).toBe(1);
    }, 60_000);

    it('ends quietly when the row is gone', async () => {
      await expect(run(randomUUID())).resolves.toBeUndefined();
    }, 60_000);

    it('continues a row a lost worker left in processing before the paid call', async () => {
      const s = await seed({ status: 'processing' });

      await run(s.generationId);

      expect(await rowOf(s.generationId)).toMatchObject({ status: 'completed' });
    }, 60_000);

    it('gives the model the deadline of the workflow input', async () => {
      const s = await seed();
      const modelCalls = await modelCallsOf(s.generationId);

      expect(modelCalls).toHaveLength(1);
      expect(modelCalls[0]?.[1]).toMatchObject({ timeoutMs: 30_000 });
    }, 60_000);

    it('never pays twice: a row whose call was claimed fails without calling the model', async () => {
      const s = await seed({ status: 'processing', sent: true, quotaUsed: 2 });
      expect(await modelCallsOf(s.generationId)).toEqual([]);
      expect(await rowOf(s.generationId)).toMatchObject({
        status: 'failed',
        failureCode: 'provider_error',
        countsAgainstLimit: false,
      });
      expect(await usedOf(s.userId, s.month)).toBe(1);
    }, 60_000);

    it('claims the call once: started_at is set by generate, not by markProcessing', async () => {
      const s = await seed({ status: 'pending' });
      expect((await rowOf(s.generationId)).startedAt).toBeNull();

      await run(s.generationId);

      expect((await rowOf(s.generationId)).startedAt).not.toBeNull();
    }, 60_000);

    // The loadJob guard on a photo outside the user's folder cannot be reached: the database
    // refuses such a row first.
    it("cannot hold a photo outside its user's folder", async () => {
      const s = await seed();

      await expectViolation(
        prisma.userPhoto.update({
          where: { id: s.photoId },
          data: { imageKey: userPhotoKey(randomUUID()) },
        }),
        'user_photos_image_key_check',
      );
    }, 60_000);
  });

  describe('a failed fitting gives its unit back once (A20)', () => {
    it.each([
      ['fail:provider_error', 'provider_error'],
      ['fail:timeout', 'model_timeout'],
      ['fail:moderation', 'moderation'],
    ] as const)(
      'the wishes %s end as %s, with no result object',
      async (promptText, failureCode) => {
        const s = await seed({ promptText, quotaUsed: 3 });

        await run(s.generationId);

        const row = await rowOf(s.generationId);
        expect(row).toMatchObject({
          status: 'failed',
          failureCode,
          countsAgainstLimit: false,
          resultImageKey: null,
        });
        expect(row.finishedAt).not.toBeNull();
        expect(await usedOf(s.userId, s.month)).toBe(2);
        expect(await keysUnder(generationFolder(s.userId, s.generationId))).toEqual([]);
      },
      60_000,
    );

    it('keeps the model error as a short message, without the photo or the text', async () => {
      const s = await seed({ promptText: 'fail:provider_error' });

      await run(s.generationId);

      const { errorMessage } = await rowOf(s.generationId);
      expect(errorMessage).toBe('OpenAI edit_image: http 500 server_error');
    }, 60_000);

    it('discards a result the moderation flagged and gives the unit back', async () => {
      const s = await seed({ photo: await refusedPhoto('moderation', { format: 'webp' }) });

      await run(s.generationId);

      expect(await rowOf(s.generationId)).toMatchObject({
        status: 'failed',
        failureCode: 'moderation',
        countsAgainstLimit: false,
        resultImageKey: null,
      });
      expect(await keysUnder(generationFolder(s.userId, s.generationId))).toEqual([]);
      expect(await usedOf(s.userId, s.month)).toBe(0);
    }, 60_000);

    it('takes nothing back for a fitting that did not count (a regeneration without a unit)', async () => {
      const s = await seed({ promptText: 'fail:provider_error', countsAgainstLimit: false });
      await prisma.fittingQuota.update({
        where: { userId_month: { userId: s.userId, month: s.month } },
        data: { used: 2 },
      });

      await run(s.generationId);

      expect(await rowOf(s.generationId)).toMatchObject({ status: 'failed' });
      expect(await usedOf(s.userId, s.month)).toBe(2);
    }, 60_000);

    it('takes the unit back from the month that paid it', async () => {
      const earlier = new Date('2026-09-15T12:00:00Z');
      const s = await seed({ promptText: 'fail:provider_error', createdAt: earlier, quotaUsed: 4 });
      const current = quotaMonth(new Date());
      await prisma.fittingQuota.upsert({
        where: { userId_month: { userId: s.userId, month: current } },
        create: { userId: s.userId, month: current, used: 5 },
        update: { used: 5 },
      });

      await run(s.generationId);

      expect(s.month).toBe('2026-09');
      expect(await usedOf(s.userId, '2026-09')).toBe(3);
      expect(await usedOf(s.userId, current)).toBe(5);
    }, 60_000);

    it('never takes the quota below zero', async () => {
      const s = await seed({ promptText: 'fail:provider_error', quotaUsed: 0 });

      await run(s.generationId);

      expect(await usedOf(s.userId, s.month)).toBe(0);
    }, 60_000);

    it("fails with provider_error when the fitting's photo was deleted while it waited", async () => {
      const s = await seed({ withoutPhoto: true });

      await run(s.generationId);

      expect(await rowOf(s.generationId)).toMatchObject({
        status: 'failed',
        failureCode: 'provider_error',
        errorMessage: "The fitting's photo is gone",
      });
      expect(await usedOf(s.userId, s.month)).toBe(0);
    }, 60_000);

    it("takes a regeneration's wishes from the original try-on, its comment from its own text", async () => {
      const original = await seed({ promptText: 'fail:moderation' });
      await run(original.generationId);
      const child = await prisma.aiGeneration.create({
        data: {
          sessionId: original.sessionId,
          userId: original.userId,
          photoId: original.photoId,
          parentId: original.generationId,
          kind: 'single',
          promptText: 'brighter please',
          fingerprint: createHash('sha256').update(randomUUID()).digest('hex'),
          status: 'pending',
          aiProvider: 'fake',
          aiModel: 'gpt-image-2',
        },
      });
      await prisma.generationProduct.create({
        data: { generationId: child.id, productId: original.productId },
      });

      await run(child.id);

      // The marker sits in the original's text only: the fake saw it as the wishes.
      expect(await rowOf(child.id)).toMatchObject({ status: 'failed', failureCode: 'moderation' });
    }, 90_000);
  });

  describe('a transient photo (A24)', () => {
    it('is deleted with its file after a completed fitting', async () => {
      const s = await seed({ transient: true });

      await run(s.generationId);

      expect(await prisma.userPhoto.findUnique({ where: { id: s.photoId } })).toBeNull();
      expect(await rowOf(s.generationId)).toMatchObject({ status: 'completed', photoId: null });
      await expectOutboxCleared(s.photoId);
      await vi.waitFor(async () => expect(await keysUnder(s.photoKey)).toEqual([]), {
        timeout: 30_000,
        interval: 250,
      });
    }, 90_000);

    it('is deleted with an outbox row after a failed fitting too', async () => {
      const s = await seed({ transient: true, promptText: 'fail:provider_error' });

      await run(s.generationId);

      expect(await prisma.userPhoto.findUnique({ where: { id: s.photoId } })).toBeNull();
      await expectOutboxCleared(s.photoId);
      await vi.waitFor(async () => expect(await keysUnder(s.photoKey)).toEqual([]), {
        timeout: 30_000,
        interval: 250,
      });
    }, 90_000);

    it('stays while another running generation uses it, and goes with the last one', async () => {
      const first = await seed({ transient: true });
      const second = await prisma.aiGeneration.create({
        data: {
          sessionId: first.sessionId,
          userId: first.userId,
          photoId: first.photoId,
          kind: 'single',
          fingerprint: createHash('sha256').update(randomUUID()).digest('hex'),
          status: 'pending',
          aiProvider: 'fake',
          aiModel: 'gpt-image-2',
        },
      });
      await prisma.generationProduct.create({
        data: { generationId: second.id, productId: first.productId },
      });

      await run(first.generationId);

      expect(await prisma.userPhoto.findUnique({ where: { id: first.photoId } })).not.toBeNull();
      expect(await prisma.fileDeletion.findMany({ where: { rowId: first.photoId } })).toEqual([]);
      expect(await keysUnder(first.photoKey)).toEqual([first.photoKey]);

      await run(second.id);

      expect(await prisma.userPhoto.findUnique({ where: { id: first.photoId } })).toBeNull();
      await expectOutboxCleared(first.photoId);
    }, 120_000);

    it('is not deleted at the end when it is a saved photo', async () => {
      const s = await seed({ transient: false, promptText: 'fail:provider_error' });

      await run(s.generationId);

      expect(await prisma.userPhoto.findUnique({ where: { id: s.photoId } })).not.toBeNull();
      expect(await prisma.fileDeletion.findMany({ where: { rowId: s.photoId } })).toEqual([]);
    }, 60_000);

    it("is kept past housekeeping's hour while a recent pending or processing generation uses it, and goes once that one is over a day old", async () => {
      const busy = await seed({ transient: true, status: 'processing' });
      const queued = await seed({ transient: true });
      const idle = await seed({ transient: true, promptText: 'fail:provider_error' });
      await prisma.aiGeneration.delete({ where: { id: idle.generationId } });
      // Stuck for more than a day: no longer holds its photo.
      const stale = await seed({
        transient: true,
        status: 'processing',
        createdAt: new Date(Date.now() - 25 * HOUR),
      });
      const old = new Date(Date.now() - 2 * HOUR);
      await prisma.userPhoto.updateMany({
        where: { id: { in: [busy.photoId, queued.photoId, idle.photoId, stale.photoId] } },
        data: { createdAt: old },
      });

      const result = await client.workflow.execute('housekeeping', {
        taskQueue: settings.taskQueue,
        workflowId: `housekeeping-test-${randomUUID()}`,
        workflowExecutionTimeout: '60 seconds',
      });

      expect(result).toMatchObject({ photosExpired: 2 });
      expect(await prisma.userPhoto.findUnique({ where: { id: busy.photoId } })).not.toBeNull();
      expect(await prisma.userPhoto.findUnique({ where: { id: queued.photoId } })).not.toBeNull();
      expect(await prisma.userPhoto.findUnique({ where: { id: idle.photoId } })).toBeNull();
      expect(await prisma.userPhoto.findUnique({ where: { id: stale.photoId } })).toBeNull();
    }, 90_000);
  });

  describe('complete, called by hand like a retry after a lost answer', () => {
    // `complete` outside the worker: no transient photo, so it needs no activity context.
    const activities = () =>
      createFittingActivities(
        new FakeAiProvider({ model: 'gpt-image-2', checkTimeoutMs: 4000, timeoutSeconds: 180 }),
        storage,
        prisma,
        settings.taskQueue,
      );
    const failedOutcome = {
      status: 'failed',
      failureCode: 'provider_error',
      errorMessage: 'x',
      providerRequestId: 'req_1',
    } as const;

    it('refunds once however many times it runs', async () => {
      const s = await seed({ quotaUsed: 3, status: 'processing' });

      await activities().complete(s.generationId, failedOutcome);
      await activities().complete(s.generationId, failedOutcome);
      await activities().complete(s.generationId, failedOutcome);

      expect(await usedOf(s.userId, s.month)).toBe(2);
      expect(await rowOf(s.generationId)).toMatchObject({
        status: 'failed',
        providerRequestId: 'req_1',
        countsAgainstLimit: false,
      });
    }, 30_000);

    it('does not turn an ended row into another outcome', async () => {
      const s = await seed({ quotaUsed: 2, status: 'processing' });
      await activities().complete(s.generationId, failedOutcome);

      await activities().complete(s.generationId, { status: 'completed', providerRequestId: null });

      expect(await rowOf(s.generationId)).toMatchObject({
        status: 'failed',
        failureCode: 'provider_error',
        resultImageKey: null,
      });
      expect(await usedOf(s.userId, s.month)).toBe(1);
    }, 30_000);

    it('keeps the unit of a cancelled fitting (A47)', async () => {
      const s = await seed({ quotaUsed: 2, status: 'processing' });

      await activities().complete(s.generationId, { ...failedOutcome, keepUnit: true });

      expect(await rowOf(s.generationId)).toMatchObject({
        status: 'failed',
        countsAgainstLimit: true,
      });
      expect(await usedOf(s.userId, s.month)).toBe(2);
    }, 30_000);

    it('does nothing for a row that is gone', async () => {
      const s = await seed({ quotaUsed: 2, status: 'processing' });
      await prisma.aiGeneration.delete({ where: { id: s.generationId } });

      await activities().complete(s.generationId, failedOutcome);

      expect(await usedOf(s.userId, s.month)).toBe(2);
    }, 30_000);
  });

  describe('a cancelled fitting (A47)', () => {
    async function startHung(s: Seed) {
      fake.delayMs = 60_000;
      const handle = await startRun(s.generationId);
      // `generate` claimed the paid call: it is now waiting in the fake model.
      await vi.waitFor(
        async () => {
          const row = await rowOf(s.generationId);
          expect(row.status).toBe('processing');
          expect(row.startedAt).not.toBeNull();
        },
        { timeout: 20_000, interval: 100 },
      );
      return handle;
    }

    it('ends a row still there as failed and spent, and the workflow as cancelled', async () => {
      const s = await seed({ quotaUsed: 2 });
      try {
        const handle = await startHung(s);
        await handle.cancel();
        const error = await handle.result().then(
          () => undefined,
          (caught: unknown) => caught,
        );
        expect(error).toBeInstanceOf(WorkflowFailedError);
        expect((await handle.describe()).status.name).toBe('CANCELLED');
      } finally {
        fake.delayMs = 0;
      }

      expect(await rowOf(s.generationId)).toMatchObject({
        status: 'failed',
        failureCode: 'provider_error',
        errorMessage: 'cancelled',
        countsAgainstLimit: true,
      });
      expect(await usedOf(s.userId, s.month)).toBe(2);
      expect(await keysUnder(generationFolder(s.userId, s.generationId))).toEqual([]);
    }, 90_000);

    it('touches nothing when the row was deleted first', async () => {
      const s = await seed({ quotaUsed: 2 });
      try {
        const handle = await startHung(s);
        await prisma.aiGeneration.delete({ where: { id: s.generationId } });
        await handle.cancel();
        await expect(handle.result()).rejects.toBeInstanceOf(WorkflowFailedError);
        expect((await handle.describe()).status.name).toBe('CANCELLED');
      } finally {
        fake.delayMs = 0;
      }

      expect(await usedOf(s.userId, s.month)).toBe(2);
      expect(await keysUnder(generationFolder(s.userId, s.generationId))).toEqual([]);
    }, 90_000);
  });
});
