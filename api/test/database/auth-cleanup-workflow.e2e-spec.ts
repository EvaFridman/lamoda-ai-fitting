import { randomUUID } from 'node:crypto';

import { Client, Connection } from '@temporalio/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type { StorageService } from '../../src/storage/storage.service.js';
import { createTestDatabase } from '../support/test-database.js';
import { createTestStorageService } from '../support/test-storage.js';
import {
  startTestWorker,
  startTestWorkerWith,
  testTemporalSettings,
  type TestWorker,
} from '../support/test-temporal.js';

describe('deleteExpiredAuthRows workflow (Temporal)', () => {
  const real = testTemporalSettings();
  const stubbed = testTemporalSettings();
  const attempts = vi.fn<() => Promise<{ sessions: number; verifications: number }>>();
  const failing = testTemporalSettings();
  const alwaysFails = vi.fn<() => Promise<never>>(() => Promise.reject(new Error('database down')));
  let prisma: PrismaClient;
  let storage: StorageService;
  let connection: Connection;
  let client: Client;
  let workers: TestWorker[] = [];

  beforeAll(async () => {
    prisma = await createTestDatabase();
    storage = createTestStorageService();
    connection = await Connection.connect({ address: real.address });
    client = new Client({ connection, namespace: real.namespace });
    workers = [
      await startTestWorker(real, storage, prisma),
      await startTestWorkerWith(stubbed, { deleteExpiredAuthRows: attempts }),
      await startTestWorkerWith(failing, { deleteExpiredAuthRows: alwaysFails }),
    ];
  }, 120_000);

  afterAll(async () => {
    await Promise.all(workers.map((worker) => worker.stop()));
    await connection.close();
    await storage.onApplicationShutdown();
    await prisma.$disconnect();
  });

  function run(taskQueue: string): Promise<unknown> {
    return client.workflow.execute('deleteExpiredAuthRows', {
      taskQueue,
      workflowId: `delete-expired-auth-rows-${randomUUID()}`,
    });
  }

  it('deletes the expired rows through the real activity and returns its counts', async () => {
    await prisma.$executeRaw`
      INSERT INTO verifications (identifier, value, expires_at)
      SELECT gen_random_uuid()::text, 'v', now() - interval '1 hour' FROM generate_series(1, 3)`;
    await prisma.$executeRaw`
      INSERT INTO verifications (identifier, value, expires_at)
      VALUES ('live', 'v', now() + interval '1 hour')`;

    await expect(run(real.taskQueue)).resolves.toEqual({ sessions: 0, verifications: 3 });

    expect(await prisma.verification.count()).toBe(1);
  });

  it('retries a failing activity and returns the result of the successful attempt', async () => {
    attempts
      .mockRejectedValueOnce(new Error('database down'))
      .mockResolvedValueOnce({ sessions: 7, verifications: 2 });

    await expect(run(stubbed.taskQueue)).resolves.toEqual({ sessions: 7, verifications: 2 });

    expect(attempts).toHaveBeenCalledTimes(2);
  }, 30_000);

  // 25 attempts with the real backoff (1 s doubling up to 1 minute) take about 20 minutes, so the
  // limit is read from the activity's retry policy in the history instead of being waited out.
  it('schedules the activity with a limit of 25 attempts and the timeouts of the plan', async () => {
    const handle = await client.workflow.start('deleteExpiredAuthRows', {
      taskQueue: failing.taskQueue,
      workflowId: `delete-expired-auth-rows-${randomUUID()}`,
    });
    try {
      await vi.waitFor(() => expect(alwaysFails).toHaveBeenCalled(), { timeout: 20_000 });

      const history = await handle.fetchHistory();
      const scheduled = history.events
        ?.map((event) => event.activityTaskScheduledEventAttributes)
        .find((attributes) => attributes);
      expect(scheduled?.activityType?.name).toBe('deleteExpiredAuthRows');
      expect(scheduled?.retryPolicy?.maximumAttempts).toBe(25);
      expect(scheduled?.retryPolicy?.backoffCoefficient).toBe(2);
      expect(Number(scheduled?.retryPolicy?.initialInterval?.seconds)).toBe(1);
      expect(Number(scheduled?.retryPolicy?.maximumInterval?.seconds)).toBe(60);
      expect(Number(scheduled?.startToCloseTimeout?.seconds)).toBe(30 * 60);
      expect(Number(scheduled?.heartbeatTimeout?.seconds)).toBe(60);
    } finally {
      await handle.terminate('test finished');
    }
  }, 30_000);
});
