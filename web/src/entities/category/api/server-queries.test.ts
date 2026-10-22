// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { categoryKeys } from './keys';
import {
  getActiveCategories,
  categoryListOptions,
  categoryOptions,
  findCategoryBySlug,
  getCategories,
  getCategory,
  getCategoryBySlug,
  readActiveCategories,
} from './server-queries';

const DATE = '2026-10-01T12:00:00.000Z';
const category = {
  id: '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b',
  name: 'Dresses',
  slug: 'dresses',
  isActive: true,
  description: null,
  sortOrder: 1,
  createdAt: DATE,
  updatedAt: DATE,
};

const fetchMock = vi.fn();

function respondWith(body: unknown, status = 200): void {
  fetchMock.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  );
}

function requested(): URL {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  return new URL(String(fetchMock.mock.calls[0]?.[0]));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

function sentHeaders(): Headers {
  return new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers);
}

describe('getCategories and the page cache', () => {
  it('reads a first page without the visitor or the proxy secret', async () => {
    respondWith({ items: [], total: 0 });
    await getCategories({ limit: 10, isActive: true });
    const sent = sentHeaders();
    expect(sent.has('x-proxy-secret')).toBe(false);
    expect(sent.has('x-forwarded-for')).toBe(false);
    expect(sent.has('x-request-id')).toBe(false);
    expect(requested().pathname).toBe('/categories');
  });

  it('reads a page with an offset on behalf of the visitor', async () => {
    respondWith({ items: [], total: 0 });
    await getCategories({ limit: 10, offset: 10 });
    const sent = sentHeaders();
    expect(sent.get('x-proxy-secret')).toBe('s'.repeat(32));
    expect(sent.get('x-forwarded-for')).toBe('203.0.113.7');
    expect(requested().searchParams.get('offset')).toBe('10');
    expect(requested().searchParams.get('limit')).toBe('10');
  });

  it('treats offset 0 as an offset', async () => {
    respondWith({ items: [], total: 0 });
    await getCategories({ offset: 0 });
    expect(sentHeaders().get('x-proxy-secret')).toBe('s'.repeat(32));
  });

  it('throws an ApiError from a cached first page', async () => {
    respondWith({}, 500);
    const error = await getCategories().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'http', status: 500 });
  });
});

describe('getCategories while the page cache is skipped', () => {
  const slot = globalThis as Record<symbol, unknown>;
  const SKIP = Symbol.for('lamoda-ai-fitting.page-cache.skip-until');

  afterEach(() => {
    delete slot[SKIP];
  });

  it('reads a first page on behalf of the visitor', async () => {
    slot[SKIP] = Date.now() + 60_000;
    respondWith({ items: [], total: 0 });
    await getCategories({ limit: 10, isActive: true });
    expect(sentHeaders().get('x-proxy-secret')).toBe('s'.repeat(32));
    expect(sentHeaders().get('x-forwarded-for')).toBe('203.0.113.7');
    expect(requested().pathname).toBe('/categories');
    expect(requested().searchParams.get('limit')).toBe('10');
  });

  it('goes through the cache again once the time has passed', async () => {
    slot[SKIP] = Date.now() - 1;
    respondWith({ items: [], total: 0 });
    await getCategories();
    expect(sentHeaders().has('x-proxy-secret')).toBe(false);
  });

  it('goes through the cache when the slot is 0', async () => {
    slot[SKIP] = 0;
    respondWith({ items: [], total: 0 });
    await getCategories();
    expect(sentHeaders().has('x-proxy-secret')).toBe(false);
  });
});

describe('getActiveCategories', () => {
  it('requests the active categories, 100 at most, from the cache without the visitor', async () => {
    respondWith({ items: [category], total: 1 });
    await expect(getActiveCategories()).resolves.toEqual({ items: [category], total: 1 });
    const url = requested();
    expect(url.pathname).toBe('/categories');
    expect(url.search).toBe('?limit=100&isActive=true');
    const sent = sentHeaders();
    expect(sent.has('x-proxy-secret')).toBe(false);
    expect(sent.has('x-forwarded-for')).toBe(false);
  });
});

