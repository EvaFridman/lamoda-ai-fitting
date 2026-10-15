// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/shared/config/server', () => ({
  getServerEnv: () => ({ API_URL: 'http://api:3000', PROXY_SECRET: '' }),
}));

import { brandKeys } from './keys';
import { brandListOptions, brandOptions, getBrand, getBrands } from './server-queries';

const DATE = '2026-10-01T12:00:00.000Z';
const brand = {
  id: '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b',
  name: 'Brand',
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

describe('getBrands', () => {
  it('requests /brands without a query by default and returns the page', async () => {
    const page = { items: [brand], total: 1 };
    respondWith(page);
    await expect(getBrands()).resolves.toEqual(page);
    const url = requested();
    expect(url.pathname).toBe('/brands');
    expect(url.search).toBe('');
  });

  it('sends the page and leaves absent values out', async () => {
    respondWith({ items: [], total: 0 });
    await getBrands({ limit: 10 });
    const { searchParams } = requested();
    expect(searchParams.get('limit')).toBe('10');
    expect(searchParams.has('offset')).toBe(false);
  });

  it('does not send unknown keys of a wider object', async () => {
    respondWith({ items: [], total: 0 });
    await getBrands({ offset: 5, isActive: true, q: 'x' } as object);
    expect([...requested().searchParams.keys()]).toEqual(['offset']);
  });

  it('accepts extra fields and drops them', async () => {
    respondWith({ items: [{ ...brand, extra: 1 }], total: 1, note: 'y' });
    await expect(getBrands()).resolves.toEqual({ items: [brand], total: 1 });
  });

  it.each([
    ['a wrong type', { items: [{ ...brand, name: 5 }], total: 1 }],
    ['a missing field', { items: [{ ...brand, name: undefined }], total: 1 }],
    ['a bad uuid', { items: [{ ...brand, id: 'x' }], total: 1 }],
    ['a non-ISO date', { items: [{ ...brand, createdAt: 'x' }], total: 1 }],
  ])('rejects %s with a schema error', async (_name, body) => {
    respondWith(body);
    await expect(getBrands()).rejects.toMatchObject({ name: 'ApiError', kind: 'schema' });
  });

  it('propagates an http error', async () => {
    respondWith({}, 500);
    await expect(getBrands()).rejects.toMatchObject({ kind: 'http', status: 500 });
  });
});

describe('getBrand', () => {
  it('requests /brands/:id without a query and returns the brand', async () => {
    respondWith(brand);
    await expect(getBrand(brand.id)).resolves.toEqual(brand);
    const url = requested();
    expect(url.pathname).toBe(`/brands/${brand.id}`);
    expect(url.search).toBe('');
  });

  it('accepts extra fields and drops them', async () => {
    respondWith({ ...brand, extra: 1 });
    await expect(getBrand(brand.id)).resolves.toEqual(brand);
  });

  it.each([
    ['a wrong type', { ...brand, name: 5 }],
    ['a missing field', { ...brand, name: undefined }],
    ['a bad uuid', { ...brand, id: 'x' }],
    ['a non-ISO date', { ...brand, createdAt: 'x' }],
  ])('rejects %s with a schema error', async (_name, body) => {
    respondWith(body);
    await expect(getBrand(brand.id)).rejects.toMatchObject({ name: 'ApiError', kind: 'schema' });
  });

  it('propagates a 404 as an http error', async () => {
    respondWith({}, 404);
    await expect(getBrand(brand.id)).rejects.toMatchObject({ kind: 'http', status: 404 });
  });

  it('keeps an id taken from input in one segment', async () => {
    respondWith(brand);
    await getBrand('../x');
    const url = requested();
    expect(url.origin).toBe('http://api:3000');
    expect(url.pathname).toBe('/brands/..%2Fx');
  });

  it('refuses an empty id before any request', async () => {
    await expect(getBrand('')).rejects.toMatchObject({ kind: 'path' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('brandOptions', () => {
  it('uses the detail key of keys.ts', () => {
    expect(brandOptions(brand.id).queryKey).toEqual(brandKeys.detail(brand.id));
  });

  it('gives different keys for different ids', () => {
    expect(brandOptions('a').queryKey).not.toEqual(brandOptions('b').queryKey);
  });

  it('runs the loader in queryFn', async () => {
    respondWith(brand);
    await (brandOptions(brand.id).queryFn as () => Promise<unknown>)();
    expect(requested().pathname).toBe(`/brands/${brand.id}`);
  });
});

describe('brandListOptions', () => {
  it('uses the key of keys.ts', () => {
    expect(brandListOptions({ limit: 2 }).queryKey).toEqual(brandKeys.list({ limit: 2 }));
  });

  it('gives equal keys for equal queries with extra unknown props', () => {
    expect(brandListOptions({ limit: 1, junk: 1 } as object).queryKey).toEqual(
      brandListOptions({ limit: 1 }).queryKey,
    );
  });

  it('gives different keys for different queries', () => {
    expect(brandListOptions({ limit: 1 }).queryKey).not.toEqual(
      brandListOptions({ limit: 2 }).queryKey,
    );
  });

  it('runs the loader in queryFn', async () => {
    respondWith({ items: [], total: 0 });
    await (brandListOptions({ limit: 3 }).queryFn as () => Promise<unknown>)();
    expect(requested().searchParams.get('limit')).toBe('3');
  });
});
