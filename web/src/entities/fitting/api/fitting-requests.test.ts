import * as Sentry from '@sentry/nextjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import { ApiError } from '@/shared/api';

import { deleteFitting, regenerateFitting, startFitting } from './fitting-requests';

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const PRODUCT = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

const started = {
  id: ID,
  kind: 'single',
  parentId: null,
  status: 'pending',
  stage: 'queued',
  failureCode: null,
  countsAgainstLimit: true,
  regenerationFree: true,
  model: 'gpt-image-2',
  items: [],
  photoId: ID,
  resultUrl: null,
  createdAt: '2026-10-01T12:00:00.000Z',
  startedAt: null,
  finishedAt: null,
  estimatedSeconds: 40,
  repeated: false,
};

const startBody = {
  photoId: ID,
  kind: 'single' as const,
  items: [{ productId: PRODUCT }],
  promptText: 'без шапки',
};

const fetchMock = vi.fn();

function call(): { url: URL; init: RequestInit } {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
  return { url: new URL(String(url)), init };
}

function errorResponse(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: { code, message: 'm', details: [] } }), { status });
}

let clock = Date.now();

beforeEach(() => {
  clock += 10 * 60_000;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(clock);
  vi.mocked(Sentry.captureException).mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('startFitting', () => {
  it('posts the body as JSON to /api/fittings and resolves the started fitting on 201', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(started), { status: 201 }));
    await expect(startFitting(startBody)).resolves.toEqual(started);
    const { url, init } = call();
    expect(url.pathname).toBe('/api/fittings');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    expect(init.body).toBe(JSON.stringify(startBody));
  });

  it('resolves an earlier result on 200', async () => {
    const repeated = { ...started, status: 'completed', stage: 'done', repeated: true };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(repeated), { status: 200 }));
    await expect(startFitting(startBody)).resolves.toMatchObject({ repeated: true });
  });

  it('rejects 409 LIMIT_REACHED as an http ApiError', async () => {
    fetchMock.mockResolvedValue(errorResponse(409, 'LIMIT_REACHED'));
    const error = await startFitting(startBody).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'http', status: 409, code: 'LIMIT_REACHED' });
  });

  it('is not repeated after a 503', async () => {
    fetchMock.mockResolvedValue(errorResponse(503, 'SERVICE_UNAVAILABLE'));
    await expect(startFitting(startBody)).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails as schema when the answer lacks repeated', async () => {
    const { repeated: _repeated, ...rest } = started;
    fetchMock.mockResolvedValue(new Response(JSON.stringify(rest), { status: 201 }));
    await expect(startFitting(startBody)).rejects.toMatchObject({ kind: 'schema' });
  });
});

describe('regenerateFitting', () => {
  it('posts the reasons to /api/fittings/<id>/regenerate', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(started), { status: 201 }));
    const body = { reasons: ['face' as const, 'item' as const], comment: 'ближе' };
    await expect(regenerateFitting(ID, body)).resolves.toEqual(started);
    const { url, init } = call();
    expect(url.pathname).toBe(`/api/fittings/${ID}/regenerate`);
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    expect(init.body).toBe(JSON.stringify(body));
  });

  it('refuses an id that is not one path segment, before any request', () => {
    expect(() => regenerateFitting('..', { reasons: ['face'] })).toThrow(ApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects 409 NOT_COMPLETED', async () => {
    fetchMock.mockResolvedValue(errorResponse(409, 'NOT_COMPLETED'));
    await expect(regenerateFitting(ID, { reasons: ['face'] })).rejects.toMatchObject({
      kind: 'http',
      status: 409,
      code: 'NOT_COMPLETED',
    });
  });
});

describe('deleteFitting', () => {
  it('sends DELETE with no body and resolves undefined on 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(deleteFitting(ID)).resolves.toBeUndefined();
    const { url, init } = call();
    expect(url.pathname).toBe(`/api/fittings/${ID}`);
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
  });

  it('rejects 404 for a missing fitting', async () => {
    fetchMock.mockResolvedValue(errorResponse(404, 'NOT_FOUND'));
    await expect(deleteFitting(ID)).rejects.toMatchObject({ kind: 'http', status: 404 });
  });

  it('refuses a bad id before any request', () => {
    expect(() => deleteFitting('')).toThrow(ApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
