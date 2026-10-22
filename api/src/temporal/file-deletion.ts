import { Injectable, Logger } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { deleteFilesWorkflowId, type QueuedFileDeletion } from './file-deletion-id.js';
import type { deleteFiles } from './workflows/delete-files.workflow.js';
import { WorkflowStarter } from './workflow-starter.js';

export type { FileDeletionKind, QueuedFileDeletion } from './file-deletion-id.js';

// Deletes the files of a deleted row through Temporal (spec 0011 M11) by way of the outbox
// `file_deletions` (spec 0019 A38, plan §4): `enqueue` writes the row inside the delete's
// transaction, so a deletion is never lost between the commit and the workflow's start (0011 M27);
// `start` runs after the commit and never throws, so the delete answers 204 even with Temporal
// down. A row left unstarted (the api killed or Temporal down in between) is started by the
// schedule `fitting-housekeeping` within about eleven minutes (a minute of age, then its
// ten-minute interval), and the workflow deletes the row when every folder is gone.
@Injectable()
export class FileDeletion {
  private readonly logger = new Logger(FileDeletion.name);

  constructor(
    private readonly starter: WorkflowStarter,
    private readonly prisma: PrismaService,
  ) {}

  // In the caller's transaction, after its row's delete. `prefixes` are folders of keys.ts
  // (userFolders, generationFolder) or photos' keys (userPhotoKey); none writes nothing (the
  // table refuses an empty list) and returns null.
  async enqueue(
    tx: Prisma.TransactionClient,
    kind: QueuedFileDeletion['kind'],
    rowId: string,
    prefixes: string[],
  ): Promise<QueuedFileDeletion | null> {
    if (prefixes.length === 0) {
      return null;
    }
    const row = await tx.fileDeletion.create({
      data: { kind, rowId, prefixes },
      select: { id: true, kind: true, rowId: true, prefixes: true },
    });
    return row;
  }

  // After the commit: starts the workflow and marks the row started. A failed start or mark is
  // logged with the kind and the id (no storage paths, spec 0011 M32) and left to the schedule,
  // which starts the row again under the same id (a running workflow is kept); nothing is
  // reported to Sentry, since nothing is lost and a Temporal outage shows in /health/ready. A row
  // the workflow already deleted (a quick run) is marked on no row, which is fine.
  async start(deletion: QueuedFileDeletion | null): Promise<void> {
    if (deletion === null) {
      return;
    }
    const { id, kind, rowId, prefixes } = deletion;
    try {
      await this.starter.start<typeof deleteFiles>('deleteFiles', {
        workflowId: deleteFilesWorkflowId(kind, rowId),
        args: [{ prefixes, deletionId: id }],
      });
    } catch (error) {
      this.logger.warn({
        msg: 'Could not start the deletion of files; the housekeeping schedule starts it',
        err: error,
        kind,
        id: rowId,
      });
      return;
    }
    try {
      await this.prisma.fileDeletion.updateMany({
        where: { id, startedAt: null },
        data: { startedAt: new Date() },
      });
    } catch (error) {
      this.logger.warn({
        msg: 'The deletion of files started but its row was not marked; the housekeeping schedule starts it again',
        err: error,
        kind,
        id: rowId,
      });
    }
  }
}
