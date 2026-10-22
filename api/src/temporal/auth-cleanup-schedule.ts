import { type ScheduleClient, ScheduleOverlapPolicy } from '@temporalio/client';

import { ensureSchedule, type ScheduleOptions } from './schedules.js';

export const AUTH_CLEANUP_SCHEDULE_ID = 'delete-expired-auth-rows';

// The schedule of the daily cleanup of expired sign-in rows (spec 0013 plan §12, N50): 03:00 in
// Moscow, a run of at most 1 hour, an overlapping run skipped.
export function authCleanupSchedule(taskQueue: string): ScheduleOptions {
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

// Called by the worker at start (schedules.ts): creates the schedule, or brings an existing one to
// the settings above (N50).
export function ensureAuthCleanupSchedule(
  schedules: ScheduleClient,
  taskQueue: string,
): Promise<'created' | 'updated'> {
  return ensureSchedule(schedules, AUTH_CLEANUP_SCHEDULE_ID, authCleanupSchedule(taskQueue));
}
