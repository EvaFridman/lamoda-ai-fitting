import { Context } from '@temporalio/activity';

import type { PrismaClient } from '../../generated/prisma/client.js';

export type AuthCleanupActivities = ReturnType<typeof createAuthCleanupActivities>;

export interface DeletedAuthRows {
  sessions: number;
  verifications: number;
}

// Rows deleted by one statement, so no statement holds many locks or runs long (spec 0013 N50).
export const AUTH_CLEANUP_BATCH_SIZE = 1000;

// The activity of the daily cleanup of expired sign-in rows (spec 0013 plan §12, N27); `prisma`
// is the worker's PrismaService.
export function createAuthCleanupActivities(prisma: PrismaClient) {
  // Deletes one batch of the table's expired rows and returns how many went. `now()` is the
  // database's clock, the one Better Auth's `expires_at` is compared with.
  const deleteBatch = {
    sessions: () => prisma.$executeRaw`
      DELETE FROM sessions WHERE id IN (
        SELECT id FROM sessions WHERE expires_at < now() LIMIT ${AUTH_CLEANUP_BATCH_SIZE}
      )`,
    verifications: () => prisma.$executeRaw`
      DELETE FROM verifications WHERE id IN (
        SELECT id FROM verifications WHERE expires_at < now() LIMIT ${AUTH_CLEANUP_BATCH_SIZE}
      )`,
  };

  return {
    // Deletes the expired `sessions` and `verifications` in batches until none is left and returns
    // how many rows of each went, counting the earlier attempts of the run from their last
    // heartbeat the SDK sent (it sends at most one per 48 s, so after a retry the counts may fall
    // short; they are only for the history). A repeat after a failed attempt finds only what is
    // still there; an old attempt still running beside it may make a batch come back short and end
    // the pass early, and the next day's run deletes the rest. It heartbeats after each batch; a
    // cancellation (the worker's shutdown at once, the server's in the answer to a sent heartbeat)
    // stops it before the next one.
    async deleteExpiredAuthRows(): Promise<DeletedAuthRows> {
      const context = Context.current();
      const previous = context.info.heartbeatDetails as DeletedAuthRows | undefined;
      const deleted: DeletedAuthRows = {
        sessions: previous?.sessions ?? 0,
        verifications: previous?.verifications ?? 0,
      };
      for (const table of ['sessions', 'verifications'] as const) {
        let count: number;
        do {
          context.cancellationSignal.throwIfAborted();
          count = await deleteBatch[table]();
          deleted[table] += count;
          context.heartbeat(deleted);
        } while (count === AUTH_CLEANUP_BATCH_SIZE);
      }
      return deleted;
    },
  };
}
