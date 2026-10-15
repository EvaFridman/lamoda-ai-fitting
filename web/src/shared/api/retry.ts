import { ApiError } from './api-error';

// The browser's retries (H10, H24): at most two, only when there was no answer (`network`) or the
// answer was a 503 (the api's timeout, or nginx with no copy of the api during a switch). A 4xx and
// a 429 (H11) are answers to what was asked; a timeout already waited 15 s; a wrong answer and a
// refused path would only fail again.
const MAX_RETRIES = 2;

export function isRetryable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return error.kind === 'network' || (error.kind === 'http' && error.status === 503);
}

// TanStack Query's `retry`: `failureCount` is 0 at the first failure.
export function shouldRetry(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_RETRIES && isRetryable(error);
}

// TanStack Query's `retryDelay`: 1 s, then 2 s, so a burst of retries stays within the api's 10/s.
export function retryDelay(failureCount: number): number {
  return 1000 * 2 ** failureCount;
}
