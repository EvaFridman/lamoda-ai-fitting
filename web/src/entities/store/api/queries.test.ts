import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/shared/config/server', () => ({
  getServerEnv: () => ({ API_URL: 'http://api:3000', PROXY_SECRET: '' }),
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import { ApiError } from '@/shared/api';

import { storeKeys } from './keys';
import * as browser from './queries';
import * as server from './server-queries';

const store = {
  id: '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b',
  name: 'ТЦ Охотный ряд Urban',
  type: 'urban',
  city: 'г. Москва',
  street: 'пл. Манежная',
  house: '1 с2',
  mall: 'Охотный ряд',
  latitude: 55.755804,
  longitude: 37.614608,
  metroStations: ['Охотный ряд'],
  workTime: 'пн–вс: 10:00–22:00',
  description: '',
  phones: ['+7 (917) 599–61–90'],
};

const fetchMock = vi.fn();

function respondWith(body: unknown): void {
  fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify(body))));
}

function requested(): URL {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  return new URL(String(fetchMock.mock.calls[0]?.[0]));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('store keys', () => {
  it('are the same on the server and in the browser', () => {
    expect(browser.storeListOptions().queryKey).toEqual(storeKeys.list());
    expect(server.storeListOptions().queryKey).toEqual(storeKeys.list());
  });
});

describe('browser store options', () => {
  it('ask /api/stores on the site origin and return the validated list', async () => {
    respondWith([{ ...store, extra: 1 }]);
    await expect(new QueryClient().query(browser.storeListOptions())).resolves.toEqual([store]);
    const url = requested();
    expect(url.origin).toBe(globalThis.location.origin);
    expect(url.pathname).toBe('/api/stores');
    expect(url.search).toBe('');
  });

  it('reject a body that fails the schema', async () => {
    respondWith([{ ...store, type: 'shop' }]);
    const error = await new QueryClient().query(browser.storeListOptions()).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'schema' });
  });
});
