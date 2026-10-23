import type { Client } from '@temporalio/client';

import type { PrismaClient } from '../../generated/prisma/client.js';
import { deleteFilesWorkflowId, type QueuedFileDeletion } from '../file-deletion-id.js';
import type { deleteFiles } from '../workflows/delete-files.workflow.js';

// Starts the deletion's workflow under the same id as the api would (a running one is kept,
// USE_EXISTING; a closed one with that id runs again, which is harmless: the deletion is
// idempotent) and marks the row started. A row the workflow already deleted is marked on no row.
// `client` is the worker's (`Context.current().client`): it closes after every running activity
// has ended. Shared by the housekeeping schedule and a fitting's `complete` (spec 0019 A38, A24).
export async function startFileDeletion(
  client: Client,
  prisma: PrismaClient,
  taskQueue: string,
  { id, kind, rowId, prefixes }: QueuedFileDeletion,
): Promise<void> {
  await client.workflow.start<typeof deleteFiles>('deleteFiles', {
    workflowId: deleteFilesWorkflowId(kind, rowId),
    taskQueue,
    workflowIdConflictPolicy: 'USE_EXISTING',
    args: [{ prefixes, deletionId: id }],
  });
  await prisma.fileDeletion.updateMany({
    where: { id, startedAt: null },
    data: { startedAt: new Date() },
  });
}
