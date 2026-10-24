import * as Sentry from '@sentry/nextjs';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import { userKeys } from '@/entities/user';
import { ApiError } from '@/shared/api';

import type { Fitting } from '../model/schemas';
import { fittingKeys } from './keys';
import {
  FITTINGS_PAGE_SIZE,
  fittingQueryOptions,
  fittingQuotaQueryOptions,
  fittingRefetchInterval,
  fittingsInfiniteQueryOptions,
  fittingsRefetchInterval,
  RESULT_LINKS_FRESH_MS,
  RUNNING_LIST_POLL_MS,
  RUNNING_POLL_MS,
} from './queries';

function apiError(kind: ApiError['kind'], status?: number): ApiError {
  return new ApiError('m', { kind, template: '/fittings/:id', method: 'GET', status });
}

// The errors the timer must stop for, and the ones it must keep reading through.
const refusedErrors: [string, unknown][] = [
  ['http 404', apiError('http', 404)],
  ['http 401', apiError('http', 401)],
  ['schema', apiError('schema')],
  ['path', apiError('path')],
];
const transientErrors: [string, unknown][] = [
  ['network', apiError('network')],
  ['timeout', apiError('timeout')],
  // A second over the quota: the timer goes on, no faster than `Retry-After`.
  ['http 429', apiError('http', 429)],
  ['http 500', apiError('http', 500)],
  ['http 503', apiError('http', 503)],
  ['a plain Error', new Error('boom')],
];

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';

const fitting: Fitting = {
  id: ID,
  kind: 'single',
  parentId: null,
  status: 'completed',
  stage: 'done',
  failureCode: null,
  countsAgainstLimit: true,
  regenerationFree: true,
  model: 'gpt-image-2',
  items: [],
  photoId: ID,
  resultUrl: 'https://s3.example/keep/users/u/result.webp?X-Amz-Signature=abc',
  createdAt: '2026-10-01T12:00:00.000Z',
  startedAt: '2026-10-01T12:00:01.000Z',
  finishedAt: '2026-10-01T12:00:40.000Z',
  estimatedSeconds: null,
};
const withStatus = (status: Fitting['status']): Fitting => ({ ...fitting, status });

const fetchMock = vi.fn();

function lastUrl(): URL {
  const [url] = fetchMock.mock.calls.at(-1) as [unknown];
  return new URL(String(url));
}

let clock = Date.now();

