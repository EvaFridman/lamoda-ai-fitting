import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query';

import { ApiError, buildPath, clientFetch } from '@/shared/api';

import {
  fittingListSchema,
  fittingQuotaSchema,
  fittingSchema,
  isFittingRunning,
  type Fitting,
  type FittingKind,
  type FittingList,
} from '../model/schemas';
import { fittingKeys } from './keys';

// A running fitting is read again this often: the push of a finished one (plan §6) only makes the
// read come sooner, and a lost push, or a fitting the housekeeping ends with none (A71), is still
// seen.
export const RUNNING_POLL_MS = 3_000;

// The history while a loaded fitting runs: a timer reads every loaded batch again, one after
// another, so it goes slower than one fitting's screen and stays within the read quota.
export const RUNNING_LIST_POLL_MS = 15_000;

// The results' links are signed for 15 minutes (S3_SIGNED_URL_TTL_SECONDS, spec 0011 M9): an
// ended fitting is read again before they expire, while the page is open and when the tab comes
// back to it.
export const RESULT_LINKS_FRESH_MS = 10 * 60_000;

// A batch of the history (the api takes 1–100, 60 by default).
export const FITTINGS_PAGE_SIZE = 20;

// What the timer of a fitting's read looks at: its last data and its last error.
export interface PolledState<Data> {
  data: Data | undefined;
  error: unknown;
}

// A read the api refused (the fitting deleted in another tab, the session gone, an answer web
// cannot read) gives the same answer again: the timer stops, and the page shows the error. A
// network error, a timeout, a 429 (a second over the quota) or a 5xx is read again at the usual
// pace, no faster than the api's `Retry-After`.
function refused(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.kind === 'http') {
    return error.status !== undefined && error.status < 500 && error.status !== 429;
  }
  return error.kind === 'schema' || error.kind === 'path';
}

function interval(
  state: PolledState<unknown>,
  running: boolean | undefined,
  runningMs: number,
): number | false {
  if (running === undefined || refused(state.error)) return false;
  return running ? runningMs : RESULT_LINKS_FRESH_MS;
}

export function fittingRefetchInterval(state: PolledState<Fitting>): number | false {
  return interval(state, state.data && isFittingRunning(state.data), RUNNING_POLL_MS);
}

export function fittingsRefetchInterval(
  state: PolledState<{ pages: FittingList[] }>,
): number | false {
  const running = state.data?.pages.some((page) => page.items.some(isFittingRunning));
  return interval(state, running, RUNNING_LIST_POLL_MS);
}

// GET /fittings/:id, read only in the browser (spec 0017 U11). Polled while it runs.
export function fittingQueryOptions(id: string) {
  return queryOptions({
    queryKey: fittingKeys.detail(id),
    queryFn: ({ signal }) =>
      clientFetch(buildPath('/fittings/:id', { id }), fittingSchema, { signal }),
    staleTime: RESULT_LINKS_FRESH_MS,
    refetchInterval: (query) => fittingRefetchInterval(query.state),
    refetchOnWindowFocus: true,
  });
}

export function useFitting(id: string) {
  return useQuery(fittingQueryOptions(id));
}

// GET /fittings, newest first, by cursor; `kind` left out is every fitting. Polled while a loaded
// one runs.
export function fittingsInfiniteQueryOptions(kind?: FittingKind) {
  return infiniteQueryOptions({
    queryKey: fittingKeys.list(kind),
    queryFn: ({ pageParam, signal }) =>
      clientFetch(
        buildPath('/fittings', {}, { kind, cursor: pageParam, limit: FITTINGS_PAGE_SIZE }),
        fittingListSchema,
        { signal },
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last: FittingList) => last.nextCursor,
    staleTime: RESULT_LINKS_FRESH_MS,
    refetchInterval: (query) => fittingsRefetchInterval(query.state),
    refetchOnWindowFocus: true,
  });
}

export function useFittings(kind?: FittingKind) {
  return useInfiniteQuery(fittingsInfiniteQueryOptions(kind));
}

// GET /me/fitting-quota.
export function fittingQuotaQueryOptions() {
  return queryOptions({
    queryKey: fittingKeys.quota,
    queryFn: ({ signal }) =>
      clientFetch(buildPath('/me/fitting-quota'), fittingQuotaSchema, { signal }),
  });
}

export function useFittingQuota() {
  return useQuery(fittingQuotaQueryOptions());
}
