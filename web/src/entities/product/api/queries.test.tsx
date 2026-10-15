import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/shared/config/server', () => ({
  getServerEnv: () => ({ API_URL: 'http://api:3000', PROXY_SECRET: '' }),
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import * as Sentry from '@sentry/nextjs';

import { ApiError } from '@/shared/api';

import * as browser from './queries';
import * as server from './server-queries';
import { useProduct } from './queries';

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const ID2 = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const DATE = '2026-10-01T12:00:00.000Z';

const listItem = {
  id: ID,
  article: 'A-1',
  name: 'Dress',
  brand: { id: ID2, name: 'Brand' },
  category: { id: ID2, name: 'Dresses', slug: 'dresses' },
  image: { url: 'https://cdn.example/a.jpg' },
  price: 5000,
  discount: 10,
  finalPrice: 4500,
  rating: null,
  createdAt: DATE,
};
const facets = {
  total: 10,
  discounted: 2,
  price: null,
  categories: [],
  brands: [],
  sizes: [],
  attributes: [],
};
const detail = {
  ...listItem,
  description: null,
  images: [],
  variations: [],
  attributes: [],
};

const fetchMock = vi.fn();
const capture = vi.mocked(Sentry.captureException);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function requested(): URL {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  return new URL(String(fetchMock.mock.calls[0]?.[0]));
}

beforeEach(() => {
  fetchMock.mockReset();
  capture.mockReset();
  fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ items: [], total: 0 })));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// What the fetch of a hanging request sees: it rejects as a real fetch does when its signal aborts.
function hangUntilAborted(): { signal: () => AbortSignal } {
  let seen: AbortSignal | undefined;
  fetchMock.mockImplementation((_url: URL, init: RequestInit) => {
    const signal = init.signal as AbortSignal;
    seen = signal;
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  });
  return {
    signal: () => {
      if (!seen) throw new Error('fetch was not called');
      return seen;
    },
  };
}

describe('browser and server options share keys', () => {
  const messy = {
    q: '  dress ',
    size: [' M ', '', 'L'],
    brandId: [],
    categoryId: [ID],
    sort: 'price_asc',
    limit: 10,
    junk: 1,
  } as const;

  it.each([
    ['no input', undefined],
    ['empty filters', { q: '', brandId: [], size: [''] }],
    ['untrimmed filters', messy],
    ['blank q', { q: '   ' }],
  ])('productListOptions and productFacetsOptions for %s', (_name, input) => {
    expect(browser.productListOptions(input).queryKey).toEqual(
      server.productListOptions(input).queryKey,
    );
    expect(browser.productFacetsOptions(input).queryKey).toEqual(
      server.productFacetsOptions(input).queryKey,
    );
  });

  it('productOptions and the sub-lists', () => {
    expect(browser.productOptions(ID).queryKey).toEqual(server.productOptions(ID).queryKey);
    const page = { limit: 5, offset: 10, junk: 1 } as object;
    expect(browser.productImageListOptions(ID, page).queryKey).toEqual(
      server.productImageListOptions(ID, page).queryKey,
    );
    expect(browser.productImageListOptions(ID).queryKey).toEqual(
      server.productImageListOptions(ID).queryKey,
    );
    expect(browser.productVariationListOptions(ID, page).queryKey).toEqual(
      server.productVariationListOptions(ID, page).queryKey,
    );
    expect(browser.productAttributeValueListOptions(ID, page).queryKey).toEqual(
      server.productAttributeValueListOptions(ID, page).queryKey,
    );
  });
});

describe('browser product options request', () => {
  it('productListOptions asks /api/products on the site origin with a clean query', async () => {
    const body = { items: [listItem], total: 1 };
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(body)));
    const client = new QueryClient();
    await expect(
      client.query(
        browser.productListOptions({ q: ' dress ', size: [' M ', ''], brandId: [], limit: 5 }),
      ),
    ).resolves.toEqual(body);
    const url = requested();
    expect(url.origin).toBe(globalThis.location.origin);
    expect(url.pathname).toBe('/api/products');
    expect(url.searchParams.get('q')).toBe('dress');
    expect(url.searchParams.getAll('size')).toEqual(['M']);
    expect(url.searchParams.get('limit')).toBe('5');
    expect(url.searchParams.has('brandId')).toBe(false);
  });

  it('productFacetsOptions asks /api/products/facets without sort or page', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(facets)));
    await new QueryClient().query(
      browser.productFacetsOptions({ q: 'x', sort: 'rating', limit: 1 } as object),
    );
    const url = requested();
    expect(url.pathname).toBe('/api/products/facets');
    expect([...url.searchParams.keys()]).toEqual(['q']);
  });

  it('productOptions keeps an id from input in one segment', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(detail)));
    await new QueryClient().query(browser.productOptions('a/b'));
    expect(requested().pathname).toBe('/api/products/a%2Fb');
  });

  it('productOptions refuses an empty id before any request', async () => {
    const error = await new QueryClient().query(browser.productOptions('')).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'path' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      'images',
      (client: QueryClient, page: object) =>
        client.query(browser.productImageListOptions(ID, page)),
    ],
    [
      'variations',
      (client: QueryClient, page: object) =>
        client.query(browser.productVariationListOptions(ID, page)),
    ],
    [
      'attribute-values',
      (client: QueryClient, page: object) =>
        client.query(browser.productAttributeValueListOptions(ID, page)),
    ],
  ])('the %s list asks its sub-route with the page', async (segment, load) => {
    // The default body is an empty page, which every list schema accepts.
    await load(new QueryClient(), { limit: 2, offset: 4 });
    const url = requested();
    expect(url.pathname).toBe(`/api/products/${ID}/${segment}`);
    expect(url.searchParams.get('limit')).toBe('2');
    expect(url.searchParams.get('offset')).toBe('4');
  });

  it('rejects a body that fails the schema with a schema ApiError', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ items: [{ ...listItem, price: '5000' }], total: 1 })),
    );
    const error = await new QueryClient().query(browser.productListOptions()).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'schema' });
  });

  it('drops extra fields of the body', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ items: [{ ...listItem, extra: 1 }], total: 1, note: 'x' })),
    );
    const result = await new QueryClient().query(browser.productListOptions());
    expect(result).toEqual({ items: [listItem], total: 1 });
  });
});

describe('browser product options cancel', () => {
  it('passes a signal to fetch that aborts when the query is cancelled', async () => {
    const hanging = hangUntilAborted();
    const client = new QueryClient();
    const options = browser.productListOptions({ q: 'x' });
    const result = client.query(options).catch((e: unknown) => e);
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(hanging.signal().aborted).toBe(false);
    await client.cancelQueries({ queryKey: options.queryKey });
    expect(hanging.signal().aborted).toBe(true);
    const error = await result;
    expect(error).not.toBeInstanceOf(ApiError);
    expect(capture).not.toHaveBeenCalled();
  });

  it('aborts the request when the last component using the hook unmounts', async () => {
    const hanging = hangUntilAborted();
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { unmount } = renderHook(() => useProduct(ID), { wrapper });
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(hanging.signal().aborted).toBe(false);
    unmount();
    await vi.waitFor(() => {
      expect(hanging.signal().aborted).toBe(true);
    });
    expect(capture).not.toHaveBeenCalled();
  });
});
