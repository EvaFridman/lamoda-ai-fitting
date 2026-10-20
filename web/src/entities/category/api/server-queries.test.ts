// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/shared/config/server', () => ({
  getServerEnv: () => ({ API_URL: 'http://api:3000', PROXY_SECRET: '' }),
}));

import { categoryKeys } from './keys';
import {
  categoryListOptions,
  categoryOptions,
  findCategoryBySlug,
  getCategories,
  getCategory,
  getCategoryBySlug,
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
  it('finds a category and answers null for a missing one', async () => {
    respondWith(category);
    await expect(getCategoryBySlug('dresses')).resolves.toEqual(category);
    respondWith({}, 404);
    await expect(getCategoryBySlug('none')).resolves.toBeNull();
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
