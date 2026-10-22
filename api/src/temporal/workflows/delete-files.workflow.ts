import { ApplicationFailure, isCancellation, proxyActivities } from '@temporalio/workflow';

import type { FileActivities } from '../activities/files.activities.js';

// Retried with no attempt limit (spec 0011 M11): a deletion ends only when the files are gone. At
// most 20 s between attempts, so the files go within a minute of the storage coming back (AC10).
// The activity heartbeats before each request to the storage (spec 0019 A39): a worker that dies
// is noticed within the heartbeat timeout, a cancellation reaches the attempt at its next
// heartbeat, and a long folder that keeps heartbeating is not cut by startToClose. One request
// ends within the heartbeat timeout by the client's own limits (S3_CONNECTION_TIMEOUT_MS plus
// S3_SOCKET_TIMEOUT_MS, 15 s, times the SDK's three attempts: 45 s, under the 48 s the SDK may
// hold a heartbeat), so the timeout fires only for a dead worker; raising those two limits means
// raising this timeout with them.
const { deletePrefix } = proxyActivities<FileActivities>({
  startToCloseTimeout: '10 minutes',
  heartbeatTimeout: '1 minute',
  retry: { initialInterval: '1 second', backoffCoefficient: 2, maximumInterval: '20 seconds' },
});

// The outbox row goes once every folder is gone (spec 0019 A38): a short database write, retried
// until the database answers.
const { completeFileDeletion } = proxyActivities<FileActivities>({
  startToCloseTimeout: '30 seconds',
  retry: { initialInterval: '1 second', backoffCoefficient: 2, maximumInterval: '20 seconds' },
});

export interface DeleteFilesInput {
  // Folders of keys.ts (userFolders, generationFolder) or photos' keys (userPhotoKey); the
  // activity refuses any other prefix.
  prefixes: string[];
  // The row of `file_deletions` this run empties, deleted at the end. Absent in the histories of
  // workflows started before the outbox (spec 0011), which add no command for it.
  deletionId?: string;
}

// Folders deleted at once. A session's deletion carries one folder per generation: all of them at
// once could pass the server's limit of pending activities (2,000) and leave the workflow stuck.
const BATCH_SIZE = 20;

// Deletes the files of a deleted user, session, generation or photo (spec 0011 plan §4, spec 0019
// A38), started by FileDeletion after the row is gone or by the housekeeping schedule. Each folder
// is deleted by an activity of its own. A refused folder (InvalidPrefix) stops none of the others:
// the workflow fails only after every batch, with how many failed and no paths (M33), and keeps
// the outbox row as the trace of what was not deleted.
export async function deleteFiles({ prefixes, deletionId }: DeleteFilesInput): Promise<void> {
  let failed = 0;
  for (let start = 0; start < prefixes.length; start += BATCH_SIZE) {
    const results = await Promise.allSettled(
      prefixes.slice(start, start + BATCH_SIZE).map((prefix) => deletePrefix(prefix)),
    );
    const rejected = results.filter((result) => result.status === 'rejected');
    // A cancelled workflow ends as cancelled, not as failed folders.
    const cancelled = rejected.find((result) => isCancellation(result.reason));
    if (cancelled) {
      throw cancelled.reason;
    }
    failed += rejected.length;
  }
  if (failed > 0) {
    throw ApplicationFailure.nonRetryable(
      `${failed} of ${prefixes.length} folders were not deleted`,
      'FoldersNotDeleted',
    );
  }
  if (deletionId !== undefined) {
    await completeFileDeletion(deletionId);
  }
}
