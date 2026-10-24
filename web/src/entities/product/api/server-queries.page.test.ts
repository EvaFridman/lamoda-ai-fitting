// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// React's `cache` memoizes only inside a server render; the mock stands in for one render's scope,
// keyed by the first argument.
const renderScope = vi.hoisted(() => ({ values: new Map<unknown, Map<unknown, unknown>>() }));

// The sitemap's pause between batches: no test really waits.
vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn(() => Promise.resolve()) }));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache:
    <A, T>(fn: (arg: A) => T) =>
    (arg: A): T => {
      let byArg = renderScope.values.get(fn);
      if (byArg === undefined) {
        byArg = new Map();
        renderScope.values.set(fn, byArg);
      }
      if (!byArg.has(arg)) byArg.set(arg, fn(arg));
      return byArg.get(arg) as T;
    },
}));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ 'x-real-ip': '203.0.113.7' })),
}));
vi.mock('@/shared/config/server', () => ({
  getServerEnv: () => ({
    API_URL: 'http://api:3000',
    PROXY_SECRET: 's'.repeat(32),
    PAGE_CACHE_REVALIDATE_SECONDS: 60,
  }),
}));

import { ApiError } from '@/shared/api';

import {
  findProduct,
  getProductById,
  getRelatedProducts,
  getSitemapProducts,
  readFirstProduct,
} from './server-queries';

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const ID2 = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const DATE = '2026-10-01T12:00:00.000Z';
const SECRET = 's'.repeat(32);
const SKIP = Symbol.for('lamoda-ai-fitting.page-cache.skip-until');
const slot = globalThis as Record<symbol, unknown>;

const fetchMock = vi.fn();

