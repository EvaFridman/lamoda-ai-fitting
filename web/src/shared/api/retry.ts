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

// A fitting's start (spec 0024 Z10, Z27): repeated once when it got no answer (`network`), waited
// out its timeout, or met a 502/503/504 (nginx with the api down or switching, or the api's own 503:
// its request timeout, a busy database, a text check that did not answer, which the repeat pays
// for again). A 429 waits for the user's own repeat, and a bare 500 is an api bug that a repeat
// only doubles. This is the one write repeated by itself, against spec 0017 plan §4: the api
// answers the running fitting of the same photo, items and wishes (spec 0019 A32, looked up again
// under the user's lock), so a start whose answer was lost starts no second generation and spends
// no second try-on.
export function isStartRetryable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.kind === 'network' || error.kind === 'timeout') return true;
  return error.kind === 'http' && [502, 503, 504].includes(error.status ?? 0);
}

// TanStack Query's `retry`: `failureCount` is 0 at the first failure.
export function shouldRetry(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_RETRIES && isRetryable(error);
}

// TanStack Query's `retryDelay`: 1 s, then 2 s, so a burst of retries stays within the api's 10/s.
export function retryDelay(failureCount: number): number {
  return 1000 * 2 ** failureCount;
}
