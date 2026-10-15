// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/shared/config/server', () => ({
  getServerEnv: () => ({ API_URL: 'http://api:3000', PROXY_SECRET: '' }),
}));

import { attributeKeys } from './keys';
import {
  attributeListOptions,
  attributeOptions,
  attributeValueListOptions,
  getAttribute,
  getAttributes,
  getAttributeValues,
} from './server-queries';

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const ID2 = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const DATE = '2026-10-01T12:00:00.000Z';
const attribute = { id: ID, name: 'Color', createdAt: DATE, updatedAt: DATE };
const value = { id: ID2, attributeId: ID, value: 'Red', createdAt: DATE, updatedAt: DATE };

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

describe('getAttributes', () => {
  it('requests /attributes without a query by default and returns the page', async () => {
    const page = { items: [attribute], total: 1 };
    respondWith(page);
    await expect(getAttributes()).resolves.toEqual(page);
    const url = requested();
    expect(url.pathname).toBe('/attributes');
    expect(url.search).toBe('');
  });

  it('sends the page, leaves absent values out and ignores unknown keys', async () => {
    respondWith({ items: [], total: 0 });
    await getAttributes({ limit: 10, junk: 1 } as object);
    expect([...requested().searchParams.entries()]).toEqual([['limit', '10']]);
  });

  it('accepts extra fields and drops them', async () => {
    respondWith({ items: [{ ...attribute, extra: 1 }], total: 1, note: 'y' });
    await expect(getAttributes()).resolves.toEqual({ items: [attribute], total: 1 });
  });

  it.each([
    ['a wrong type', { items: [{ ...attribute, name: 5 }], total: 1 }],
    ['a missing field', { items: [{ ...attribute, name: undefined }], total: 1 }],
    ['a bad uuid', { items: [{ ...attribute, id: 'x' }], total: 1 }],
    ['a non-ISO date', { items: [{ ...attribute, createdAt: 'x' }], total: 1 }],
  ])('rejects %s with a schema error', async (_name, body) => {
    respondWith(body);
    await expect(getAttributes()).rejects.toMatchObject({ name: 'ApiError', kind: 'schema' });
  });

  it('propagates an http error', async () => {
    respondWith({}, 500);
    await expect(getAttributes()).rejects.toMatchObject({ kind: 'http', status: 500 });
  });
});

