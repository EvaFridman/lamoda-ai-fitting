import { Context } from '@temporalio/activity';

import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { deleteFilesWorkflowId, type QueuedFileDeletion } from '../file-deletion-id.js';
import type { deleteFiles } from '../workflows/delete-files.workflow.js';
import { endFitting, RUNNING_STATUSES } from '../../fittings/end-fitting.js';

export type HousekeepingActivities = ReturnType<typeof createHousekeepingActivities>;

// Rows one run takes of each kind; the rest waits for the next run, ten minutes later.
export const HOUSEKEEPING_BATCH_SIZE = 100;
// An outbox row younger than this may still be started by the api that wrote it (FileDeletion
// marks it after the workflow's start): the schedule leaves it alone.
export const UNSTARTED_DELETION_AGE_MS = 60_000;
// A one-time photo (spec 0019 A24) left unused goes after an hour, and so does one whose last
// generation ended an hour ago (A69: it stays for a regeneration while the try-on is open, which
// deletes it when it closes).
export const TRANSIENT_PHOTO_AGE_MS = 60 * 60_000;
// A running generation keeps its transient photo for at most this long: one stuck in `pending` or
// `processing` (a start that never reached Temporal, a workflow terminated by hand) does not keep
// a photo the user did not save for ever.
export const RUNNING_PHOTO_HOLD_MS = 24 * 60 * 60_000;

// A fitting still running this long after its start is stuck (spec 0019 A70): the longest one
// takes 11 minutes and a deploy holds the queue up to 12, so an hour means no workflow runs it
// (the api lost between the commit and the start, a workflow terminated by hand).
export const STUCK_FITTING_AGE_MS = 60 * 60_000;

// The activities of the schedule `fitting-housekeeping` (spec 0019 A38, plan §4); `prisma` is the
// worker's PrismaService. `deleteFiles` is started through the worker's own client
// (`Context.current().client`, on its connection) on `taskQueue`, as the api's FileDeletion
// starts it.
export function createHousekeepingActivities(prisma: PrismaClient, taskQueue: string) {
  return {
    // Ends the stuck fittings (A70), oldest first, one batch per run: `failed` `provider_error`,
    // so the fingerprint is free again. One whose paid call was never claimed gives its try-on
    // (or the free regeneration) back, as a failed start does; a workflow that runs it later finds
    // the row ended and pays nothing (markProcessing, `generate`'s claim). One claimed is left
    // while its call may still run (a worker back after a long outage may be paying for it right
    // now, and its result would be lost), and ended spent, as a cancel is (A47), once claimed an
    // hour ago. Returns how many it took; a repeat ends none twice.
    async endStuckFittings(): Promise<number> {
      const cutoff = new Date(Date.now() - STUCK_FITTING_AGE_MS);
      const stuck = await prisma.aiGeneration.findMany({
        where: {
          kind: { not: null },
          status: { in: [...RUNNING_STATUSES] },
          createdAt: { lt: cutoff },
          OR: [{ startedAt: null }, { startedAt: { lt: cutoff } }],
        },
        orderBy: { createdAt: 'asc' },
        take: HOUSEKEEPING_BATCH_SIZE,
        select: { id: true },
      });
      const outcome = {
        status: 'failed',
        failureCode: 'provider_error',
        errorMessage: 'stuck',
        providerRequestId: null,
      } as const;
      for (const { id } of stuck) {
        // The second call is a no-op once the first ended the row; a claim made between the read
        // and the first leaves the row to its workflow.
        await endFitting(prisma, id, outcome, { claimed: 'never' });
        await endFitting(
          prisma,
          id,
          { ...outcome, keepUnit: true },
          { claimed: { before: cutoff } },
        );
      }
      return stuck.length;
    },

    // Deletes the rows of transient photos older than an hour (A24) that no generation still
    // needs, oldest first, one batch per run, and writes their deletions into the outbox in the
    // same transaction; returns them for the workflow to start. An answer lost after the commit (a
    // retry) finds the photos gone and returns none: their outbox rows, younger than a minute, are
    // started by the next run. A photo stays while a running generation of the last day uses it (a
    // long queue at OpenAI may pass the hour) and for an hour after its last generation ended (a
    // regeneration from the open try-on, A69). The photos' users are locked, as a fitting's start
    // locks its user, and the photos checked again: a regeneration started between the two reads
    // keeps its photo.
    async expireTransientPhotos(): Promise<QueuedFileDeletion[]> {
      return prisma.$transaction(async (tx) => {
        const now = Date.now();
        const expired = {
          transient: true,
          createdAt: { lt: new Date(now - TRANSIENT_PHOTO_AGE_MS) },
          generations: {
            none: {
              OR: [
                {
                  status: { in: [...RUNNING_STATUSES] },
                  createdAt: { gt: new Date(now - RUNNING_PHOTO_HOLD_MS) },
                },
                { finishedAt: { gt: new Date(now - TRANSIENT_PHOTO_AGE_MS) } },
              ],
            },
          },
        } satisfies Prisma.UserPhotoWhereInput;
        const candidates = await tx.userPhoto.findMany({
          where: expired,
          orderBy: { createdAt: 'asc' },
          take: HOUSEKEEPING_BATCH_SIZE,
          select: { id: true, userId: true },
        });
        if (candidates.length === 0) {
          return [];
        }
        // In the order of their ids, so two runs never wait on each other's locks.
        const userIds = [...new Set(candidates.map((photo) => photo.userId))].sort();
        await tx.$queryRaw`SELECT id FROM users WHERE id = ANY(${userIds}::uuid[]) ORDER BY id FOR UPDATE`;
        const photos = await tx.userPhoto.findMany({
          where: { ...expired, id: { in: candidates.map((photo) => photo.id) } },
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
