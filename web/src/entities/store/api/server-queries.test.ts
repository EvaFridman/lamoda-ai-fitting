// @vitest-environment node
import { QueryClient } from '@tanstack/react-query';
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

import { getStores, storeListOptions } from './server-queries';

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
const slot = globalThis as Record<symbol, unknown>;
const SKIP = Symbol.for('lamoda-ai-fitting.page-cache.skip-until');

function respondWith(body: unknown, status = 200): void {
  fetchMock.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  );
}

function requested(): URL {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  return new URL(String(fetchMock.mock.calls[0]?.[0]));
}

function sentHeaders(): Headers {
  return new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers);
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  delete slot[SKIP];
});

describe('getStores while the page cache is open', () => {
  it('reads /stores without the visitor or the proxy secret', async () => {
    respondWith([store]);
    await expect(getStores()).resolves.toEqual([store]);
    expect(requested().pathname).toBe('/stores');
    expect(requested().search).toBe('');
    expect(sentHeaders().has('x-proxy-secret')).toBe(false);
    expect(sentHeaders().has('x-forwarded-for')).toBe(false);
  });

  it('throws an ApiError for a 500', async () => {
    respondWith({}, 500);
    const error = await getStores().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'http', status: 500 });
  });
});

describe('getStores while the page cache is skipped', () => {
  beforeEach(() => {
    slot[SKIP] = Date.now() + 60_000;
  });

  it('reads /stores on behalf of the visitor and drops extra fields', async () => {
    respondWith([{ ...store, extra: 1 }]);
    await expect(getStores()).resolves.toEqual([store]);
    expect(requested().pathname).toBe('/stores');
    expect(sentHeaders().get('x-proxy-secret')).toBe('s'.repeat(32));
    expect(sentHeaders().get('x-forwarded-for')).toBe('203.0.113.7');
  });

  it('throws an ApiError for a 500', async () => {
    respondWith({}, 500);
    await expect(getStores()).rejects.toMatchObject({ kind: 'http', status: 500 });
  });

  it('rejects a body that fails the schema', async () => {
    respondWith([{ ...store, id: 'x' }]);
    await expect(getStores()).rejects.toMatchObject({ kind: 'schema' });
  });
});

describe('server storeListOptions', () => {
  it('runs getStores in its queryFn', async () => {
    respondWith([store]);
    await expect(new QueryClient().query(storeListOptions())).resolves.toEqual([store]);
    expect(requested().pathname).toBe('/stores');
  });
});
