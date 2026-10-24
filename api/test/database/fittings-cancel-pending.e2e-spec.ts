import { randomUUID } from 'node:crypto';

import { CancelledFailure, Client, WorkflowFailedError } from '@temporalio/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { FakeAiProvider } from '../../src/ai/ai-provider.js';
import { quotaMonth } from '../../src/fittings/quota-month.js';
import { userPhotoKey } from '../../src/storage/keys.js';
import { fittingWorkflowId } from '../../src/temporal/fitting-workflow-id.js';
import { signIn } from '../support/sign-in.js';
import { createTestApp, type TestApp } from '../support/test-app.js';
import { createTestStorageService } from '../support/test-storage.js';
import {
  startTestWorker,
  testTemporalSettings,
  type TestWorker,
} from '../support/test-temporal.js';

// A fitting deleted while it still waits for a worker (spec 0019 plan §4, A47, A68): the workflow
// was cancelled before it ran, and the worker that comes later must neither pay nor change the
// quota. The app and the worker share a task queue of this file's own.
describe('a pending fitting deleted before any worker ran it (A47, A68)', () => {
  const settings = testTemporalSettings();
  let testApp: TestApp;
  let client: Client;

  beforeAll(async () => {
    testApp = await createTestApp({ access: 'production', temporal: settings });
    client = testApp.app.get(Client);
  }, 120_000);

  afterAll(async () => {
    await testApp.close();
  });

  it('ends cancelled when the worker comes, never calls the model and keeps the unit spent', async () => {
    const prisma = testApp.prisma;
    const who = await signIn(testApp.app);
    const photo = await prisma.userPhoto.create({
      data: {
        userId: who.userId,
        imageKey: userPhotoKey(who.userId),
        transient: false,
        isDefault: true,
        width: 64,
        height: 96,
      },
    });
    const category = await prisma.category.create({
      data: {
        name: `Cancel ${randomUUID()}`,
        slug: `c-${randomUUID()}`,
        isActive: true,
        slot: 'top',
      },
    });
    const brand = await prisma.brand.create({ data: { name: `Brand ${randomUUID()}` } });
    const product = await prisma.product.create({
      data: {
        article: `C-${randomUUID()}`,
        name: 'Платье',
        price: 1000,
        brandId: brand.id,
        categoryId: category.id,
      },
    });
    const http = () => request(testApp.app.getHttpServer());

    const started = await http()
      .post('/fittings')
      .set({ Cookie: who.cookie })
      .send({ photoId: photo.id, kind: 'single', items: [{ productId: product.id }] });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    const id = (started.body as { id: string }).id;
    await http().delete(`/fittings/${id}`).set({ Cookie: who.cookie }).expect(204);

    const handle = client.workflow.getHandle(fittingWorkflowId(id));
    const history = await handle.fetchHistory();
    expect(
      (history.events ?? []).some((event) =>
        Boolean(event.workflowExecutionCancelRequestedEventAttributes),
      ),
    ).toBe(true);
    expect((await handle.describe()).status.name).toBe('RUNNING');

    const fake = new FakeAiProvider({
      model: 'gpt-image-2',
      checkTimeoutMs: 4000,
      timeoutSeconds: 180,
    });
    const generate = vi.spyOn(fake, 'generate');
    const storage = createTestStorageService();
    let worker: TestWorker | undefined;
    try {
      worker = await startTestWorker(settings, storage, prisma, fake);
      const error = await handle.result().then(
        () => undefined,
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(WorkflowFailedError);
      expect((error as WorkflowFailedError).cause).toBeInstanceOf(CancelledFailure);
      expect((await handle.describe()).status.name).toBe('CANCELLED');
    } finally {
      await worker?.stop();
      storage.onApplicationShutdown();
    }

    expect(generate).not.toHaveBeenCalled();
    expect(await prisma.aiGeneration.findUnique({ where: { id } })).toBeNull();
    const quota = await prisma.fittingQuota.findUniqueOrThrow({
      where: { userId_month: { userId: who.userId, month: quotaMonth(new Date()) } },
    });
    expect(quota.used).toBe(1);
  }, 180_000);
});
