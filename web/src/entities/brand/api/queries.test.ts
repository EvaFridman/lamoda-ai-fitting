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
const DATE = '2026-10-01T12:00:00.000Z';
const brand = { id: ID, name: 'Brand', createdAt: DATE, updatedAt: DATE };

const fetchMock = vi.fn();

function requested(): URL {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  return new URL(String(fetchMock.mock.calls[0]?.[0]));
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify({ items: [brand], total: 1 }))),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('brand browser options', () => {
  it.each([
    ['no input', undefined],
    ['empty', {}],
    ['a page with a wider object', { limit: 5, offset: 10, junk: 1 } as object],
  ])('share the list key of the server for %s', (_name, input) => {
    expect(browser.brandListOptions(input).queryKey).toEqual(
      server.brandListOptions(input).queryKey,
    );
  });

  it('share the detail key of the server', () => {
    expect(browser.brandOptions(ID).queryKey).toEqual(server.brandOptions(ID).queryKey);
  });

  it('ask /api/brands on the site origin and return the validated page', async () => {
    const result = await new QueryClient().query(browser.brandListOptions({ offset: 20 }));
    expect(result).toEqual({ items: [brand], total: 1 });
    const url = requested();
    expect(url.origin).toBe(globalThis.location.origin);
    expect(url.pathname).toBe('/api/brands');
    expect(url.searchParams.get('offset')).toBe('20');
  });

  it('ask /api/brands/:id with the id in one segment', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify(brand))));
    await expect(new QueryClient().query(browser.brandOptions('a/b'))).resolves.toEqual(brand);
    expect(requested().pathname).toBe('/api/brands/a%2Fb');
  });

  it('reject a body that fails the schema', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ id: 1 }))));
    const error = await new QueryClient().query(browser.brandOptions(ID)).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'schema' });
  });

  it('pass an abortable signal to fetch', async () => {
    await new QueryClient().query(browser.brandListOptions());
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
