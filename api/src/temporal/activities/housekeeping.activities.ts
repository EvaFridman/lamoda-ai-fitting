import { Context } from '@temporalio/activity';

import type { PrismaClient } from '../../generated/prisma/client.js';
import type { QueuedFileDeletion } from '../file-deletion-id.js';
import { RUNNING_STATUSES } from './fitting.activities.js';
import { startFileDeletion } from './start-file-deletion.js';

export type HousekeepingActivities = ReturnType<typeof createHousekeepingActivities>;

// Rows one run takes of each kind; the rest waits for the next run, ten minutes later.
export const HOUSEKEEPING_BATCH_SIZE = 100;
// An outbox row younger than this may still be started by the api that wrote it (FileDeletion
// marks it after the workflow's start): the schedule leaves it alone.
export const UNSTARTED_DELETION_AGE_MS = 60_000;
// A one-time photo (spec 0019 A24) left unused goes after an hour.
export const TRANSIENT_PHOTO_AGE_MS = 60 * 60_000;
// A running generation keeps its transient photo for at most this long: one stuck in `pending` or
// `processing` (a start that never reached Temporal, a workflow terminated by hand) does not keep
// a photo the user did not save for ever.
export const RUNNING_PHOTO_HOLD_MS = 24 * 60 * 60_000;

// The activities of the schedule `fitting-housekeeping` (spec 0019 A38, plan §4); `prisma` is the
// worker's PrismaService. `deleteFiles` is started through the worker's own client
// (`Context.current().client`, on its connection) on `taskQueue`, as the api's FileDeletion
// starts it.
export function createHousekeepingActivities(prisma: PrismaClient, taskQueue: string) {
  return {
    // Deletes the rows of transient photos older than an hour (A24), oldest first, one batch per
    // run, and writes their deletions into the outbox in the same transaction; returns them for
    // the workflow to start. An answer lost after the commit (a retry) finds the photos gone and
    // returns none: their outbox rows, younger than a minute, are started by the next run. A photo
    // a running generation of the last day uses stays (a long queue at OpenAI may pass the hour):
    // the generation's `complete` deletes it when it ends (fitting.activities.ts).
    async expireTransientPhotos(): Promise<QueuedFileDeletion[]> {
      return prisma.$transaction(async (tx) => {
        const photos = await tx.userPhoto.findMany({
          where: {
            transient: true,
            createdAt: { lt: new Date(Date.now() - TRANSIENT_PHOTO_AGE_MS) },
            generations: {
              none: {
                status: { in: [...RUNNING_STATUSES] },
                createdAt: { gt: new Date(Date.now() - RUNNING_PHOTO_HOLD_MS) },
              },
            },
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

    // Starts one deletion (start-file-deletion.ts) through the worker's own client.
    async startFileDeletion(deletion: QueuedFileDeletion): Promise<void> {
      await startFileDeletion(Context.current().client, prisma, taskQueue, deletion);
    },
  };
}