describe('getAttribute', () => {
  it('requests /attributes/:id without a query and returns the attribute', async () => {
    respondWith(attribute);
    await expect(getAttribute(ID)).resolves.toEqual(attribute);
    const url = requested();
    expect(url.pathname).toBe(`/attributes/${ID}`);
    expect(url.search).toBe('');
  });

  it('accepts extra fields and drops them', async () => {
    respondWith({ ...attribute, extra: 1 });
    await expect(getAttribute(ID)).resolves.toEqual(attribute);
  });

  it.each([
    ['a wrong type', { ...attribute, name: 5 }],
    ['a missing field', { ...attribute, name: undefined }],
    ['a bad uuid', { ...attribute, id: 'x' }],
    ['a non-ISO date', { ...attribute, createdAt: 'x' }],
  ])('rejects %s with a schema error', async (_name, body) => {
    respondWith(body);
    await expect(getAttribute(ID)).rejects.toMatchObject({ name: 'ApiError', kind: 'schema' });
  });

  it('propagates a 404 as an http error', async () => {
    respondWith({}, 404);
    await expect(getAttribute(ID)).rejects.toMatchObject({ kind: 'http', status: 404 });
  });

  it('keeps an id taken from input in one segment', async () => {
    respondWith(attribute);
    await getAttribute('../x');
    const url = requested();
    expect(url.origin).toBe('http://api:3000');
    expect(url.pathname).toBe('/attributes/..%2Fx');
  });

  it('refuses an empty id before any request', async () => {
    await expect(getAttribute('')).rejects.toMatchObject({ kind: 'path' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('attributeOptions', () => {
  it('uses the detail key of keys.ts', () => {
    expect(attributeOptions(ID).queryKey).toEqual(attributeKeys.detail(ID));
  });

  it('gives different keys for different ids', () => {
    expect(attributeOptions(ID).queryKey).not.toEqual(attributeOptions(ID2).queryKey);
  });

  it('does not share a key with the values of the same attribute', () => {
    expect(attributeOptions(ID).queryKey).not.toEqual(attributeKeys.values(ID));
  });

  it('runs the loader in queryFn', async () => {
    respondWith(attribute);
    await (attributeOptions(ID).queryFn as () => Promise<unknown>)();
    expect(requested().pathname).toBe(`/attributes/${ID}`);
  });
});

describe('getAttributeValues', () => {
  it('requests /attributes/:id/values with the page and returns it', async () => {
    const page = { items: [value], total: 1 };
    respondWith(page);
    await expect(getAttributeValues(ID, { limit: 5, offset: 10 })).resolves.toEqual(page);
    const url = requested();
    expect(url.pathname).toBe(`/attributes/${ID}/values`);
    expect(url.searchParams.get('limit')).toBe('5');
    expect(url.searchParams.get('offset')).toBe('10');
  });

  it('sends no query by default and ignores unknown keys', async () => {
    respondWith({ items: [], total: 0 });
    await getAttributeValues(ID, { sort: 'x' } as object);
    expect(requested().search).toBe('');
  });

  it('keeps an id taken from input in one segment', async () => {
    respondWith({ items: [], total: 0 });
    await getAttributeValues('../users');
    const url = requested();
    expect(url.origin).toBe('http://api:3000');
    expect(url.pathname).toBe('/attributes/..%2Fusers/values');
  });

  it('refuses an empty id before any request', async () => {
    await expect(getAttributeValues('')).rejects.toMatchObject({ kind: 'path' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts extra fields and drops them', async () => {
    respondWith({ items: [{ ...value, extra: 1 }], total: 1 });
    await expect(getAttributeValues(ID)).resolves.toEqual({ items: [value], total: 1 });
  });

  it.each([
    ['a bad uuid', { items: [{ ...value, attributeId: 'x' }], total: 1 }],
    ['a missing field', { items: [{ ...value, value: undefined }], total: 1 }],
    ['a non-ISO date', { items: [{ ...value, updatedAt: 'x' }], total: 1 }],
  ])('rejects %s with a schema error', async (_name, body) => {
    respondWith(body);
    await expect(getAttributeValues(ID)).rejects.toMatchObject({ kind: 'schema' });
  });

  it('propagates a 404 as an http error', async () => {
    respondWith({}, 404);
    await expect(getAttributeValues(ID)).rejects.toMatchObject({ kind: 'http', status: 404 });
  });
});

describe('attribute query options', () => {
  it('use the keys of keys.ts', () => {
    expect(attributeListOptions({ limit: 2 }).queryKey).toEqual(attributeKeys.list({ limit: 2 }));
    expect(attributeValueListOptions(ID, { limit: 2 }).queryKey).toEqual(
      attributeKeys.values(ID, { limit: 2 }),
    );
  });

  it('give equal keys for equal queries with extra unknown props', () => {
    expect(attributeListOptions({ limit: 1, junk: 1 } as object).queryKey).toEqual(
      attributeListOptions({ limit: 1 }).queryKey,
    );
    expect(attributeValueListOptions(ID, { limit: 1, junk: 1 } as object).queryKey).toEqual(
      attributeValueListOptions(ID, { limit: 1 }).queryKey,
    );
  });

  it('keep different attributes apart', () => {
    expect(attributeValueListOptions(ID).queryKey).not.toEqual(
      attributeValueListOptions(ID2).queryKey,
    );
  });

  it('run the loaders in queryFn', async () => {
    respondWith({ items: [], total: 0 });
    await (attributeListOptions({ limit: 3 }).queryFn as () => Promise<unknown>)();
    expect(requested().pathname).toBe('/attributes');
    fetchMock.mockClear();
    await (attributeValueListOptions(ID).queryFn as () => Promise<unknown>)();
    expect(requested().pathname).toBe(`/attributes/${ID}/values`);
  });
});
