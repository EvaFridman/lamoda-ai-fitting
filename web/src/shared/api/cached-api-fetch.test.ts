// @vitest-environment node
import { cacheLife } from 'next/cache';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('server-only', () => ({}));

const state = vi.hoisted(() => ({
  env: {} as Record<string, string | number>,
  headersCalls: 0,
}));

vi.mock('next/headers', () => ({
  headers: () => {
    state.headersCalls += 1;
    return Promise.resolve(
      new Headers({ 'x-real-ip': '203.0.113.7', 'x-request-id': 'a'.repeat(32) }),
    );
  },
}));
vi.mock('@/shared/config/server', () => ({ getServerEnv: () => state.env }));
vi.mock('./report', () => ({ reportApiError: vi.fn(), reportFailure: vi.fn() }));

import { ApiError, buildPath, type ApiPath } from './index';
import { reportApiError } from './report';
import { cachedApiFetch, cachedData, pageCacheOpen } from './server';

const SECRET = 's'.repeat(32);
const schema = z.object({ ok: z.boolean() });
const THINGS = buildPath('/things/:id', { id: 'x' });
const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function forged(path: string): ApiPath {
  return { path, template: '/forged' } as unknown as ApiPath;
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })));
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(cacheLife).mockClear();
  vi.mocked(reportApiError).mockClear();
  state.headersCalls = 0;
  state.env = {
    API_URL: 'http://api:3000',
    PROXY_SECRET: SECRET,
    PAGE_CACHE_REVALIDATE_SECONDS: 45,
  };
});

describe('cachedApiFetch request', () => {
  it('sends nothing of the visitor and never reads headers()', async () => {
    await cachedApiFetch(THINGS, schema);
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const sent = new Headers(options.headers);
    expect(sent.has('x-proxy-secret')).toBe(false);
    expect(sent.has('x-forwarded-for')).toBe(false);
    expect(sent.has('x-request-id')).toBe(false);
    expect(state.headersCalls).toBe(0);
  });

  it('calls API_URL with redirect error and a timeout signal', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    await cachedApiFetch(buildPath('/things', {}, { x: 1 }), schema);
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://api:3000/things?x=1');
    expect(options.redirect).toBe('error');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(timeout).toHaveBeenCalledWith(5000);
    timeout.mockRestore();
  });

  it('returns the parsed data', async () => {
    await expect(cachedApiFetch(THINGS, schema)).resolves.toEqual({ data: { ok: true } });
  });
});

describe('cachedApiFetch lifetime', () => {
  it('asks for stale 60, the configured revalidate and an hour', async () => {
    await cachedApiFetch(THINGS, schema);
    expect(cacheLife).toHaveBeenCalledWith({ stale: 60, revalidate: 45, expire: 3600 });
    expect(cacheLife).not.toHaveBeenCalledWith({ revalidate: 0, expire: 0 });
  });

  it('keeps a failure out of the cache', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));
    await cachedApiFetch(THINGS, schema);
    expect(cacheLife).toHaveBeenLastCalledWith({ revalidate: 0, expire: 0 });
  });
});

