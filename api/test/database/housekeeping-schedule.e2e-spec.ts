import { randomUUID } from 'node:crypto';

import {
  Client,
  Connection,
  ScheduleClient,
  ScheduleNotFoundError,
  ScheduleOverlapPolicy,
} from '@temporalio/client';
import { NativeConnection } from '@temporalio/worker';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  HOUSEKEEPING_SCHEDULE_ID,
  ensureHousekeepingSchedule,
  housekeepingSchedule,
} from '../../src/temporal/housekeeping-schedule.js';
import { createTestDatabase } from '../support/test-database.js';
import { createTestStorageService } from '../support/test-storage.js';
import { startTestWorker, testTemporalSettings } from '../support/test-temporal.js';

// The schedule's id is fixed and the server is shared: this is the only file that touches it, and
// each test starts without one.
describe('housekeeping schedule (Temporal)', () => {
  const settings = testTemporalSettings();
  let connection: Connection;
  let client: Client;

  async function removeSchedule(): Promise<void> {
    try {
      await client.schedule.getHandle(HOUSEKEEPING_SCHEDULE_ID).delete();
    } catch (error) {
      if (!(error instanceof ScheduleNotFoundError)) {
        throw error;
      }
    }
  }

  beforeAll(async () => {
    connection = await Connection.connect({ address: settings.address });
    client = new Client({ connection, namespace: settings.namespace });
  });

  beforeEach(removeSchedule);

  afterAll(async () => {
    await removeSchedule();
    await connection.close();
  });

  it('creates the schedule every 10 minutes that starts the workflow and skips overlaps', async () => {
    const taskQueue = `housekeeping-${randomUUID()}`;

    await expect(ensureHousekeepingSchedule(client.schedule, taskQueue)).resolves.toBe('created');

    const description = await client.schedule.getHandle(HOUSEKEEPING_SCHEDULE_ID).describe();
    expect(description.spec.intervals).toHaveLength(1);
    expect(description.spec.intervals?.[0]?.every).toBe(10 * 60 * 1000);
    expect(description.action).toMatchObject({
      type: 'startWorkflow',
      workflowType: 'housekeeping',
      workflowId: HOUSEKEEPING_SCHEDULE_ID,
      taskQueue,
    });
    expect(description.action.workflowExecutionTimeout).toBe(8 * 60 * 1000);
    expect(description.policies.overlap).toBe(ScheduleOverlapPolicy.SKIP);
    expect(description.state.paused).toBe(false);
  });

  it('a second call updates the schedule and resets a changed spec', async () => {
    await ensureHousekeepingSchedule(client.schedule, `housekeeping-${randomUUID()}`);
    const handle = client.schedule.getHandle(HOUSEKEEPING_SCHEDULE_ID);
    await handle.update((previous) => ({
      ...previous,
      spec: { intervals: [{ every: '1 hour' }] },
      action: { ...previous.action, workflowExecutionTimeout: '5 minutes' },
      policies: { ...previous.policies, overlap: ScheduleOverlapPolicy.ALLOW_ALL },
    }));
    const changed = await handle.describe();
    expect(changed.spec.intervals?.[0]?.every).toBe(60 * 60 * 1000);
    expect(changed.policies.overlap).toBe(ScheduleOverlapPolicy.ALLOW_ALL);

    const nextQueue = `housekeeping-${randomUUID()}`;
    await expect(ensureHousekeepingSchedule(client.schedule, nextQueue)).resolves.toBe('updated');

    const description = await handle.describe();
    expect(description.spec.intervals?.[0]?.every).toBe(10 * 60 * 1000);
    expect(description.action).toMatchObject({ taskQueue: nextQueue });
    expect(description.action.workflowExecutionTimeout).toBe(8 * 60 * 1000);
    expect(description.policies.overlap).toBe(ScheduleOverlapPolicy.SKIP);
  });

  it('keeps a pause and its note when it updates', async () => {
    await ensureHousekeepingSchedule(client.schedule, `housekeeping-${randomUUID()}`);
    const handle = client.schedule.getHandle(HOUSEKEEPING_SCHEDULE_ID);
    await handle.pause('maintenance');

    await expect(
      ensureHousekeepingSchedule(client.schedule, `housekeeping-${randomUUID()}`),
    ).resolves.toBe('updated');

    const { state } = await handle.describe();
    expect(state.paused).toBe(true);
    expect(state.note).toBe('maintenance');
  });

  it('a triggered run starts the registered workflow on a worker and counts nothing to do', async () => {
    const prisma = await createTestDatabase();
    const workerSettings = testTemporalSettings();
    const storage = createTestStorageService();
    const worker = await startTestWorker(workerSettings, storage, prisma);
    const nativeConnection = await NativeConnection.connect({ address: workerSettings.address });
    try {
      const schedules = new ScheduleClient({
        connection: nativeConnection,
        namespace: workerSettings.namespace,
      });
      await ensureHousekeepingSchedule(schedules, workerSettings.taskQueue);
      const handle = client.schedule.getHandle(HOUSEKEEPING_SCHEDULE_ID);

      await handle.trigger();

      await vi.waitFor(
        async () => {
          const { info } = await handle.describe();
          expect(info.recentActions.length).toBeGreaterThan(0);
        },
        { timeout: 30_000, interval: 250 },
      );
      const { info } = await handle.describe();
      const action = info.recentActions[0]?.action;
      expect(action?.type).toBe('startWorkflow');
      const workflow = action?.type === 'startWorkflow' ? action.workflow : undefined;
      const result = await client.workflow
        .getHandle(workflow?.workflowId ?? '', workflow?.firstExecutionRunId)
        .result();
      expect(result).toEqual({
        photosExpired: expect.any(Number),
        deletionsStarted: expect.any(Number),
      });
    } finally {
      await nativeConnection.close();
      await worker.stop();
      storage.onApplicationShutdown();
      await prisma.$disconnect();
    }
  }, 120_000);

  it('rethrows an error other than an existing schedule', async () => {
    const failure = new Error('temporal unreachable');
    const schedules = {
      create: () => Promise.reject(failure),
    } as unknown as Client['schedule'];

    await expect(ensureHousekeepingSchedule(schedules, 'queue')).rejects.toBe(failure);
  });

  it('describes the schedule options from the task queue', () => {
    expect(housekeepingSchedule('q').action).toMatchObject({ taskQueue: 'q' });
  });
});
