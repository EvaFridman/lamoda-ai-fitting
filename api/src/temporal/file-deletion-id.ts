// Shared by the api's FileDeletion and the worker's housekeeping activity, which start the same
// workflow for a row of the outbox `file_deletions` (spec 0019 A38). No imports: workflow code may
// bundle it too.

// What was deleted: part of the workflow id, so one row's deletion runs once at a time. The same
// values as the database's `file_deletion_kind`.
export type FileDeletionKind = 'user' | 'session' | 'generation' | 'photo';

// A row of `file_deletions`: the folders (or a photo's key) left to delete for the row `rowId`.
export interface QueuedFileDeletion {
  id: string;
  kind: FileDeletionKind;
  rowId: string;
  prefixes: string[];
}

// The id of the `deleteFiles` workflow of one row's deletion; a repeat start with it while one runs
// is ignored (USE_EXISTING), so the api and the housekeeping schedule may both start it.
export function deleteFilesWorkflowId(kind: FileDeletionKind, rowId: string): string {
  return `delete-files-${kind}-${rowId}`;
}
