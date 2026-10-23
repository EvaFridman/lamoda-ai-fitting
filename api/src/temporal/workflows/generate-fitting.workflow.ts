import {
  ActivityCancellationType,
  ActivityFailure,
  ApplicationFailure,
  CancellationScope,
  CancelledFailure,
  proxyActivities,
  TimeoutFailure,
} from '@temporalio/workflow';

import type {
  FittingActivities,
  FittingFailureType,
  FittingOutcome,
} from '../activities/fitting.activities.js';
import { generateTimeLimitSeconds } from '../fitting-workflow-id.js';

// The database steps: short writes, retried until the database answers (as completeFileDeletion),
// since a fitting that never ends keeps its unit and blocks its fingerprint (A32).
const { markProcessing, complete } = proxyActivities<FittingActivities>({
  startToCloseTimeout: '30 seconds',
  retry: { initialInterval: '1 second', backoffCoefficient: 2, maximumInterval: '30 seconds' },
});

// The result's moderation: one call per attempt (the client's `retry: false`), three attempts.
const { moderate } = proxyActivities<FittingActivities>({
  startToCloseTimeout: '30 seconds',
  heartbeatTimeout: '30 seconds',
  cancellationType: ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
  retry: {
    initialInterval: '1 second',
    backoffCoefficient: 2,
    maximumInterval: '10 seconds',
    maximumAttempts: 3,
  },
});

// One folder's deletion: three requests to the storage at most, each within its 45 s (as
// deletePrefix in deleteFiles). A result left behind goes with the generation's folder when the
// row is deleted.
const { discardResult } = proxyActivities<FittingActivities>({
  startToCloseTimeout: '2 minutes',
  heartbeatTimeout: '1 minute',
  retry: {
    initialInterval: '1 second',
    backoffCoefficient: 2,
    maximumInterval: '10 seconds',
    maximumAttempts: 5,
  },
});

export interface GenerateFittingInput {
  generationId: string;
  // FITTING_TIMEOUT_SECONDS of the api that started it: `generate`'s time limit is this plus the
  // overhead (workflow code reads no environment).
  timeoutSeconds: number;
}

const FAILURE_TYPES: readonly string[] = [
  'model_timeout',
  'provider_error',
] satisfies FittingFailureType[];

// One try-on (spec 0019 plan §4, A68), id `fitting-<generationId>` (fitting-workflow-id.ts),
// started by the api after the row's commit. Marks the row `processing`; `generate` makes the one
// paid call and writes the result to the bucket (once: A67); `moderate` checks it; `complete` ends
// the row in any case (a failure gives the unit back, A20; a transient photo stays for the open
// try-on, A69). Only ids and codes go through the history (no image, no text of the user). The end runs outside any
// cancellation, so a fitting always ends: a cancelled workflow (the row deleted, A47, or a cancel
// by hand) discards a written result, ends a row still there as failed with its unit kept, and
// then ends as cancelled. Only the workflow's own cancellation counts as one: an activity
// cancelled by a worker's shutdown is a failure like any other (`provider_error`, unspent, A67).
export async function generateFitting({
  generationId,
  timeoutSeconds,
}: GenerateFittingInput): Promise<void> {
  const { generate } = proxyActivities<FittingActivities>({
    startToCloseTimeout: `${generateTimeLimitSeconds(timeoutSeconds)} seconds`,
    heartbeatTimeout: '30 seconds',
    retry: { maximumAttempts: 1 },
    // The cancellation reaches the activity at its next heartbeat; waiting for its end keeps a
    // result written meanwhile from landing after `discardResult`.
    cancellationType: ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
  });

  let userId: string | null = null;
  // The paid call's id for OpenAI's support, kept whatever comes after it.
  let requestId: string | null = null;
  let outcome: FittingOutcome;
  try {
    const running = await markProcessing(generationId);
    if (running === null) {
      return;
    }
    userId = running.userId;
    const generated = await generate(generationId, timeoutSeconds);
    requestId = generated.requestId;
    if (!generated.ok) {
      outcome = failed(generated.failureCode, null, requestId);
    } else {
      const { flagged } = await moderate(generationId);
      outcome = flagged
        ? failed('moderation', null, requestId)
        : { status: 'completed', providerRequestId: requestId };
    }
  } catch (error) {
    outcome = failureOf(error, requestId);
  }
  const cancelled = CancellationScope.current().consideredCancelled;
  if (cancelled) {
    outcome = { ...failed('provider_error', 'cancelled', requestId), keepUnit: true };
  }
  const end = outcome;
  await CancellationScope.nonCancellable(async () => {
    if (end.status === 'failed' && userId !== null) {
      await discard(generationId, userId);
    }
    await complete(generationId, end);
  });
  if (cancelled) {
    throw new CancelledFailure('The fitting was cancelled');
  }
}

// A failed discard leaves the file to the generation's folder deletion; the fitting still ends.
async function discard(generationId: string, userId: string): Promise<void> {
  try {
    await discardResult(generationId, userId);
  } catch {
    // Nothing more to do here.
  }
}

function failed(
  failureCode: Extract<FittingOutcome, { status: 'failed' }>['failureCode'],
  errorMessage: string | null,
  providerRequestId: string | null,
): Extract<FittingOutcome, { status: 'failed' }> {
  return { status: 'failed', failureCode, errorMessage, providerRequestId };
}

// The row's failure of a failed activity: the code an activity named as the failure's type
// (fittingFailure), else `provider_error` (a step that ran out of attempts, a worker lost
// mid-call), with the failure's kind as the message, never its text.
// `requestId` is the paid call's, when the failure came after it. `generate` passing its
// startToClose is the model's slowness (`model_timeout`); its heartbeat timeout is a lost worker.
function failureOf(error: unknown, requestId: string | null): FittingOutcome {
  const cause = error instanceof ActivityFailure ? error.cause : error;
  if (cause instanceof ApplicationFailure) {
    const type = cause.type ?? 'Error';
    if (FAILURE_TYPES.includes(type)) {
      const failureRequestId: unknown = cause.details?.[0];
      return failed(
        type as FittingFailureType,
        cause.message,
        // The paid call's id wins over a later step's (the moderation's own request).
        requestId ?? (typeof failureRequestId === 'string' ? failureRequestId : null),
      );
    }
    return failed('provider_error', type, requestId);
  }
  if (cause instanceof TimeoutFailure) {
    const slowModel =
      error instanceof ActivityFailure &&
      error.activityType === 'generate' &&
      cause.timeoutType === 'START_TO_CLOSE';
    return failed(
      slowModel ? 'model_timeout' : 'provider_error',
      `TimeoutFailure: ${cause.timeoutType}`,
      requestId,
    );
  }
  return failed('provider_error', cause instanceof Error ? cause.name : 'Unknown error', requestId);
}
