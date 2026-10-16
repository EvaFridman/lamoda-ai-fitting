import { proxyActivities } from '@temporalio/workflow';

import type { FileActivities } from '../activities/files.activities.js';

// Retried with no attempt limit (spec 0011 M11): a deletion ends only when the files are gone. At
// most 20 s between attempts, so the files go within a minute of the storage coming back (AC10).
const { deletePrefix } = proxyActivities<FileActivities>({
  startToCloseTimeout: '30 seconds',
  retry: { initialInterval: '1 second', backoffCoefficient: 2, maximumInterval: '20 seconds' },
});

export interface DeleteFilesInput {
  // Folders of keys.ts (userFolders, generationFolder); the activity refuses any other prefix.
  prefixes: string[];
}

// Folders deleted at once. A session's deletion carries one folder per generation: all of them at
// once could pass the server's limit of pending activities (2,000) and leave the workflow stuck.
const BATCH_SIZE = 20;

// Deletes the files of a deleted user, session or generation (spec 0011 plan §4), started by
// FileDeletion after the row is gone. Each folder is deleted by an activity of its own.
export async function deleteFiles({ prefixes }: DeleteFilesInput): Promise<void> {
  for (let start = 0; start < prefixes.length; start += BATCH_SIZE) {
    await Promise.all(
      prefixes.slice(start, start + BATCH_SIZE).map((prefix) => deletePrefix(prefix)),
    );
  }
}
