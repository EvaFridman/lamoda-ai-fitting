import {
  ApplicationFailure,
  CancelledFailure,
  CompleteAsyncError,
  type Context,
  type Info,
} from '@temporalio/activity';
import * as Sentry from '@sentry/nestjs';
import type { ActivityInterceptorsFactory } from '@temporalio/worker';

// Reports failed activities to Sentry (spec 0004 E23, E33). Temporal retries a failed activity, by
// default without limit (up to one attempt per 100 seconds), so reporting every attempt would use up
// the plan's 5k errors a month in days: only the first attempt and the last one are reported.
// Workflow code never imports Sentry (it must stay deterministic); a failing workflow shows up as an
// activity or client error.
export const sentryActivityInterceptor: ActivityInterceptorsFactory = (ctx: Context) => ({
  inbound: {
    async execute(input, next) {
      try {
        return await next(input);
      } catch (error) {
        if (isReported(error, ctx.info, ctx.cancellationSignal.aborted)) {
          Sentry.captureException(error, {
            tags: {
              'temporal.activity': ctx.info.activityType,
              'temporal.workflow': ctx.info.workflowType,
              'temporal.attempt': ctx.info.attempt,
            },
          });
        }
        throw error;
      }
    },
  },
});

export function isReported(
  error: unknown,
  info: Pick<Info, 'attempt' | 'retryPolicy'>,
  cancelled = false,
): boolean {
  // Cancellation (the workflow cancelled it, the worker shuts down) is not a failure: the SDK
  // throws CancelledFailure, and code given the cancellation signal (fetch) throws AbortError.
  if (error instanceof CancelledFailure) return false;
  if (cancelled && (error as Error | null)?.name === 'AbortError') return false;
  // Not a failure either: the activity will be completed from outside.
  if (error instanceof CompleteAsyncError) return false;
  return info.attempt === 1 || isLastAttempt(error, info);
}

// The attempt after which Temporal gives up. A timeout of the whole activity (scheduleToClose) is
// decided by the server and cannot be seen here, so such a last attempt is not reported.
function isLastAttempt(
  error: unknown,
  { attempt, retryPolicy }: Pick<Info, 'attempt' | 'retryPolicy'>,
): boolean {
  const maximumAttempts = retryPolicy?.maximumAttempts;
  if (maximumAttempts && attempt >= maximumAttempts) return true;
  if (error instanceof ApplicationFailure && error.nonRetryable) return true;
  // The type the server matches against nonRetryableErrorTypes, taken as the SDK takes it.
  const type =
    error instanceof ApplicationFailure
      ? error.type
      : ((error as { constructor?: { name?: string } } | null)?.constructor?.name ??
        (error as Error | null)?.name);
  return type != null && (retryPolicy?.nonRetryableErrorTypes ?? []).includes(type);
}