describe('readActiveCategories', () => {
  it('asks for the same path as getActiveCategories, on the visitor behalf even with the cache open', async () => {
    respondWith({ items: [category], total: 1 });
    await getActiveCategories();
    const cachedPath = requested().pathname + requested().search;

    fetchMock.mockClear();
    respondWith({ items: [category], total: 1 });
    await readActiveCategories();
    const url = requested();
    expect(url.pathname + url.search).toBe(cachedPath);
    expect(url.search).toBe('?limit=100&isActive=true');
    const sent = sentHeaders();
    expect(sent.get('x-proxy-secret')).toBe('s'.repeat(32));
    expect(sent.get('x-forwarded-for')).toBe('203.0.113.7');
  });

  it('returns the parsed list and drops extra fields', async () => {
    respondWith({ items: [{ ...category, extra: 1 }], total: 1 });
    await expect(readActiveCategories()).resolves.toEqual({ items: [category], total: 1 });
  });

  it('reads the api on every call', async () => {
    respondWith({ items: [category], total: 1 });
    await readActiveCategories();
    await readActiveCategories();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('propagates an http failure as an ApiError', async () => {
    respondWith({}, 500);
    const error = await readActiveCategories().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'http', status: 500 });
  });

  it('propagates a network failure as an ApiError', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(readActiveCategories()).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('getCategories', () => {
  it('requests /categories without a query by default and returns the page', async () => {
    const page = { items: [category], total: 1 };
    respondWith(page);
    await expect(getCategories()).resolves.toEqual(page);
    const url = requested();
    expect(url.pathname).toBe('/categories');
    expect(url.search).toBe('');
  });

  it('sends the page and isActive, and leaves absent values out', async () => {
    respondWith({ items: [], total: 0 });
    await getCategories({ limit: 10, isActive: false });
    const { searchParams } = requested();
    expect(searchParams.get('limit')).toBe('10');
    expect(searchParams.get('isActive')).toBe('false');
    expect(searchParams.has('offset')).toBe(false);
  });

  it('does not send unknown keys of a wider object', async () => {
    respondWith({ items: [], total: 0 });
    await getCategories({ offset: 5, sort: 'x', admin: 1 } as object);
    expect([...requested().searchParams.keys()]).toEqual(['offset']);
  });

  it('accepts extra fields and drops them', async () => {
    respondWith({ items: [{ ...category, extra: 1 }], total: 1, note: 'y' });
    const result = await getCategories();
    expect(result).toEqual({ items: [category], total: 1 });
  });

  it.each([
    ['a wrong type', { items: [{ ...category, isActive: 'yes' }], total: 1 }],
    ['a missing field', { items: [{ ...category, slug: undefined }], total: 1 }],
    ['a bad uuid', { items: [{ ...category, id: 'x' }], total: 1 }],
    ['a non-ISO date', { items: [{ ...category, updatedAt: 'x' }], total: 1 }],
  ])('rejects %s with a schema error', async (_name, body) => {
    respondWith(body);
    await expect(getCategories()).rejects.toMatchObject({ name: 'ApiError', kind: 'schema' });
  });

  it('propagates an http error', async () => {
    respondWith({}, 500);
    await expect(getCategories()).rejects.toMatchObject({ kind: 'http', status: 500 });
  });
});

describe('getCategory', () => {
  it('requests /categories/:id without a query and returns the category', async () => {
    respondWith(category);
    await expect(getCategory(category.id)).resolves.toEqual(category);
    const url = requested();
    expect(url.pathname).toBe(`/categories/${category.id}`);
    expect(url.search).toBe('');
  });

  it('accepts extra fields and drops them', async () => {
    respondWith({ ...category, extra: 1 });
    await expect(getCategory(category.id)).resolves.toEqual(category);
  });

  it.each([
    ['a wrong type', { ...category, isActive: 'yes' }],
    ['a missing field', { ...category, slug: undefined }],
    ['a bad uuid', { ...category, id: 'x' }],
    ['a non-ISO date', { ...category, updatedAt: 'x' }],
  ])('rejects %s with a schema error', async (_name, body) => {
    respondWith(body);
    await expect(getCategory(category.id)).rejects.toMatchObject({
      name: 'ApiError',
      kind: 'schema',
    });
  });

  it('propagates a 404 as an http error', async () => {
    respondWith({}, 404);
    await expect(getCategory(category.id)).rejects.toMatchObject({ kind: 'http', status: 404 });
  });

  it('keeps an id taken from input in one segment', async () => {
    respondWith(category);
    await getCategory('../x');
    const url = requested();
    expect(url.origin).toBe('http://api:3000');
    expect(url.pathname).toBe('/categories/..%2Fx');
  });

  it('refuses an empty id before any request', async () => {
    await expect(getCategory('')).rejects.toMatchObject({ kind: 'path' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('findCategoryBySlug', () => {
  it('requests /categories/by-slug/:slug and returns the category', async () => {
    respondWith({ ...category, extra: 1 });
    await expect(findCategoryBySlug('dresses')).resolves.toEqual(category);
    expect(requested().pathname).toBe('/categories/by-slug/dresses');
  });

  it('keeps a slug taken from input in one segment', async () => {
    respondWith(category);
    await findCategoryBySlug('a/b');
    expect(requested().pathname).toBe('/categories/by-slug/a%2Fb');
  });

  it.each(['', '.', '..'])('answers null for %j without a request', async (slug) => {
    await expect(findCategoryBySlug(slug)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([400, 404])('answers null for an http %i', async (status) => {
    respondWith({}, status);
    await expect(findCategoryBySlug('x')).resolves.toBeNull();
  });

  it('rethrows a 500', async () => {
    respondWith({}, 500);
    await expect(findCategoryBySlug('x')).rejects.toMatchObject({ kind: 'http', status: 500 });
  });

  it('rethrows a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(findCategoryBySlug('x')).rejects.toMatchObject({ kind: 'network' });
  });

  it('rethrows a schema error', async () => {
    respondWith({ ...category, isActive: 'yes' });
    await expect(findCategoryBySlug('x')).rejects.toMatchObject({ kind: 'schema' });
  });

  it('takes the address from the given headers', async () => {
    respondWith(category);
    await findCategoryBySlug('x', new Headers({ 'x-real-ip': '203.0.113.7' }));
    const sent = (fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Headers;
    expect(sent.get('x-forwarded-for')).toBe('203.0.113.7');
  });
});

describe('getCategoryBySlug', () => {
  const SECRET = 's'.repeat(32);
  const inactive = { ...category, id: 'b1b2c3d4-5a4d-4e6f-8a9b-0c1d2e3f4a5b', slug: 'old' };

  interface Routes {
    list?: { body: unknown; status?: number };
    bySlug?: { body: unknown; status?: number };
  }

  function route({ list, bySlug }: Routes): void {
    fetchMock.mockImplementation((input: unknown) => {
      const { pathname } = new URL(String(input));
      const answer = pathname.startsWith('/categories/by-slug/') ? bySlug : list;
      return Promise.resolve(
        new Response(JSON.stringify(answer?.body ?? {}), { status: answer?.status ?? 200 }),
      );
    });
  }

  function calls(kind: 'list' | 'bySlug'): { url: URL; headers: Headers }[] {
    return fetchMock.mock.calls
      .map(([input, init]) => ({
        url: new URL(String(input)),
        headers: new Headers((init as RequestInit).headers),
      }))
      .filter(({ url }) => url.pathname.startsWith('/categories/by-slug/') === (kind === 'bySlug'));
  }

  it('returns a listed category from the cached list, with no by-slug request', async () => {
    route({ list: { body: { items: [inactive, category], total: 2 } } });
    await expect(getCategoryBySlug('dresses')).resolves.toEqual(category);
    expect(calls('bySlug')).toHaveLength(0);
    const [list, ...rest] = calls('list');
    expect(rest).toHaveLength(0);
    expect(list?.url.pathname).toBe('/categories');
    expect(list?.url.searchParams.get('isActive')).toBe('true');
    expect(list?.headers.has('x-proxy-secret')).toBe(false);
    expect(list?.headers.has('x-forwarded-for')).toBe(false);
  });

  it.each([
    ['inactive', 'old', 200],
    ['unknown', 'nothing', 404],
    ['new', 'fresh', 200],
  ])('reads %s slug on the visitor behalf', async (_name, slug, status) => {
    const found = { ...category, slug };
    route({
      list: { body: { items: [category], total: 1 } },
      bySlug: { body: status === 200 ? found : {}, status },
    });
    await expect(getCategoryBySlug(slug)).resolves.toEqual(status === 200 ? found : null);
    const [request, ...rest] = calls('bySlug');
    expect(rest).toHaveLength(0);
    expect(request?.url.pathname).toBe(`/categories/by-slug/${slug}`);
    expect(request?.headers.get('x-proxy-secret')).toBe(SECRET);
    expect(request?.headers.get('x-forwarded-for')).toBe('203.0.113.7');
  });

  it.each(['', '.', '..'])('answers null for %j without a by-slug request', async (slug) => {
    route({ list: { body: { items: [category], total: 1 } } });
    await expect(getCategoryBySlug(slug)).resolves.toBeNull();
    expect(calls('bySlug')).toHaveLength(0);
  });

  it('falls back to the visitor by-slug read when the list fails', async () => {
    route({ list: { body: {}, status: 500 }, bySlug: { body: category } });
    await expect(getCategoryBySlug('dresses')).resolves.toEqual(category);
    const [request] = calls('bySlug');
    expect(request?.headers.get('x-proxy-secret')).toBe(SECRET);
    expect(request?.headers.get('x-forwarded-for')).toBe('203.0.113.7');
  });

  it('answers null when the list fails and the slug is unknown', async () => {
    route({ list: { body: {}, status: 500 }, bySlug: { body: {}, status: 404 } });
    await expect(getCategoryBySlug('none')).resolves.toBeNull();
  });

  it('throws an ApiError for a 500 on the by-slug read', async () => {
    route({ list: { body: { items: [], total: 0 } }, bySlug: { body: {}, status: 500 } });
    const error = await getCategoryBySlug('x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'http', status: 500 });
  });
});

describe('categoryOptions', () => {
  it('uses the detail key of keys.ts', () => {
    expect(categoryOptions(category.id).queryKey).toEqual(categoryKeys.detail(category.id));
  });

  it('gives different keys for different ids', () => {
    expect(categoryOptions('a').queryKey).not.toEqual(categoryOptions('b').queryKey);
  });

  it('runs the loader in queryFn', async () => {
    respondWith(category);
    await (categoryOptions(category.id).queryFn as () => Promise<unknown>)();
    expect(requested().pathname).toBe(`/categories/${category.id}`);
  });
});

describe('categoryListOptions', () => {
  it('uses the key of keys.ts', () => {
    expect(categoryListOptions({ isActive: true }).queryKey).toEqual(
      categoryKeys.list({ isActive: true }),
    );
  });

  it('gives equal keys for equal queries with extra unknown props', () => {
    expect(categoryListOptions({ limit: 1, junk: 1 } as object).queryKey).toEqual(
      categoryListOptions({ limit: 1 }).queryKey,
    );
  });

  it('gives different keys for different queries', () => {
    expect(categoryListOptions({ isActive: true }).queryKey).not.toEqual(
      categoryListOptions({ isActive: false }).queryKey,
    );
  });

  it('runs the loader in queryFn', async () => {
    respondWith({ items: [], total: 0 });
    await (categoryListOptions({ limit: 3 }).queryFn as () => Promise<unknown>)();
    expect(requested().searchParams.get('limit')).toBe('3');
  });
});
