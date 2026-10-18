import { Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

import type { deleteFiles } from './workflows/delete-files.workflow.js';
import { WorkflowStarter } from './workflow-starter.js';

// What was deleted: part of the workflow id, so one row's deletion runs once at a time.
export type FileDeletionKind = 'user' | 'session' | 'generation';

// Deletes the files of a deleted row through Temporal (spec 0011 M11, plan §4). Called after the
// database delete has committed; never throws, so the delete answers 204 even with Temporal down.
@Injectable()
export class FileDeletion {
  private readonly logger = new Logger(FileDeletion.name);

  constructor(private readonly starter: WorkflowStarter) {}

  // `prefixes` are folders of keys.ts (userFolders, generationFolder); none starts nothing. A
  // failed start leaves the files: it is logged with the prefixes, so the owner can start the
  // deletion by hand (plan, Risks). Sentry gets only the kind and the id: no storage paths (spec
  // 0011 M32).
  async startFileDeletion(kind: FileDeletionKind, id: string, prefixes: string[]): Promise<void> {
    if (prefixes.length === 0) {
      return;
    }
    try {
      await this.starter.start<typeof deleteFiles>('deleteFiles', {
        workflowId: `delete-files-${kind}-${id}`,
        args: [{ prefixes }],
      });
    } catch (error) {
      this.logger.error({
        msg: 'Could not start the deletion of files; they stay until it is started by hand',
        err: error,
        kind,
        id,
        prefixes,
      });
      Sentry.captureException(error, { extra: { kind, id } });
    }
  }
}