beforeEach(() => {
  clock += 10 * 60_000;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(clock);
  vi.mocked(Sentry.captureException).mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('fittingKeys', () => {
  it('starts with the user keys, so a signed-out tab drops the fittings', () => {
    expect(fittingKeys.all.slice(0, userKeys.all.length)).toEqual(userKeys.all);
  });

  it('does not start with the me key, so a refetch of /me by prefix leaves them', () => {
    expect(fittingKeys.all.slice(0, userKeys.me.length)).not.toEqual(userKeys.me);
  });

  it('puts detail, lists and quota under all', () => {
    const under = (key: readonly unknown[]) =>
      expect(key.slice(0, fittingKeys.all.length)).toEqual(fittingKeys.all);
    under(fittingKeys.detail(ID));
    under(fittingKeys.list());
    under(fittingKeys.list('look'));
    under(fittingKeys.quota);
  });

  it('keeps a list per kind', () => {
    expect(fittingKeys.list(undefined)).not.toEqual(fittingKeys.list('single'));
    expect(fittingKeys.list('single')).not.toEqual(fittingKeys.list('look'));
  });
});

describe('fittingRefetchInterval', () => {
  it('polls a running fitting every 3 s', () => {
    expect(RUNNING_POLL_MS).toBe(3000);
    const state = (status: Fitting['status']) => ({ data: withStatus(status), error: null });
    expect(fittingRefetchInterval(state('pending'))).toBe(RUNNING_POLL_MS);
    expect(fittingRefetchInterval(state('processing'))).toBe(RUNNING_POLL_MS);
  });

  it('reads an ended one again before its 15 minute links expire', () => {
    const state = (status: Fitting['status']) => ({ data: withStatus(status), error: null });
    expect(RESULT_LINKS_FRESH_MS).toBeLessThan(15 * 60_000);
    expect(fittingRefetchInterval(state('completed'))).toBe(RESULT_LINKS_FRESH_MS);
    expect(fittingRefetchInterval(state('failed'))).toBe(RESULT_LINKS_FRESH_MS);
  });

  it('does not poll with no data, with or without an error', () => {
    expect(fittingRefetchInterval({ data: undefined, error: null })).toBe(false);
    expect(fittingRefetchInterval({ data: undefined, error: apiError('network') })).toBe(false);
  });

  it.each(refusedErrors)('stops the timer for %s', (_name, error) => {
    expect(fittingRefetchInterval({ data: withStatus('processing'), error })).toBe(false);
    expect(fittingRefetchInterval({ data: fitting, error })).toBe(false);
  });

  it.each(transientErrors)('keeps the usual pace after %s', (_name, error) => {
    expect(fittingRefetchInterval({ data: withStatus('processing'), error })).toBe(RUNNING_POLL_MS);
    expect(fittingRefetchInterval({ data: fitting, error })).toBe(RESULT_LINKS_FRESH_MS);
  });
});

describe('fittingsRefetchInterval', () => {
  const page = (items: Fitting[]) => ({ items, total: null, nextCursor: null });
  const state = (items: Fitting[][], error: unknown = null) => ({
    data: { pages: items.map(page) },
    error,
  });

  it('polls every 15 s while any loaded item runs', () => {
    expect(RUNNING_LIST_POLL_MS).toBe(15_000);
    expect(fittingsRefetchInterval(state([[fitting], [withStatus('processing')]]))).toBe(
      RUNNING_LIST_POLL_MS,
    );
    expect(fittingsRefetchInterval(state([[withStatus('pending')]]))).toBe(RUNNING_LIST_POLL_MS);
  });

  it('reads again every 10 minutes when none runs', () => {
    expect(fittingsRefetchInterval(state([[fitting, withStatus('failed')]]))).toBe(
      RESULT_LINKS_FRESH_MS,
    );
    expect(fittingsRefetchInterval(state([]))).toBe(RESULT_LINKS_FRESH_MS);
  });

  it('does not poll with no data', () => {
    expect(fittingsRefetchInterval({ data: undefined, error: null })).toBe(false);
  });

  it.each(refusedErrors)('stops the timer for %s', (_name, error) => {
    expect(fittingsRefetchInterval(state([[withStatus('pending')]], error))).toBe(false);
  });

  it.each(transientErrors)('keeps the usual pace after %s', (_name, error) => {
    expect(fittingsRefetchInterval(state([[withStatus('pending')]], error))).toBe(
      RUNNING_LIST_POLL_MS,
    );
    expect(fittingsRefetchInterval(state([[fitting]], error))).toBe(RESULT_LINKS_FRESH_MS);
  });
});

describe('fittingQueryOptions', () => {
  it('uses the detail key, a 10 minute stale time and refetches on focus', () => {
    const options = fittingQueryOptions(ID);
    expect(options.queryKey).toEqual(fittingKeys.detail(ID));
    expect(options.staleTime).toBe(RESULT_LINKS_FRESH_MS);
    expect(options.refetchOnWindowFocus).toBe(true);
  });

  it('reads GET /api/fittings/<id> with a signal', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(fitting)));
    await expect(new QueryClient().query(fittingQueryOptions(ID))).resolves.toEqual(fitting);
    expect(lastUrl().pathname).toBe(`/api/fittings/${ID}`);
    const [, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('polls by the data in the cache', () => {
    const options = fittingQueryOptions(ID);
    const interval = options.refetchInterval as (query: unknown) => number | false;
    const query = (data: Fitting | undefined, error: unknown = null) => ({
      state: { data, error },
    });
    expect(interval(query(undefined))).toBe(false);
    expect(interval(query(withStatus('pending')))).toBe(RUNNING_POLL_MS);
    expect(interval(query(withStatus('completed')))).toBe(RESULT_LINKS_FRESH_MS);
  });

  it('stops polling once the fitting is gone (404 after a deletion)', () => {
    const interval = fittingQueryOptions(ID).refetchInterval as (query: unknown) => number | false;
    const state = { data: withStatus('processing'), error: apiError('http', 404) };
    expect(interval({ state })).toBe(false);
  });

  it('rejects a body that is not a fitting as a schema error', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 1 })));
    const error = await new QueryClient().query(fittingQueryOptions(ID)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'schema' });
  });
});

