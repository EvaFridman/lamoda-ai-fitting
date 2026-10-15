// @vitest-environment node
import * as Sentry from '@sentry/nextjs';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { z } from 'zod';

import { callApi } from './call-api';
import { ApiError, buildPath } from './index';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

// Sentry's own type of the second argument is a union that hides `fingerprint` and `tags`.
const capture = vi.mocked(Sentry.captureException) as unknown as Mock<
  (error: unknown, hint?: { fingerprint?: string[]; tags?: Record<string, string> }) => void
>;
const fetchMock = vi.fn();
const schema = z.object({ ok: z.boolean() });
const PATH = buildPath('/things/:id', { id: 'a' });
const URL_ = new URL('http://api:3000/things/a');

// The throttle map lives as long as the module: each test starts past every earlier window.
let clock = Date.now();

async function failure(init: RequestInit = {}, context = {}): Promise<ApiError> {
  const error = await callApi(URL_, PATH, schema, init, context).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

beforeEach(() => {
  capture.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers();
  clock += 10 * 60_000;
  vi.setSystemTime(clock);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('callApi reporting', () => {
  it.each([
    ['network', () => fetchMock.mockRejectedValue(new TypeError('fetch failed'))],
    [
      'timeout',
      () => fetchMock.mockRejectedValue(Object.assign(new Error('t'), { name: 'TimeoutError' })),
    ],
    ['schema', () => fetchMock.mockResolvedValue(new Response('{"ok":"yes"}'))],
    ['http 500', () => fetchMock.mockResolvedValue(new Response('{}', { status: 500 }))],
    ['http 502 html', () => fetchMock.mockResolvedValue(new Response('<html>', { status: 502 }))],
    ['http 401', () => fetchMock.mockResolvedValue(new Response('{}', { status: 401 }))],
  ])('reports %s once, with the error it throws', async (_name, arrange) => {
    arrange();
    const error = await failure();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0]?.[0]).toBe(error);
  });

  it.each([400, 404, 409, 413, 429])('does not report http %i', async (status) => {
    fetchMock.mockResolvedValue(new Response('{}', { status }));
    await failure();
    expect(capture).not.toHaveBeenCalled();
  });

  it('reports nothing on success', async () => {
    fetchMock.mockResolvedValue(new Response('{"ok":true}'));
    await callApi(URL_, PATH, schema, {});
    expect(capture).not.toHaveBeenCalled();
  });

  it('puts the upper-cased method on the error, GET by default', async () => {
    fetchMock.mockRejectedValue(new TypeError('x'));
    expect((await failure()).method).toBe('GET');
    expect((await failure({ method: 'post' })).method).toBe('POST');
  });

  it('fingerprints by method and template, not by path', async () => {
    fetchMock.mockRejectedValue(new TypeError('x'));
    await failure({ method: 'patch' });
    expect(capture.mock.calls[0]?.[1]?.fingerprint).toEqual([
      'api-failure',
      'network',
      'PATCH',
      '/things/:id',
    ]);
    expect(JSON.stringify(capture.mock.calls[0]?.[1])).not.toContain('/things/a');
  });

  it('tags the status and code of the answer and the request id of the context', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'm', details: [] } }),
        {
          status: 500,
        },
      ),
    );
    await failure({}, { requestId: 'b'.repeat(32) });
    expect(capture.mock.calls[0]?.[1]?.tags).toEqual({
      api_status: '500',
      api_code: 'INTERNAL_ERROR',
      request_id: 'b'.repeat(32),
    });
  });

  it('sends one event for ten identical failures within a minute', async () => {
    fetchMock.mockRejectedValue(new TypeError('x'));
    for (let i = 0; i < 10; i++) await failure();
    expect(capture).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    await failure();
    expect(capture).toHaveBeenCalledTimes(2);
  });

  describe('an error answer whose body cannot be read (H30)', () => {
    function cut(status: number, reason: unknown): void {
      const response = new Response('{}', { status });
      vi.spyOn(response, 'json').mockRejectedValue(reason);
      fetchMock.mockResolvedValue(response);
    }

    it('stays http with its status and no code, and a 503 is reported', async () => {
      cut(503, new TypeError('terminated'));
      const error = await failure();
      expect(error).toMatchObject({ kind: 'http', status: 503 });
      expect(error.code).toBeUndefined();
      expect(capture).toHaveBeenCalledTimes(1);
      expect(capture.mock.calls[0]?.[1]?.tags).toEqual({ api_status: '503' });
    });

    it('stays http when the read times out, and a 404 is not reported', async () => {
      cut(404, Object.assign(new Error('t'), { name: 'TimeoutError' }));
      const error = await failure();
      expect(error).toMatchObject({ kind: 'http', status: 404 });
      expect(error.code).toBeUndefined();
      expect(capture).not.toHaveBeenCalled();
    });

    it('stays http when the stream errors', async () => {
      const body = new ReadableStream({
        start(controller) {
          controller.error(new TypeError('terminated'));
        },
      });
      fetchMock.mockResolvedValue(new Response(body, { status: 500 }));
      expect(await failure()).toMatchObject({ kind: 'http', status: 500 });
    });
  });
});
