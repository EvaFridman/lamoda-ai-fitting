import { ApplicationFailure, isCancellation, patched, proxyActivities } from '@temporalio/workflow';

import type { HousekeepingActivities } from '../activities/housekeeping.activities.js';
import type { QueuedFileDeletion } from '../file-deletion-id.js';

// Every attempt is bounded by the worker's database limits (PrismaService: 2 s to get a
// connection, 5 s per statement) or by one gRPC start, so 10 s per attempt is above what a live
// attempt takes, and the run's worst case stays within the schedule's run timeout (8 minutes,
// housekeeping-schedule.ts): the two reads, 5 attempts and 15 s of waits each (130 s), then ten
// batches of starts, 3 attempts and 3 s of waits each (330 s). A run with the database down ends as
// failed and its last attempt reaches Sentry (sentryActivityInterceptor sees only an attempt
// limit); the next run, ten minutes later, takes what is left. The stuck fittings' step (T12) has
// one attempt of 10 s (470 s in all): what it leaves, an attempt cut short included (each fitting
// ends in its own transaction, once), the next run ends.
const { expireTransientPhotos, listUnstartedDeletions } = proxyActivities<HousekeepingActivities>({
  startToCloseTimeout: '10 seconds',
  retry: {
    initialInterval: '1 second',
    backoffCoefficient: 2,
    maximumInterval: '30 seconds',
    maximumAttempts: 5,
  },
});

const { endStuckFittings } = proxyActivities<HousekeepingActivities>({
  startToCloseTimeout: '10 seconds',
  retry: { maximumAttempts: 1 },
});

// One start per row: a short call the worker's client already retries, then one database write.
const { startFileDeletion } = proxyActivities<HousekeepingActivities>({
  startToCloseTimeout: '10 seconds',
  retry: {
    initialInterval: '1 second',
    backoffCoefficient: 2,
    maximumInterval: '10 seconds',
    maximumAttempts: 3,
  },
});

export interface HousekeepingResult {
  // Absent in the runs of a worker from before spec 0019 T12, and when the step failed.
  fittingsEnded?: number;
  photosExpired: number;
  deletionsStarted: number;
}

// The patch of T12's first step: a run that started on the previous worker (a deploy replaces it
// in place) replays without it. Remove once no such run can be open (a run lasts at most 8
// minutes), with deprecatePatch first.
export const END_STUCK_FITTINGS_PATCH = 'end-stuck-fittings';

// Deletions started at once, as deleteFiles batches its folders.
const BATCH_SIZE = 20;

// The run of the schedule `fitting-housekeeping` (spec 0019 A38, plan §4), every ten minutes:
// ends the fittings stuck for an hour (A70), deletes the transient photos left unused for an hour (A24), then starts every deletion of the
// outbox no api started, theirs included. One row whose start keeps failing stops none of the
// others: the run fails only after every batch, with how many were not started (as deleteFiles
// does with its folders, 0011 M33), and the next run tries them again. Returns the counts, shown
// in the run's history.
export async function housekeeping(): Promise<HousekeepingResult> {
  // A stuck fitting ends now, so its one-time photo expires an hour later, as after any other end
  // (A69). Its failure stops none of the steps after it (its attempt reaches Sentry); a
  // cancellation stops the run.
  let fittingsEnded: number | undefined;
  if (patched(END_STUCK_FITTINGS_PATCH)) {
    try {
      fittingsEnded = await endStuckFittings();
    } catch (error) {
      // Left out of the result, so a failed step does not read as none stuck.
      if (isCancellation(error)) throw error;
    }
  }
  const expired = await expireTransientPhotos();
  const unstarted = await listUnstartedDeletions();
  const deletions = new Map<string, QueuedFileDeletion>();
  for (const deletion of [...expired, ...unstarted]) {
    deletions.set(deletion.id, deletion);
  }
  const list = [...deletions.values()];
  let failed = 0;
  for (let start = 0; start < list.length; start += BATCH_SIZE) {
    // Not `.map(startFileDeletion)`: map's index and array would go into the activity's payload.
    const results = await Promise.allSettled(
      list.slice(start, start + BATCH_SIZE).map((deletion) => startFileDeletion(deletion)),
    );
    const rejected = results.filter((result) => result.status === 'rejected');
    // A cancelled run ends as cancelled, not as deletions not started.
    const cancelled = rejected.find((result) => isCancellation(result.reason));
    if (cancelled) {
      throw cancelled.reason;
    }
    failed += rejected.length;
  }
  if (failed > 0) {
    throw ApplicationFailure.nonRetryable(
      `${failed} of ${list.length} deletions were not started`,
      'DeletionsNotStarted',
    );
  }
  return { fittingsEnded, photosExpired: expired.length, deletionsStarted: list.length };
}
