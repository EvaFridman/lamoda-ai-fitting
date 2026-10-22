import { ApplicationFailure, Context } from '@temporalio/activity';

import type { PrismaClient } from '../../generated/prisma/client.js';
import { isDeletablePrefix } from '../../storage/keys.js';
import type { StorageService } from '../../storage/storage.service.js';

export type FileActivities = ReturnType<typeof createFileActivities>;

// The activities of the users' files (spec 0011 plan §4, spec 0019 A38); `storage` and `prisma`
// come from the worker's Nest context.
export function createFileActivities(storage: StorageService, prisma: PrismaClient) {
  return {
    // Deletes one folder, or one photo by its key, and returns how many files it held. A prefix of
    // another shape will never pass, so it fails at once instead of being retried without end
    // (deleteFiles goes on with the other folders and fails after them, M33); a failed request to
    // the storage (StorageError) is retried.
    async deletePrefix(prefix: string): Promise<number> {
      if (!isDeletablePrefix(prefix)) {
        // No prefix in the message: it holds a user's id.
        throw ApplicationFailure.nonRetryable(
          "deletePrefix takes only a user's or a generation's folder or a photo's key",
          'InvalidPrefix',
        );
      }
      const context = Context.current();
      // A heartbeat before each request to the storage (spec 0019 A39): a dead worker is noticed
      // within the workflow's heartbeat timeout, and a cancellation comes back in the answer to a
      // heartbeat (the SDK sends the first at once and then at most one per 80 % of that timeout,
      // so it may reach a short attempt only at its end). A cancelled or timed-out attempt stops its request once the worker learns of
      // it and then throws the cancellation (CancelledFailure), not the StorageError of the stopped
      // request: sentryActivityInterceptor reports no cancellation. The worker always aborts the
      // signal with a CancelledFailure as its reason (SDK 1.24, `@temporalio/worker` activity.js).
      const signal = context.cancellationSignal;
      try {
        return await storage.deletePrefix(prefix, signal, (deleted) => {
          context.heartbeat(deleted);
        });
      } catch (error) {
        throw signal.aborted ? (signal.reason ?? error) : error;
      }
    },

    // Deletes the outbox row of a deletion whose folders are all gone (spec 0019 A38). A repeat
    // (a retry after a lost answer) finds no row and does nothing.
    async completeFileDeletion(deletionId: string): Promise<void> {
      await prisma.fileDeletion.deleteMany({ where: { id: deletionId } });
    },
  };
}
