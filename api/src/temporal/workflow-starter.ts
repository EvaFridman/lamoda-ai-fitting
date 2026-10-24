import { setTimeout as delay } from 'node:timers/promises';

import { Inject, Injectable } from '@nestjs/common';
import {
  Client,
  Connection,
  isGrpcServiceError,
  isRetryableError,
  ServiceError,
  type Workflow,
  WorkflowNotFoundError,
  type WorkflowStartOptions,
} from '@temporalio/client';

import { TEMPORAL_SETTINGS, type TemporalSettings } from './temporal-settings.js';

// The longest a start may take, retries included: a request that starts a workflow waits for it,
// so REQUEST_TIMEOUT_MS stays above it (spec 0011 M26).
export const START_TIMEOUT_MS = 5000;
const FIRST_RETRY_DELAY_MS = 100;
const MAX_RETRY_DELAY_MS = 1000;

export type StartOptions<T extends Workflow> = Omit<WorkflowStartOptions<T>, 'taskQueue'>;

// Starts workflows on TEMPORAL_TASK_QUEUE through the shared Client (specs/backlog.md "Retries of
// the shared connection at shutdown", closed by spec 0011 plan §4). The shared connection has no
// gRPC retries of the SDK (TemporalClientModule): their timers outlive the call and fire on a closed
// channel. A start retries here instead, within START_TIMEOUT_MS, and drain() lets the starts in
// progress end before the connection closes.
@Injectable()
export class WorkflowStarter {
  private readonly inProgress = new Set<Promise<unknown>>();
  private closing = false;

  constructor(
    private readonly client: Client,
    private readonly connection: Connection,
    @Inject(TEMPORAL_SETTINGS) private readonly settings: TemporalSettings,
  ) {}

  // A repeat start of a running workflow id is ignored (USE_EXISTING): the caller's work is
  // idempotent. Throws once START_TIMEOUT_MS is spent, or at once on an error a retry cannot fix.
  async start<T extends Workflow>(workflowType: string, options: StartOptions<T>): Promise<void> {
    if (this.closing) {
      throw new Error('The Temporal client is closing; the workflow was not started');
    }
    const start = this.withRetries(() =>
      this.client.workflow.start<T>(workflowType, {
        ...options,
        taskQueue: this.settings.taskQueue,
        workflowIdConflictPolicy: 'USE_EXISTING',
        // TypeScript cannot narrow the SDK's conditional `args` type over a generic T.
      } as WorkflowStartOptions<T>),
    );
    this.inProgress.add(start);
    try {
      await start;
    } finally {
      this.inProgress.delete(start);
    }
  }

  // Asks a workflow to cancel (a deleted fitting, spec 0019 A47), within START_TIMEOUT_MS and its
  // retries as a start. A workflow that is gone or already ended is not an error: there is nothing
  // to cancel. Throws as `start` does.
  async cancel(workflowId: string): Promise<void> {
    if (this.closing) {
      throw new Error('The Temporal client is closing; the workflow was not cancelled');
    }
    const cancel = this.withRetries(async () => {
      try {
        await this.client.workflow.getHandle(workflowId).cancel();
      } catch (error) {
        if (!(error instanceof WorkflowNotFoundError)) throw error;
      }
    });
    this.inProgress.add(cancel);
    try {
      await cancel;
    } finally {
      this.inProgress.delete(cancel);
    }
  }

  // Called by TemporalClientModule before it closes the connection. Starts in progress end within
  // START_TIMEOUT_MS; a later start throws.
  async drain(): Promise<void> {
    this.closing = true;
    await Promise.allSettled(this.inProgress);
  }

  private async withRetries(call: () => Promise<unknown>): Promise<void> {
    // Cancels the call in flight (a server that does not answer) and the wait between attempts. The
    // timer is cleared when the call ends, so the signal never fires on a call of a closed
    // connection.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), START_TIMEOUT_MS);
    try {
      await this.retryUntilAborted(call, controller.signal);
    } finally {
      clearTimeout(timer);
    }
  }

  private async retryUntilAborted(
    call: () => Promise<unknown>,
    signal: AbortSignal,
  ): Promise<void> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        await this.connection.withAbortSignal(signal, call);
        return;
      } catch (error) {
        if (signal.aborted || !isRetryable(error)) {
          throw error;
        }
        const wait = Math.min(FIRST_RETRY_DELAY_MS * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
        try {
          await delay(wait, undefined, { signal });
        } catch {
          // Out of time while waiting: the last failure tells why, not the abort.
          throw error;
        }
      }
    }
  }
}

// The gRPC codes the SDK's own retry treats as passing (UNAVAILABLE: no server yet, a restart).
function isRetryable(error: unknown): boolean {
  const cause = error instanceof ServiceError ? error.cause : error;
  return isGrpcServiceError(cause) && isRetryableError(cause);
}
