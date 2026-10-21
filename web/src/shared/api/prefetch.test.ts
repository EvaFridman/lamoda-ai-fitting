// @vitest-environment node
import { dehydrate, infiniteQueryOptions, QueryClient, queryOptions } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/shared/config/server', () => ({
  getServerEnv: () => ({ API_URL: 'http://api:3000', PROXY_SECRET: '' }),
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import { ApiError, buildPath } from './index';
import { prefetch, prefetchInfinite } from './prefetch';
import { apiFetch } from './server';

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const DATE = '2026-10-01T12:00:00.000Z';
const brand = { id: ID, name: 'Brand', createdAt: DATE, updatedAt: DATE };

const brandSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const brandListSchema = z.object({ items: z.array(brandSchema), total: z.number() });

const brandListOptions = () =>
  queryOptions({
    queryKey: ['test', 'brands'],
    queryFn: () => apiFetch(buildPath('/brands'), brandListSchema),
  });
const brandOptions = (id: string) =>
  queryOptions({
    queryKey: ['test', 'brands', id],
    queryFn: () => apiFetch(buildPath('/brands/:id', { id }), brandSchema),
  });

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

const pagedSchema = z.object({ items: z.array(brandSchema), nextCursor: z.string().nullable() });

const brandBatchOptions = () =>
  infiniteQueryOptions({
    queryKey: ['test', 'brand-batches'],
    queryFn: ({ pageParam }) =>
      apiFetch(buildPath('/brands', {}, { cursor: pageParam ?? undefined }), pagedSchema),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

describe('prefetchInfinite', () => {
  it('returns undefined and dehydrates the first page only', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ items: [brand], nextCursor: 'c1' }))),
    );
    const client = new QueryClient();
    await expect(prefetchInfinite(client, brandBatchOptions())).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).searchParams.has('cursor')).toBe(false);
    const { queries } = dehydrate(client);
    expect(queries).toHaveLength(1);
    expect(queries[0]?.queryKey).toEqual(['test', 'brand-batches']);
    expect(queries[0]?.state.data).toEqual({
      pages: [{ items: [brand], nextCursor: 'c1' }],
      pageParams: [null],
    });
  });

  it('returns the ApiError without retrying, and dehydrates nothing', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response('{}', { status: 503 })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: 3, retryDelay: 0 } } });
    const result = await prefetchInfinite(client, brandBatchOptions());
    expect(result).toBeInstanceOf(ApiError);
    expect(result).toMatchObject({ kind: 'http', status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(dehydrate(client).queries).toHaveLength(0);
  });

  it('returns a schema error as the error', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ items: 1 }))));
    const result = await prefetchInfinite(new QueryClient(), brandBatchOptions());
    expect(result).toMatchObject({ kind: 'schema' });
  });
});

describe('prefetch', () => {
  it('returns undefined on success and leaves the query in the cache and in the dehydrated state', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ items: [brand], total: 1 }))),
    );
    const client = new QueryClient();
    const options = brandListOptions();
    await expect(prefetch(client, options)).resolves.toBeUndefined();
    expect(client.getQueryData(options.queryKey)).toEqual({ items: [brand], total: 1 });
    const { queries } = dehydrate(client);
    expect(queries).toHaveLength(1);
    expect(queries[0]?.queryKey).toEqual(options.queryKey);
    expect(queries[0]?.state.data).toEqual({ items: [brand], total: 1 });
  });

  it.each([503, 404])(
    'returns the ApiError for a %s, with one request even if retries are on',
    async (status) => {
      fetchMock.mockImplementation(() => Promise.resolve(new Response('{}', { status })));
      const client = new QueryClient({ defaultOptions: { queries: { retry: 3, retryDelay: 0 } } });
      const options = brandOptions(ID);
      const result = await prefetch(client, options);
      expect(result).toBeInstanceOf(ApiError);
      expect(result).toMatchObject({ kind: 'http', status });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(dehydrate(client).queries).toHaveLength(0);
    },
  );

  it('returns a schema error and does not dehydrate it', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ id: 1 }))));
    const client = new QueryClient();
    const result = await prefetch(client, brandOptions(ID));
    expect(result).toMatchObject({ kind: 'schema' });
    expect(dehydrate(client).queries).toHaveLength(0);
  });

  it('returns a network failure as the error, without throwing', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const result = await prefetch(new QueryClient(), brandOptions(ID));
    expect(result).toMatchObject({ kind: 'network' });
  });

  it('returns a refused path as the error and makes no request', async () => {
    const result = await prefetch(new QueryClient(), brandOptions(''));
    expect(result).toMatchObject({ kind: 'path' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not ask the api again for a query already in the cache', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify(brand))));
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } });
    await prefetch(client, brandOptions(ID));
    await prefetch(client, brandOptions(ID));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