describe('fittingsInfiniteQueryOptions', () => {
  const page = (items: Fitting[], nextCursor: string | null) => ({
    items,
    total: null,
    nextCursor,
  });

  it('reads the first page with the kind and the limit, and no cursor', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(page([fitting], null))));
    const client = new QueryClient();
    await client.fetchInfiniteQuery(fittingsInfiniteQueryOptions('look'));
    const url = lastUrl();
    expect(url.pathname).toBe('/api/fittings');
    expect(url.searchParams.get('kind')).toBe('look');
    expect(url.searchParams.get('limit')).toBe(String(FITTINGS_PAGE_SIZE));
    expect(FITTINGS_PAGE_SIZE).toBe(20);
    expect(url.searchParams.has('cursor')).toBe(false);
  });

  it('sends no kind for every fitting', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(page([], null))));
    await new QueryClient().fetchInfiniteQuery(fittingsInfiniteQueryOptions());
    expect(lastUrl().searchParams.has('kind')).toBe(false);
  });

  it('sends the cursor of the page param for the next page', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(page([fitting], null))));
    const options = fittingsInfiniteQueryOptions();
    const queryFn = options.queryFn as (ctx: unknown) => Promise<unknown>;
    await queryFn({ pageParam: 'abc', signal: new AbortController().signal });
    expect(lastUrl().searchParams.get('cursor')).toBe('abc');
  });

  it('pages by nextCursor, and ends on null', () => {
    const options = fittingsInfiniteQueryOptions();
    const next = options.getNextPageParam as (last: unknown) => unknown;
    expect(next(page([], 'c2'))).toBe('c2');
    expect(next(page([], null))).toBeNull();
  });

  it('uses the list key of its kind', () => {
    expect(fittingsInfiniteQueryOptions('single').queryKey).toEqual(fittingKeys.list('single'));
    expect(fittingsInfiniteQueryOptions().queryKey).toEqual(fittingKeys.list());
  });

  it('polls every 15 s while a loaded item runs, else every 10 minutes, never with no data', () => {
    const options = fittingsInfiniteQueryOptions();
    const interval = options.refetchInterval as (query: unknown) => number | false;
    const query = (pages: ReturnType<typeof page>[] | undefined, error: unknown = null) => ({
      state: { data: pages === undefined ? undefined : { pages }, error },
    });
    expect(interval(query(undefined))).toBe(false);
    expect(interval(query([page([fitting], 'c')]))).toBe(RESULT_LINKS_FRESH_MS);
    expect(interval(query([page([fitting], 'c'), page([withStatus('processing')], null)]))).toBe(
      RUNNING_LIST_POLL_MS,
    );
    expect(interval(query([page([withStatus('pending')], null)]))).toBe(RUNNING_LIST_POLL_MS);
  });

  it('stops polling after a refused read, keeps going after a 5xx', () => {
    const interval = fittingsInfiniteQueryOptions().refetchInterval as (
      query: unknown,
    ) => number | false;
    const pages = [page([withStatus('pending')], null)];
    expect(interval({ state: { data: { pages }, error: apiError('http', 401) } })).toBe(false);
    expect(interval({ state: { data: { pages }, error: apiError('http', 503) } })).toBe(
      RUNNING_LIST_POLL_MS,
    );
  });
});

describe('fittingQuotaQueryOptions', () => {
  const quota = { limit: 10, used: 3, left: 7, renewsAt: '2026-11-01T00:00:00.000Z' };

  it('reads GET /api/me/fitting-quota under the quota key', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(quota)));
    const options = fittingQuotaQueryOptions();
    expect(options.queryKey).toEqual(fittingKeys.quota);
    await expect(new QueryClient().query(options)).resolves.toEqual(quota);
    expect(lastUrl().pathname).toBe('/api/me/fitting-quota');
  });
});