function listItem(n = 0) {
  return {
    id: `7c9e6679-7425-40de-944b-e07fc1f9${String(n).padStart(4, '0')}`,
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

const detail = {
  ...listItem(),
  description: null,
  images: [],
  variations: [],
  attributes: [],
};

function batch(from: number, count: number, nextCursor: string | null) {
  return {
    items: Array.from({ length: count }, (_, n) => listItem(from + n)),
    total: null,
    nextCursor,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function urlOf(call: number): URL {
  return new URL(String(fetchMock.mock.calls[call]?.[0]));
}

function headersOf(call: number): Headers {
  return new Headers((fetchMock.mock.calls[call]?.[1] as RequestInit).headers);
}

beforeEach(() => {
  renderScope.values.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  delete slot[SKIP];
});

describe('findProduct', () => {
  it('reads /products/:id on behalf of the visitor and returns the detail', async () => {
    fetchMock.mockResolvedValue(json(detail));
    await expect(findProduct(ID)).resolves.toEqual(detail);
    expect(urlOf(0).pathname).toBe(`/products/${ID}`);
    expect(headersOf(0).get('x-proxy-secret')).toBe(SECRET);
    expect(headersOf(0).get('x-forwarded-for')).toBe('203.0.113.7');
  });

  it.each([404, 400])('answers null for the api status %i', async (status) => {
    fetchMock.mockResolvedValue(json({ error: { code: 'NOT_FOUND' } }, status));
    await expect(findProduct('not-a-uuid')).resolves.toBeNull();
  });

  it.each([[''], ['.'], ['..']])('answers null for the id %j without a request', async (id) => {
    await expect(findProduct(id)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rethrows a 500, a 503 and a schema failure', async () => {
    fetchMock.mockResolvedValue(json({}, 500));
    await expect(findProduct(ID)).rejects.toMatchObject({ kind: 'http', status: 500 });
    fetchMock.mockResolvedValue(json({}, 503));
    await expect(findProduct(ID)).rejects.toMatchObject({ kind: 'http', status: 503 });
    fetchMock.mockResolvedValue(json({ ...detail, updatedAt: undefined }));
    await expect(findProduct(ID)).rejects.toMatchObject({ kind: 'schema' });
  });

  it('rethrows a failure that is not an ApiError', async () => {
    fetchMock.mockRejectedValue(new TypeError('socket'));
    await expect(findProduct(ID)).rejects.toThrow();
  });

  it('takes the visitor from the headers it is given, not from the page request', async () => {
    fetchMock.mockResolvedValue(json(detail));
    const incoming = new Headers({
      'x-real-ip': '198.51.100.9',
      'x-request-id': 'a'.repeat(32),
    });
    await findProduct(ID, incoming);
    expect(headersOf(0).get('x-forwarded-for')).toBe('198.51.100.9');
    expect(headersOf(0).get('x-request-id')).toBe('a'.repeat(32));
  });
});

describe('getProductById', () => {
  it('reads a product once per render and id', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json(detail)));
    const [a, b] = await Promise.all([getProductById(ID), getProductById(ID)]);
    expect(b).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await getProductById(ID2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('remembers a missing product as null', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json({}, 404)));
    await expect(getProductById(ID)).resolves.toBeNull();
    await expect(getProductById(ID)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reads again in the next render', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json(detail)));
    await getProductById(ID);
    renderScope.values.clear();
    await getProductById(ID);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never goes through the page cache', async () => {
    fetchMock.mockResolvedValue(json(detail));
    await getProductById(ID);
    expect(headersOf(0).get('x-proxy-secret')).toBe(SECRET);
  });
});

describe('getRelatedProducts', () => {
  const related = [listItem(1), listItem(2)];

  it('reads /products/:id/related through the page cache, without the visitor', async () => {
    fetchMock.mockResolvedValue(json(related));
    await expect(getRelatedProducts({ id: ID })).resolves.toEqual(related);
    expect(urlOf(0).pathname).toBe(`/products/${ID}/related`);
    expect(headersOf(0).has('x-proxy-secret')).toBe(false);
    expect(headersOf(0).has('x-forwarded-for')).toBe(false);
  });

  it('reads on behalf of the visitor while the page cache is skipped', async () => {
    slot[SKIP] = Date.now() + 60_000;
    fetchMock.mockResolvedValue(json(related));
    await expect(getRelatedProducts({ id: ID })).resolves.toEqual(related);
    expect(headersOf(0).get('x-proxy-secret')).toBe(SECRET);
    expect(headersOf(0).get('x-forwarded-for')).toBe('203.0.113.7');
  });

  it.each([
    ['cached', undefined],
    ['skipped', Date.now() + 60_000],
  ])('throws the ApiError of a failed read (%s)', async (_name, skipUntil) => {
    if (skipUntil !== undefined) slot[SKIP] = skipUntil;
    fetchMock.mockResolvedValue(json({}, 500));
    const error = await getRelatedProducts({ id: ID }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'http', status: 500 });
  });

  it('refuses a schema mismatch', async () => {
    fetchMock.mockResolvedValue(json([{ ...listItem(1), updatedAt: undefined }]));
    await expect(getRelatedProducts({ id: ID })).rejects.toMatchObject({ kind: 'schema' });
  });
});

describe('getSitemapProducts', () => {
  it('reads the batches of 100 until the api has no cursor', async () => {
    fetchMock
      .mockResolvedValueOnce(json(batch(0, 100, 'c1')))
      .mockResolvedValueOnce(json(batch(100, 5, null)));
    const items = await getSitemapProducts(1000);
    expect(items).toHaveLength(105);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(urlOf(0).pathname).toBe('/products');
    expect(urlOf(0).searchParams.get('limit')).toBe('100');
    expect(urlOf(0).searchParams.has('cursor')).toBe(false);
    expect(urlOf(1).searchParams.get('limit')).toBe('100');
    expect(urlOf(1).searchParams.get('cursor')).toBe('c1');
  });

  it('goes through the page cache, without the visitor', async () => {
    fetchMock.mockResolvedValue(json(batch(0, 3, null)));
    await getSitemapProducts(10);
    expect(headersOf(0).has('x-proxy-secret')).toBe(false);
    expect(headersOf(0).has('x-forwarded-for')).toBe(false);
  });

  it('reads as the visitor while the page cache is skipped', async () => {
    slot[SKIP] = Date.now() + 60_000;
    fetchMock
      .mockResolvedValueOnce(json(batch(0, 100, 'c1')))
      .mockResolvedValueOnce(json(batch(100, 1, null)));
    await getSitemapProducts(1000);
    expect(headersOf(0).get('x-proxy-secret')).toBe(SECRET);
    expect(headersOf(1).get('x-proxy-secret')).toBe(SECRET);
    expect(urlOf(1).searchParams.get('cursor')).toBe('c1');
  });

  it('stops at max and cuts the last batch to it', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json(batch(0, 100, 'more'))));
    const items = await getSitemapProducts(150);
    expect(items).toHaveLength(150);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('asks no more batch once max is reached exactly', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json(batch(0, 100, 'more'))));
    expect(await getSitemapProducts(100)).toHaveLength(100);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('cuts a first batch bigger than max', async () => {
    fetchMock.mockResolvedValue(json(batch(0, 100, 'more')));
    expect(await getSitemapProducts(10)).toHaveLength(10);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns an empty list for an empty catalog', async () => {
    fetchMock.mockResolvedValue(json(batch(0, 0, null)));
    await expect(getSitemapProducts(10)).resolves.toEqual([]);
  });

  it('throws when a batch fails, even after a good one', async () => {
    fetchMock.mockResolvedValueOnce(json(batch(0, 100, 'c1'))).mockResolvedValueOnce(json({}, 500));
    await expect(getSitemapProducts(1000)).rejects.toMatchObject({ kind: 'http', status: 500 });
  });
});

describe('readFirstProduct', () => {
  it('reads the category newest product on behalf of the visitor, past the page cache', async () => {
    fetchMock.mockResolvedValue(json(batch(1, 1, null)));
    const first = await readFirstProduct(ID);
    expect(first?.id).toBe(listItem(1).id);
    expect(urlOf(0).pathname).toBe('/products');
    expect(urlOf(0).searchParams.getAll('categoryId')).toEqual([ID]);
    expect(urlOf(0).searchParams.get('limit')).toBe('1');
    expect(headersOf(0).get('x-proxy-secret')).toBe(SECRET);
  });

  it('answers undefined for a category without a product', async () => {
    fetchMock.mockResolvedValue(json(batch(0, 0, null)));
    await expect(readFirstProduct(ID)).resolves.toBeUndefined();
  });

  it('throws on a failed read', async () => {
    fetchMock.mockResolvedValue(json({}, 503));
    await expect(readFirstProduct(ID)).rejects.toMatchObject({ kind: 'http', status: 503 });
  });
});
