import {
  ScheduleAlreadyRunning,
  type ScheduleClient,
  ScheduleOverlapPolicy,
  type ScheduleUpdateOptions,
} from '@temporalio/client';

export const AUTH_CLEANUP_SCHEDULE_ID = 'delete-expired-auth-rows';

// The schedule of the daily cleanup of expired sign-in rows (spec 0013 plan §12, N50): 03:00 in
// Moscow, a run of at most 1 hour, an overlapping run skipped.
export function authCleanupSchedule(taskQueue: string): Omit<ScheduleUpdateOptions, 'state'> {
  return {
    spec: { calendars: [{ hour: 3, minute: 0 }], timezone: 'Europe/Moscow' },
    action: {
      type: 'startWorkflow',
      workflowType: 'deleteExpiredAuthRows',
      workflowId: AUTH_CLEANUP_SCHEDULE_ID,
      taskQueue,
      workflowExecutionTimeout: '1 hour',
    },
    policies: { overlap: ScheduleOverlapPolicy.SKIP },
  };
}

// Called by the worker at start: creates the schedule, or brings an existing one to the settings
// above, since the code is their source of truth (N50). A pause set by hand stays. Returns what was
// done, for the worker's log.
export async function ensureAuthCleanupSchedule(
  schedules: ScheduleClient,
  taskQueue: string,
): Promise<'created' | 'updated'> {
  const options = authCleanupSchedule(taskQueue);
  try {
    await schedules.create({ scheduleId: AUTH_CLEANUP_SCHEDULE_ID, ...options });
    return 'created';
  } catch (error) {
    if (!(error instanceof ScheduleAlreadyRunning)) {
      throw error;
    }
  }
  await schedules.getHandle(AUTH_CLEANUP_SCHEDULE_ID).update((previous) => ({
    ...options,
    state: { paused: previous.state.paused, note: previous.state.note },
  }));
  return 'updated';
}
