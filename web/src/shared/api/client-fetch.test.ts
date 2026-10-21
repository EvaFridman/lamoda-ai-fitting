// @vitest-environment node
import * as Sentry from '@sentry/nextjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ApiError, buildPath, clientFetch, type ApiPath } from './index';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

const ORIGIN = 'https://site.example';
const schema = z.object({ ok: z.boolean() });
const THINGS = buildPath('/things');
const fetchMock = vi.fn();
const capture = vi.mocked(Sentry.captureException);

// A path buildPath would never make, to check that the origin stays the site's.
function forged(path: string): ApiPath {
  return { path, template: '/forged' } as unknown as ApiPath;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function options(): RequestInit {
  return fetchMock.mock.calls[0]?.[1] as RequestInit;
}

// The report throttle lives as long as the module: each test starts past every earlier window.
let clock = Date.now();

beforeEach(() => {
  clock += 10 * 60_000;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(clock);
  capture.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('location', { origin: ORIGIN });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('clientFetch request', () => {
  it('calls the same origin under /api and returns the parsed body', async () => {
    await expect(clientFetch(THINGS, schema)).resolves.toEqual({ ok: true });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${ORIGIN}/api/things`);
  });

  it('keeps the query and the encoded param', async () => {
    const path = buildPath('/products/:id', { id: 'a/b' }, { brand: 'x y', page: 2 });
    await clientFetch(path, schema);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.origin).toBe(ORIGIN);
    expect(url.pathname).toBe('/api/products/a%2Fb');
    expect(url.searchParams.get('brand')).toBe('x y');
    expect(url.searchParams.get('page')).toBe('2');
  });

  it('sets redirect error, even over a caller value', async () => {
    await clientFetch(THINGS, schema, { redirect: 'follow' });
    expect(options().redirect).toBe('error');
  });

  it('adds no proxy, forwarded or request id headers of its own', async () => {
    await clientFetch(THINGS, schema);
    const headers = new Headers(options().headers);
    expect(headers.has('x-proxy-secret')).toBe(false);
    expect(headers.has('x-forwarded-for')).toBe(false);
    expect(headers.has('x-request-id')).toBe(false);
  });

  it('keeps the other init options', async () => {
    await clientFetch(THINGS, schema, { method: 'POST', body: '{}' });
    expect(options()).toMatchObject({ method: 'POST', body: '{}' });
  });

  it('sends a 15 s timeout signal', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    await clientFetch(THINGS, schema);
    expect(timeout).toHaveBeenCalledWith(15_000);
    expect(options().signal).toBeInstanceOf(AbortSignal);
  });
});

describe('clientFetch origin', () => {
  it.each(['//evil.example/x', 'https://evil.example/x', '/\\evil.example/x'])(
    'sends %s nowhere but this origin',
    async (path) => {
      const result = await clientFetch(forged(path), schema).catch((e: unknown) => e);
      if (result instanceof ApiError) {
        expect(result.kind).toBe('path');
      }
      for (const call of fetchMock.mock.calls) {
        expect(new URL(String(call[0])).origin).toBe(ORIGIN);
      }
    },
  );

  it('refuses a path that would leave the origin, before any request', async () => {
    const error = await clientFetch(forged('//evil.example/x'), schema).catch((e: unknown) => e);
    // Under the /api prefix the path stays on the site; either outcome is safe.
    if (error instanceof ApiError) {
      expect(error).toMatchObject({ kind: 'path', template: '/forged' });
      expect(fetchMock).not.toHaveBeenCalled();
    } else {
      expect(String(fetchMock.mock.calls[0]?.[0]).startsWith(`${ORIGIN}/api/`)).toBe(true);
    }
  });
});

describe('clientFetch errors', () => {
  it('turns an error answer into ApiError with status, code and details', async () => {
    const details = [{ field: 'name', code: 'REQUIRED', message: 'name is required' }];
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'VALIDATION_FAILED', message: 'm', details } }, 400),
    );
    const error = (await clientFetch(THINGS, schema).catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      kind: 'http',
      status: 400,
      code: 'VALIDATION_FAILED',
      details,
      template: '/things',
    });
  });

  it('is a schema error when the body does not match', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: 'yes' }));
    await expect(clientFetch(THINGS, schema)).rejects.toMatchObject({ kind: 'schema' });
  });

  it('is a network error when the request fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(clientFetch(THINGS, schema)).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('clientFetch with a null schema', () => {
  it('resolves a 204 to undefined', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(clientFetch(THINGS, null, { method: 'DELETE' })).resolves.toBeUndefined();
    expect(options()).toMatchObject({ method: 'DELETE', redirect: 'error' });
  });

  it('fails as schema, and reports it, for a 200 with a body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await expect(clientFetch(THINGS, null)).rejects.toMatchObject({ kind: 'schema' });
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('keeps status and code of an error answer', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'm' } }, 401),
    );
    await expect(clientFetch(THINGS, null)).rejects.toMatchObject({
      kind: 'http',
      status: 401,
      code: 'UNAUTHORIZED',
    });
  });
});

describe('clientFetch with an expected status', () => {
  const unauthorized = (): Response =>
    jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'm', details: [] } }, 401);

  it('throws the expected status as an ApiError without reporting it', async () => {
    fetchMock.mockResolvedValue(unauthorized());
    await expect(
      clientFetch(THINGS, null, undefined, { expectedStatus: 401 }),
    ).rejects.toMatchObject({ kind: 'http', status: 401, code: 'UNAUTHORIZED' });
    expect(capture).not.toHaveBeenCalled();
  });

  it('reports the same status when it is not the expected one', async () => {
    fetchMock.mockResolvedValue(unauthorized());
    await expect(clientFetch(THINGS, null)).rejects.toMatchObject({ status: 401 });
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('reports another http status', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: 'SERVICE_UNAVAILABLE' } }, 503));
    await expect(
      clientFetch(THINGS, null, undefined, { expectedStatus: 401 }),
    ).rejects.toMatchObject({ kind: 'http', status: 503 });
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('reports a 5xx even when it is the expected status', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: 'SERVICE_UNAVAILABLE' } }, 503));
    await expect(
      clientFetch(THINGS, null, undefined, { expectedStatus: 503 }),
    ).rejects.toMatchObject({ kind: 'http', status: 503 });
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('reports a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      clientFetch(THINGS, null, undefined, { expectedStatus: 401 }),
    ).rejects.toMatchObject({ kind: 'network' });
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('reports a schema failure even when the status matches no error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: 'yes' }));
    await expect(
      clientFetch(THINGS, schema, undefined, { expectedStatus: 200 }),
    ).rejects.toMatchObject({ kind: 'schema' });
    expect(capture).toHaveBeenCalledTimes(1);
  });
});

describe('clientFetch without AbortSignal.any', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'AbortSignal',
      Object.assign(function Signal() {}, {
        timeout: AbortSignal.timeout.bind(AbortSignal),
        any: undefined,
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function fetchUntilAborted(): void {
    fetchMock.mockImplementation(
      (_url: unknown, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = init.signal as AbortSignal;
          if (signal.aborted) {
            reject(signal.reason);
            return;
          }
          signal.addEventListener('abort', () => reject(signal.reason));
        }),
    );
  }

  it('works without a caller signal', async () => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('location', { origin: ORIGIN });
    await expect(clientFetch(THINGS, schema)).resolves.toEqual({ ok: true });
  });

  it('works with a caller signal that never fires', async () => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('location', { origin: ORIGIN });
    const caller = new AbortController();
    await expect(clientFetch(THINGS, schema, { signal: caller.signal })).resolves.toEqual({
      ok: true,
    });
  });

  it('gives kind timeout when the timeout fires with a caller signal', async () => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('location', { origin: ORIGIN });
    const timer = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timer.signal);
    fetchUntilAborted();
    const caller = new AbortController();
    const pending = clientFetch(THINGS, schema, { signal: caller.signal }).catch((e: unknown) => e);
    timer.abort(new DOMException('timed out', 'TimeoutError'));
    await expect(pending).resolves.toMatchObject({ kind: 'timeout' });
  });

  it('rethrows the AbortError when the caller aborts, unreported', async () => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('location', { origin: ORIGIN });
    fetchUntilAborted();
    const caller = new AbortController();
    const pending = clientFetch(THINGS, schema, { signal: caller.signal }).catch((e: unknown) => e);
    caller.abort();
    const error = await pending;
    expect(error).not.toBeInstanceOf(ApiError);
    expect((error as Error).name).toBe('AbortError');
    expect(capture).not.toHaveBeenCalled();
  });

  it('aborts at once when the caller signal is already aborted', async () => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('location', { origin: ORIGIN });
    fetchUntilAborted();
    const caller = new AbortController();
    caller.abort();
    const error = await clientFetch(THINGS, schema, { signal: caller.signal }).catch(
      (e: unknown) => e,
    );
    expect(error).not.toBeInstanceOf(ApiError);
    expect((error as Error).name).toBe('AbortError');
  });
});

describe('clientFetch cancelling', () => {
  // A fetch that rejects with the signal's reason once it aborts, as the browser's does.
  function fetchUntilAborted(): void {
    fetchMock.mockImplementation(
      (_url: unknown, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = init.signal as AbortSignal;
          if (signal.aborted) {
            reject(signal.reason);
            return;
          }
          signal.addEventListener('abort', () => reject(signal.reason));
        }),
    );
  }

  it('is a timeout error when the 15 s signal fires, and it is reported', async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    fetchUntilAborted();
    const pending = clientFetch(THINGS, schema).catch((e: unknown) => e);
    controller.abort(new DOMException('timed out', 'TimeoutError'));
    const error = (await pending) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.kind).toBe('timeout');
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('rejects with the AbortError itself when the caller aborts, and reports nothing', async () => {
    fetchUntilAborted();
    const caller = new AbortController();
    const pending = clientFetch(THINGS, schema, { signal: caller.signal }).catch((e: unknown) => e);
    caller.abort();
    const error = await pending;
    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe('AbortError');
    expect(capture).not.toHaveBeenCalled();
  });

  it('rejects at once with the AbortError when the caller signal is already aborted', async () => {
    fetchUntilAborted();
    const caller = new AbortController();
    caller.abort();
    const error = await clientFetch(THINGS, schema, { signal: caller.signal }).catch(
      (e: unknown) => e,
    );
    expect(error).not.toBeInstanceOf(ApiError);
    expect((error as Error).name).toBe('AbortError');
    expect(capture).not.toHaveBeenCalled();
  });

  it('still times out when a caller signal is given', async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    fetchUntilAborted();
    const caller = new AbortController();
    const pending = clientFetch(THINGS, schema, { signal: caller.signal }).catch((e: unknown) => e);
    controller.abort(new DOMException('timed out', 'TimeoutError'));
    await expect(pending).resolves.toMatchObject({ kind: 'timeout' });
  });

  it('rethrows an AbortError raised while reading an error answer, unreported', async () => {
    const response = new Response('{}', { status: 500 });
    vi.spyOn(response, 'json').mockRejectedValue(new DOMException('aborted', 'AbortError'));
    fetchMock.mockResolvedValue(response);
    const error = await clientFetch(THINGS, schema).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(ApiError);
    expect((error as Error).name).toBe('AbortError');
    expect(capture).not.toHaveBeenCalled();
  });

  it('rethrows an AbortError raised while reading the body, unreported', async () => {
    const response = new Response('{}');
    vi.spyOn(response, 'json').mockRejectedValue(new DOMException('aborted', 'AbortError'));
    fetchMock.mockResolvedValue(response);
    const error = await clientFetch(THINGS, schema).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(ApiError);
    expect((error as Error).name).toBe('AbortError');
    expect(capture).not.toHaveBeenCalled();
  });
});