describe('cachedApiFetch failures', () => {
  const details = [{ field: 'q', code: 'IS_STRING', message: 'bad' }];

  it.each([
    [
      'a 404 with an envelope',
      () =>
        fetchMock.mockResolvedValue(
          jsonResponse({ error: { code: 'NOT_FOUND', message: 'm', details } }, 404),
        ),
      { kind: 'http', status: 404, code: 'NOT_FOUND', details, method: 'GET' },
    ],
    [
      'a 500',
      () => fetchMock.mockResolvedValue(jsonResponse({}, 500)),
      { kind: 'http', status: 500, details: [], method: 'GET' },
    ],
    [
      'a timeout',
      () => fetchMock.mockRejectedValue(Object.assign(new Error('t'), { name: 'TimeoutError' })),
      { kind: 'timeout', method: 'GET' },
    ],
    [
      'a network error',
      () => fetchMock.mockRejectedValue(new TypeError('fetch failed')),
      { kind: 'network', method: 'GET' },
    ],
    [
      'a schema mismatch',
      () => fetchMock.mockResolvedValue(jsonResponse({ ok: 1 })),
      { kind: 'schema', method: 'GET' },
    ],
  ])('answers %s as a failure with the error fields', async (_name, arrange, expected) => {
    arrange();
    const read = await cachedApiFetch(THINGS, schema);
    expect(read).toHaveProperty('failure');
    const failure = (read as unknown as { failure: Record<string, unknown> }).failure;
    expect(failure).toMatchObject({ ...expected, template: '/things/:id' });
    expect(failure.message).toEqual(expect.stringContaining('/things/:id'));
  });

  it('answers a path leaving the api as a failure without calling fetch', async () => {
    const read = await cachedApiFetch(forged('//evil.example/x'), schema);
    expect(read).toMatchObject({
      failure: { kind: 'path', template: '/forged', message: 'path leaves the api: evil.example' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cacheLife).toHaveBeenLastCalledWith({ revalidate: 0, expire: 0 });
  });

  it('reports a failure once', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));
    await cachedApiFetch(THINGS, schema);
    expect(reportApiError).toHaveBeenCalledTimes(1);
    expect(reportApiError).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'http', status: 500 }),
      expect.anything(),
    );
  });

  it('throws what is not an ApiError', async () => {
    state.env = { ...state.env, API_URL: 'not a url' };
    await expect(cachedApiFetch(THINGS, schema)).rejects.not.toBeInstanceOf(ApiError);
  });
});

describe('pageCacheOpen', () => {
  const slot = globalThis as Record<symbol, unknown>;
  const SKIP_UNTIL = Symbol.for('lamoda-ai-fitting.page-cache.skip-until');

  afterEach(() => {
    delete slot[SKIP_UNTIL];
    vi.useRealTimers();
  });

  it('reads the slot the handler writes', () => {
    slot[SKIP_UNTIL] = Date.now() + 60_000;
    expect(pageCacheOpen()).toBe(false);
  });

  it('is open while the slot is unset', () => {
    expect(pageCacheOpen()).toBe(true);
  });

  it.each([
    ['a string', 'x'],
    ['null', null],
    ['an object', {}],
    ['undefined', undefined],
  ])('is open when the slot holds %s', (_name, value) => {
    slot[SKIP_UNTIL] = value;
    expect(pageCacheOpen()).toBe(true);
  });

  it('is closed until the time in the slot, open from then on', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    slot[SKIP_UNTIL] = 15_000;
    expect(pageCacheOpen()).toBe(false);
    vi.setSystemTime(14_999);
    expect(pageCacheOpen()).toBe(false);
    vi.setSystemTime(15_000);
    expect(pageCacheOpen()).toBe(true);
  });

  it('is open for a slot of 0 and for one in the past', () => {
    slot[SKIP_UNTIL] = 0;
    expect(pageCacheOpen()).toBe(true);
    slot[SKIP_UNTIL] = Date.now() - 1;
    expect(pageCacheOpen()).toBe(true);
  });
});

describe('cachedData', () => {
  it('returns the data', () => {
    expect(cachedData({ data: { ok: true } })).toEqual({ ok: true });
  });

  it('throws the failure again as an ApiError with the same fields', () => {
    const failure = {
      message: 'api answered 503: /things/:id',
      kind: 'http' as const,
      template: '/things/:id',
      method: 'GET',
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      details: [{ field: 'f', code: 'c', message: 'm' }],
    };
    let thrown: unknown;
    try {
      cachedData({ failure });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown).toMatchObject(failure);
  });

  it('rebuilds the error of a real failed read', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 404));
    const read = await cachedApiFetch(THINGS, schema);
    expect(() => cachedData(read)).toThrow(ApiError);
    expect(() => cachedData(read)).toThrow(expect.objectContaining({ kind: 'http', status: 404 }));
  });
});
