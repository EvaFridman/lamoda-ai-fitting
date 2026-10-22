import {
  ScheduleAlreadyRunning,
  type ScheduleClient,
  type ScheduleUpdateOptions,
} from '@temporalio/client';

// The settings of a schedule, as the code is their source of truth (spec 0013 N50): everything
// but the state, which a pause set by hand keeps.
export type ScheduleOptions = Omit<ScheduleUpdateOptions, 'state'>;

// Called by the worker at start for each schedule: creates it, or brings an existing one to the
// code's settings (N50). A pause set by hand stays. Returns what was done, for the worker's log.
export async function ensureSchedule(
  schedules: ScheduleClient,
  scheduleId: string,
  options: ScheduleOptions,
): Promise<'created' | 'updated'> {
  try {
    await schedules.create({ scheduleId, ...options });
    return 'created';
  } catch (error) {
    if (!(error instanceof ScheduleAlreadyRunning)) {
      throw error;
    }
  }
  await schedules.getHandle(scheduleId).update((previous) => ({
    ...options,
    state: { paused: previous.state.paused, note: previous.state.note },
  }));
  return 'updated';
}
