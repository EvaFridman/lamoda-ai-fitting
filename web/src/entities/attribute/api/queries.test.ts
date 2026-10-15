import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/shared/config/server', () => ({
  getServerEnv: () => ({ API_URL: 'http://api:3000', PROXY_SECRET: '' }),
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import { ApiError } from '@/shared/api';

import * as browser from './queries';
import * as server from './server-queries';

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const ID2 = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const DATE = '2026-10-01T12:00:00.000Z';
const attribute = { id: ID, name: 'Color', createdAt: DATE, updatedAt: DATE };
const value = {
  id: ID2,
  attributeId: ID,
  value: 'Red',
  colorHex: '#FF0000',
  createdAt: DATE,
  updatedAt: DATE,
};

const fetchMock = vi.fn();

function requested(): URL {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  return new URL(String(fetchMock.mock.calls[0]?.[0]));
}

function respondWith(body: unknown): void {
  fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify(body))));
}

beforeEach(() => {
  fetchMock.mockReset();
  respondWith({ items: [attribute], total: 1 });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('attribute browser options', () => {
  it.each([
    ['no input', undefined],
    ['a page with a wider object', { limit: 5, offset: 10, junk: 1 } as object],
  ])('share the keys of the server for %s', (_name, input) => {
    expect(browser.attributeListOptions(input).queryKey).toEqual(
      server.attributeListOptions(input).queryKey,
    );
    expect(browser.attributeValueListOptions(ID, input).queryKey).toEqual(
      server.attributeValueListOptions(ID, input).queryKey,
    );
  });

  it('share the detail key of the server', () => {
    expect(browser.attributeOptions(ID).queryKey).toEqual(server.attributeOptions(ID).queryKey);
  });

  it('ask /api/attributes on the site origin and return the validated page', async () => {
    const result = await new QueryClient().query(browser.attributeListOptions({ limit: 3 }));
    expect(result).toEqual({ items: [attribute], total: 1 });
    const url = requested();
    expect(url.origin).toBe(globalThis.location.origin);
    expect(url.pathname).toBe('/api/attributes');
    expect(url.searchParams.get('limit')).toBe('3');
  });

  it('ask /api/attributes/:id with the id in one segment', async () => {
    respondWith(attribute);
    await new QueryClient().query(browser.attributeOptions('a/b'));
    expect(requested().pathname).toBe('/api/attributes/a%2Fb');
  });

  it('ask /api/attributes/:id/values with the page', async () => {
    respondWith({ items: [value], total: 1 });
    const result = await new QueryClient().query(
      browser.attributeValueListOptions(ID, { limit: 2, offset: 4 }),
    );
    expect(result).toEqual({ items: [value], total: 1 });
    const url = requested();
    expect(url.pathname).toBe(`/api/attributes/${ID}/values`);
    expect(url.searchParams.get('limit')).toBe('2');
    expect(url.searchParams.get('offset')).toBe('4');
  });

  it('refuse an empty id before any request', async () => {
    const error = await new QueryClient()
      .query(browser.attributeValueListOptions(''))
      .catch((e) => e);
    expect(error).toMatchObject({ kind: 'path' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reject a body that fails the schema', async () => {
    respondWith({ items: [{ ...value, attributeId: 'x' }], total: 1 });
    const error = await new QueryClient()
      .query(browser.attributeValueListOptions(ID))
      .catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'schema' });
  });

  it('pass an abortable signal to fetch', async () => {
    await new QueryClient().query(browser.attributeListOptions());
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
