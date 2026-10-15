// @vitest-environment node
import * as Sentry from '@sentry/nextjs';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { z } from 'zod';

vi.mock('server-only', () => ({}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

const state = vi.hoisted(() => ({
  incoming: new Headers(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(state.incoming) }));
vi.mock('@/shared/config/server', () => ({
  getServerEnv: () => ({ API_URL: 'http://api:3000', PROXY_SECRET: '' }),
}));

import { buildPath, type ApiPath } from './index';
import { apiFetch } from './server';

// Sentry's own type of the second argument is a union that hides `fingerprint` and `tags`.
const capture = vi.mocked(Sentry.captureException) as unknown as Mock<
  (error: unknown, hint?: { fingerprint?: string[]; tags?: Record<string, string> }) => void
>;
const fetchMock = vi.fn();
const schema = z.object({ ok: z.boolean() });
const ID = '0123456789abcdef0123456789abcdef';
const PATH = buildPath('/things/:id', { id: 'a' });

// The throttle map lives as long as the module: each test starts past every earlier window.
let clock = Date.now();

beforeEach(() => {
  capture.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  state.incoming = new Headers();
  vi.useFakeTimers();
  clock += 10 * 60_000;
  vi.setSystemTime(clock);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('apiFetch reporting', () => {
  it('tags the request id of the page request', async () => {
    state.incoming = new Headers({ 'x-request-id': ID });
    fetchMock.mockResolvedValue(new Response('{}', { status: 500 }));
    await apiFetch(PATH, schema).catch(() => undefined);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0]?.[1]?.tags).toEqual({ api_status: '500', request_id: ID });
  });

  it('sends no request_id tag when the incoming id is not valid', async () => {
    state.incoming = new Headers({ 'x-request-id': 'not-valid' });
    fetchMock.mockRejectedValue(new TypeError('down'));
    await apiFetch(PATH, schema).catch(() => undefined);
    expect(capture.mock.calls[0]?.[1]?.tags).toEqual({});
  });

  it('uses the method of init in the fingerprint', async () => {
    fetchMock.mockRejectedValue(new TypeError('down'));
    await apiFetch(PATH, schema, { method: 'post' }).catch(() => undefined);
    expect(capture.mock.calls[0]?.[1]?.fingerprint).toEqual([
      'api-failure',
      'network',
      'POST',
      '/things/:id',
    ]);
  });

  it('does not report a path that leaves the api origin', async () => {
    const forged = { path: '//evil.example/x', template: '/forged' } as unknown as ApiPath;
    await apiFetch(forged, schema).catch(() => undefined);
    expect(capture).not.toHaveBeenCalled();
  });

  it('does not report a path buildPath refused', async () => {
    await expect(
      (async () => apiFetch(buildPath('/things/:id', { id: '..' }), schema))(),
    ).rejects.toMatchObject({ kind: 'path' });
    expect(capture).not.toHaveBeenCalled();
  });

  it('does not report a 404', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 404 }));
    await apiFetch(PATH, schema).catch(() => undefined);
    expect(capture).not.toHaveBeenCalled();
  });
});
