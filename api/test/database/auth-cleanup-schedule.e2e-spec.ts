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

import { createAuthCleanupActivities } from '../../src/temporal/activities/auth-cleanup.activities.js';
import {
  AUTH_CLEANUP_SCHEDULE_ID,
  authCleanupSchedule,
  ensureAuthCleanupSchedule,
} from '../../src/temporal/auth-cleanup-schedule.js';
import { createTestDatabase } from '../support/test-database.js';
import { startTestWorkerWith, testTemporalSettings } from '../support/test-temporal.js';

// The schedule's id is fixed and the server is shared: this is the only file that touches it, and
// each test starts without one.
describe('auth cleanup schedule (Temporal)', () => {
  const settings = testTemporalSettings();
  let connection: Connection;
  let client: Client;

  async function removeSchedule(): Promise<void> {
    try {
      await client.schedule.getHandle(AUTH_CLEANUP_SCHEDULE_ID).delete();
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

  it('creates the schedule at 03:00 Moscow time that starts the workflow and skips overlaps', async () => {
    const taskQueue = `cleanup-${randomUUID()}`;

    await expect(ensureAuthCleanupSchedule(client.schedule, taskQueue)).resolves.toBe('created');

    const description = await client.schedule.getHandle(AUTH_CLEANUP_SCHEDULE_ID).describe();
    expect(description.spec.timezone).toBe('Europe/Moscow');
    expect(description.spec.calendars).toHaveLength(1);
    expect(description.spec.calendars?.[0]).toMatchObject({
      hour: [{ start: 3, end: 3, step: 1 }],
      minute: [{ start: 0, end: 0, step: 1 }],
    });
    expect(description.action).toMatchObject({
      type: 'startWorkflow',
      workflowType: 'deleteExpiredAuthRows',
      workflowId: AUTH_CLEANUP_SCHEDULE_ID,
      taskQueue,
    });
    expect(description.action.workflowExecutionTimeout).toBe(60 * 60 * 1000);
    expect(description.policies.overlap).toBe(ScheduleOverlapPolicy.SKIP);
    expect(description.state.paused).toBe(false);
  });

  it('a second call updates the schedule and resets a changed spec', async () => {
    const taskQueue = `cleanup-${randomUUID()}`;
    await ensureAuthCleanupSchedule(client.schedule, taskQueue);
    const handle = client.schedule.getHandle(AUTH_CLEANUP_SCHEDULE_ID);
    await handle.update((previous) => ({
      ...previous,
      spec: { calendars: [{ hour: 5, minute: 0 }], timezone: 'UTC' },
      action: { ...previous.action, workflowExecutionTimeout: '5 minutes' },
      policies: { ...previous.policies, overlap: ScheduleOverlapPolicy.ALLOW_ALL },
    }));
    const changed = await handle.describe();
    expect(changed.policies.overlap).toBe(ScheduleOverlapPolicy.ALLOW_ALL);
    expect(changed.action.workflowExecutionTimeout).toBe(5 * 60 * 1000);

    const nextQueue = `cleanup-${randomUUID()}`;
    await expect(ensureAuthCleanupSchedule(client.schedule, nextQueue)).resolves.toBe('updated');

    const description = await handle.describe();
    expect(description.spec.timezone).toBe('Europe/Moscow');
    expect(description.spec.calendars?.[0]).toMatchObject({ hour: [{ start: 3, end: 3 }] });
    expect(description.action).toMatchObject({ taskQueue: nextQueue });
    expect(description.policies.overlap).toBe(ScheduleOverlapPolicy.SKIP);
    expect(description.action.workflowExecutionTimeout).toBe(60 * 60 * 1000);
  });

  it('a triggered run of the schedule starts the registered workflow, on a worker connection', async () => {
    const prisma = await createTestDatabase();
    const settings = testTemporalSettings();
    const worker = await startTestWorkerWith(settings, createAuthCleanupActivities(prisma));
    const nativeConnection = await NativeConnection.connect({ address: settings.address });
    try {
      const schedules = new ScheduleClient({
        connection: nativeConnection,
        namespace: settings.namespace,
      });
      await ensureAuthCleanupSchedule(schedules, settings.taskQueue);
      const handle = client.schedule.getHandle(AUTH_CLEANUP_SCHEDULE_ID);

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
      expect(result).toEqual({ sessions: expect.any(Number), verifications: expect.any(Number) });
    } finally {
      await nativeConnection.close();
      await worker.stop();
      await prisma.$disconnect();
    }
  }, 120_000);

  it('keeps a pause and its note when it updates', async () => {
    await ensureAuthCleanupSchedule(client.schedule, `cleanup-${randomUUID()}`);
    const handle = client.schedule.getHandle(AUTH_CLEANUP_SCHEDULE_ID);
    await handle.pause('maintenance');

    await expect(
      ensureAuthCleanupSchedule(client.schedule, `cleanup-${randomUUID()}`),
    ).resolves.toBe('updated');

    const { state } = await handle.describe();
    expect(state.paused).toBe(true);
    expect(state.note).toBe('maintenance');
  });

  it('rethrows an error other than an existing schedule', async () => {
    const failure = new Error('temporal unreachable');
    const schedules = {
      create: () => Promise.reject(failure),
    } as unknown as Client['schedule'];

    await expect(ensureAuthCleanupSchedule(schedules, 'queue')).rejects.toBe(failure);
  });

  it('describes the schedule options from the task queue', () => {
    expect(authCleanupSchedule('q').action).toMatchObject({ taskQueue: 'q' });
  });
});
