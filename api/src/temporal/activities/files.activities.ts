import { ApplicationFailure, Context } from '@temporalio/activity';

import { isDeletableFolder } from '../../storage/keys.js';
import type { StorageService } from '../../storage/storage.service.js';

export type FileActivities = ReturnType<typeof createFileActivities>;

// The activities of the users' files (spec 0011 plan §4); `storage` comes from the worker's Nest
// context.
export function createFileActivities(storage: StorageService) {
  return {
    // Deletes one folder and returns how many files it held. A prefix of another shape will never
    // pass, so it fails at once instead of being retried without end (deleteFiles goes on with the
    // other folders and fails after them, M33); a failed request to the storage (StorageError) is
    // retried.
    async deletePrefix(prefix: string): Promise<number> {
      if (!isDeletableFolder(prefix)) {
        // No prefix in the message: it holds a user's id.
        throw ApplicationFailure.nonRetryable(
          "deletePrefix takes only a user's or a generation's folder",
          'InvalidPrefix',
        );
      }
      // A cancelled or timed-out attempt stops its request once the worker learns of it; with no
      // heartbeat, a workflow's cancellation is not seen and the attempt runs on (at most 30 s). It
      // then throws the cancellation (CancelledFailure), not the StorageError of the stopped
      // request: sentryActivityInterceptor reports no cancellation. The worker always aborts the
      // signal with a CancelledFailure as its reason (SDK 1.24, `@temporalio/worker` activity.js).
      const signal = Context.current().cancellationSignal;
      try {
        return await storage.deletePrefix(prefix, signal);
      } catch (error) {
        throw signal.aborted ? (signal.reason ?? error) : error;
      }
    },
  };
}
