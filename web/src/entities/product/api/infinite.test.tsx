import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/shared/config/server', () => ({
  getServerEnv: () => ({ API_URL: 'http://api:3000', PROXY_SECRET: '' }),
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import { productKeys } from './keys';
import { productInfiniteOptions, useProductBatches } from './queries';
import * as server from './server-queries';

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const ID2 = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const DATE = '2026-10-01T12:00:00.000Z';

function item(id: string) {
  return {
    id,
    article: 'A-1',
    name: 'Dress',
    brand: { id: ID2, name: 'Brand' },
    category: { id: ID2, name: 'Dresses', slug: 'dresses' },
    image: null,
    price: 5000,
    discount: 0,
    finalPrice: 5000,
    rating: null,
    createdAt: DATE,
    updatedAt: DATE,
  };
}

const first = { items: [item(ID)], total: 2, nextCursor: 'cur-1' };
const last = { items: [item(ID2)], total: 2, nextCursor: null };

const fetchMock = vi.fn();

function requested(call: number): URL {
  return new URL(String(fetchMock.mock.calls[call]?.[0]), 'http://localhost');
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: URL | string) =>
    Promise.resolve(
      new Response(
        JSON.stringify(
          new URL(String(url), 'http://localhost').searchParams.has('cursor') ? last : first,
        ),
      ),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const QUERY = {
  q: ' dress ',
  size: ['M', ''],
  categoryId: [ID],
  sort: 'price_asc',
  limit: 12,
} as const;

describe('productInfiniteOptions keys', () => {
  it('is the list key without an offset, the same in the browser and on the server', () => {
    const key = browserKey();
    expect(key).toEqual([
      'products',
      'infinite',
      expect.objectContaining({ q: 'dress', size: ['M'], categoryId: [ID], limit: 12 }),
      null,
    ]);
    expect(key[2]).not.toHaveProperty('offset');
    expect(server.productInfiniteOptions(QUERY).queryKey).toEqual(key);
    expect(productKeys.infinite(QUERY)).toEqual(key);
  });

  it('ignores an offset smuggled into the query', () => {
    const wide = { ...QUERY, offset: 40 };
    expect(productInfiniteOptions(wide).queryKey).toEqual(browserKey());
  });

  it('differs per filter', () => {
    expect(productInfiniteOptions({ q: 'a' }).queryKey).not.toEqual(
      productInfiniteOptions({ q: 'b' }).queryKey,
    );
  });

  function browserKey() {
    return productInfiniteOptions(QUERY).queryKey;
  }
});

describe('infinite options paging', () => {
  it.each([
    ['browser', productInfiniteOptions],
    ['server', server.productInfiniteOptions],
  ])('%s: starts with a null page param and reads the next cursor', (_name, options) => {
    const built = options(QUERY);
    expect(built.initialPageParam).toBeNull();
    expect(built.getNextPageParam(first, [first], null, [null])).toBe('cur-1');
    expect(built.getNextPageParam(last, [first, last], 'cur-1', [null, 'cur-1'])).toBeNull();
  });

  it.each([
    ['browser', productInfiniteOptions],
    ['server', server.productInfiniteOptions],
  ])('%s: the first request has no cursor, the next carries it', async (_name, options) => {
    const client = new QueryClient();
    const data = await client.fetchInfiniteQuery({ ...options(QUERY), pages: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const one = requested(0);
    expect(one.pathname.endsWith('/products')).toBe(true);
    expect(one.searchParams.has('cursor')).toBe(false);
    expect(one.searchParams.has('offset')).toBe(false);
    expect(one.searchParams.get('q')).toBe('dress');
    expect(one.searchParams.getAll('categoryId')).toEqual([ID]);
    expect(one.searchParams.get('limit')).toBe('12');
    const two = requested(1);
    expect(two.searchParams.get('cursor')).toBe('cur-1');
    expect(two.searchParams.get('q')).toBe('dress');
    expect(data.pageParams).toEqual([null, 'cur-1']);
    expect(data.pages.map((page) => page.items[0]?.id)).toEqual([ID, ID2]);
  });
});

describe('getProductBatch', () => {
  it('sends no cursor for the first batch and the cursor for the next', async () => {
    await server.getProductBatch({ q: 'a' });
    expect(requested(0).searchParams.has('cursor')).toBe(false);
    await server.getProductBatch({ q: 'a' }, 'next-1');
    expect(requested(1).searchParams.get('cursor')).toBe('next-1');
    expect(requested(1).searchParams.get('q')).toBe('a');
  });
});

describe('useProductBatches', () => {
  it('loads the first batch, then the next one after the cursor', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useProductBatches(QUERY), { wrapper });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    expect(result.current.hasNextPage).toBe(true);
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(result.current.hasNextPage).toBe(false);
    expect(requested(1).searchParams.get('cursor')).toBe('cur-1');
  });
});
