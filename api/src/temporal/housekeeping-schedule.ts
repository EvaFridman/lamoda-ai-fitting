import { type ScheduleClient, ScheduleOverlapPolicy } from '@temporalio/client';

import { ensureSchedule, type ScheduleOptions } from './schedules.js';

export const HOUSEKEEPING_SCHEDULE_ID = 'fitting-housekeeping';

// The schedule of the fitting's housekeeping (spec 0019 A38, plan §4): every 10 minutes, a run of
// at most 8 minutes (below the interval, so a run cut by its timeout never makes the next one
// skipped as overlapping), an overlapping run skipped. Its workflow starts the outbox's unstarted
// deletions and deletes the transient photos left unused (A24).
export function housekeepingSchedule(taskQueue: string): ScheduleOptions {
  return {
    spec: { intervals: [{ every: '10 minutes' }] },
    action: {
      type: 'startWorkflow',
      workflowType: 'housekeeping',
      workflowId: HOUSEKEEPING_SCHEDULE_ID,
      taskQueue,
      workflowExecutionTimeout: '8 minutes',
    },
    policies: { overlap: ScheduleOverlapPolicy.SKIP },
  };
}

// Called by the worker at start (schedules.ts): creates the schedule, or brings an existing one to
// the settings above (spec 0013 N50).
export function ensureHousekeepingSchedule(
  schedules: ScheduleClient,
  taskQueue: string,
): Promise<'created' | 'updated'> {
  return ensureSchedule(schedules, HOUSEKEEPING_SCHEDULE_ID, housekeepingSchedule(taskQueue));
}
