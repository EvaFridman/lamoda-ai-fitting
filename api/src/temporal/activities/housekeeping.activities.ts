import { Context } from '@temporalio/activity';

import type { PrismaClient } from '../../generated/prisma/client.js';
import { deleteFilesWorkflowId, type QueuedFileDeletion } from '../file-deletion-id.js';
import type { deleteFiles } from '../workflows/delete-files.workflow.js';

export type HousekeepingActivities = ReturnType<typeof createHousekeepingActivities>;

// Rows one run takes of each kind; the rest waits for the next run, ten minutes later.
export const HOUSEKEEPING_BATCH_SIZE = 100;
// An outbox row younger than this may still be started by the api that wrote it (FileDeletion
// marks it after the workflow's start): the schedule leaves it alone.
export const UNSTARTED_DELETION_AGE_MS = 60_000;
// A one-time photo (spec 0019 A24) left unused goes after an hour.
export const TRANSIENT_PHOTO_AGE_MS = 60 * 60_000;

// The activities of the schedule `fitting-housekeeping` (spec 0019 A38, plan §4); `prisma` is the
// worker's PrismaService. `deleteFiles` is started through the worker's own client
// (`Context.current().client`, on its connection) on `taskQueue`, as the api's FileDeletion
// starts it.
export function createHousekeepingActivities(prisma: PrismaClient, taskQueue: string) {
  return {
    // Deletes the rows of transient photos older than an hour (A24), oldest first, one batch per
    // run, and writes their deletions into the outbox in the same transaction; returns them for
    // the workflow to start. An answer lost after the commit (a retry) finds the photos gone and
    // returns none: their outbox rows, younger than a minute, are started by the next run. (A
    // generation's photo is deleted by the generation, spec 0019 PR 3, which also keeps a running
    // generation's photo out of this batch once `photo_id` exists.)
    async expireTransientPhotos(): Promise<QueuedFileDeletion[]> {
      return prisma.$transaction(async (tx) => {
        const photos = await tx.userPhoto.findMany({
          where: {
            transient: true,
            createdAt: { lt: new Date(Date.now() - TRANSIENT_PHOTO_AGE_MS) },
          },
          orderBy: { createdAt: 'asc' },
          take: HOUSEKEEPING_BATCH_SIZE,
          select: { id: true, imageKey: true },
        });
        if (photos.length === 0) {
          return [];
        }
        await tx.userPhoto.deleteMany({ where: { id: { in: photos.map((photo) => photo.id) } } });
        return tx.fileDeletion.createManyAndReturn({
          data: photos.map((photo) => ({
            kind: 'photo',
            rowId: photo.id,
            prefixes: [photo.imageKey],
          })),
          select: { id: true, kind: true, rowId: true, prefixes: true },
        });
      });
    },

    // The outbox rows no api started (killed or with Temporal down between the commit and the
    // start), older than a minute, oldest first, one batch per run.
    async listUnstartedDeletions(): Promise<QueuedFileDeletion[]> {
      return prisma.fileDeletion.findMany({
        where: {
          startedAt: null,
          createdAt: { lt: new Date(Date.now() - UNSTARTED_DELETION_AGE_MS) },
        },
        orderBy: { createdAt: 'asc' },
        take: HOUSEKEEPING_BATCH_SIZE,
        select: { id: true, kind: true, rowId: true, prefixes: true },
      });
    },

    // Starts the deletion's workflow under the same id as the api would (a running one is kept,
    // USE_EXISTING; a closed one with that id runs again, which is harmless: the deletion is
    // idempotent) and marks the row started. A row the workflow already deleted is marked on no
    // row. The client is the worker's: it closes after every running activity has ended.
    async startFileDeletion(deletion: QueuedFileDeletion): Promise<void> {
      const { id, kind, rowId, prefixes } = deletion;
      await Context.current().client.workflow.start<typeof deleteFiles>('deleteFiles', {
        workflowId: deleteFilesWorkflowId(kind, rowId),
        taskQueue,
        workflowIdConflictPolicy: 'USE_EXISTING',
        args: [{ prefixes, deletionId: id }],
      });
      await prisma.fileDeletion.updateMany({
        where: { id, startedAt: null },
        data: { startedAt: new Date() },
      });
    },
  };
}
