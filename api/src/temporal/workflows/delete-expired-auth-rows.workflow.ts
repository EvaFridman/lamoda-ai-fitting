import { proxyActivities } from '@temporalio/workflow';

import type {
  AuthCleanupActivities,
  DeletedAuthRows,
} from '../activities/auth-cleanup.activities.js';

// Retried from 1 s up to 1 minute apart, at most 25 attempts, so a lasting failure ends the run as
// failed within the schedule's run timeout (1 hour, auth-cleanup-schedule.ts) and its last attempt
// reaches Sentry too (sentryActivityInterceptor sees only an attempt limit): about 20 minutes of
// waits, plus at most 1 minute per attempt that hangs (the heartbeat timeout). The next day's run
// deletes the rest (spec 0013 N50). A long pass that heartbeats is not cut by startToClose; two
// such passes failing at their end could reach the run timeout first, so that run's last attempt
// would not be reported (accepted: a day's rows take seconds).
const { deleteExpiredAuthRows: deleteRows } = proxyActivities<AuthCleanupActivities>({
  startToCloseTimeout: '30 minutes',
  heartbeatTimeout: '1 minute',
  retry: {
    initialInterval: '1 second',
    backoffCoefficient: 2,
    maximumInterval: '1 minute',
    maximumAttempts: 25,
  },
});

// Deletes expired sessions and sign-in states once a day (spec 0013 plan §12, N27), started by the
// schedule the worker creates. Returns how many rows went, shown in the run's history.
export async function deleteExpiredAuthRows(): Promise<DeletedAuthRows> {
  return deleteRows();
}
