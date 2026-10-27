import * as Sentry from '@sentry/nextjs';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import { ApiError } from '@/shared/api';

import { userKeys } from './keys';
import { deleteMe, updateMe } from './me-requests';
import { meQueryOptions } from './queries';

const DATE = '2026-10-01T12:00:00.000Z';
const user = {
  id: '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b',
  phone: null,
  email: 'eva@example.com',
  firstName: 'Ева',
  lastName: null,
  patronymic: null,
  dateOfBirth: null,
  gender: null,
  fittingProfileImageKey: null,
  fittingProfileImageUrl: null,
  photoConsentVersion: null,
  createdAt: DATE,
  updatedAt: DATE,
};

const fetchMock = vi.fn();

function call(): { url: URL; init: RequestInit } {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
  return { url: new URL(String(url)), init };
}

// The report throttle lives as long as the module: each test starts past every earlier window.
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
  vi.unstubAllGlobals();
});

describe('meQueryOptions', () => {
  it('uses the userKeys.me key', () => {
    expect(meQueryOptions().queryKey).toEqual(userKeys.me);
  });

  it('reads GET /api/me with an abortable signal and returns the user', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(user)));
    await expect(new QueryClient().query(meQueryOptions())).resolves.toEqual(user);
    const { url, init } = call();
    expect(url.pathname).toBe('/api/me');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects a body that fails the schema', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 1 })));
    const error = await new QueryClient().query(meQueryOptions()).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'schema' });
  });
});

describe('updateMe', () => {
  it('sends PATCH /api/me with the JSON body and returns the saved user', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(user)));
    const body = { firstName: 'Ева', lastName: null };
    await expect(updateMe(body)).resolves.toEqual(user);
    const { url, init } = call();
    expect(url.pathname).toBe('/api/me');
    expect(init.method).toBe('PATCH');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    expect(init.body).toBe(JSON.stringify(body));
  });

  it('fails with the code and details of a 400 VALIDATION_FAILED', async () => {
    const details = [{ field: 'firstName', code: 'MAX_LENGTH', message: 'too long' }];
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'VALIDATION_FAILED', message: 'm', details } }),
        {
          status: 400,
        },
      ),
    );
    const error = await updateMe({ firstName: 'x' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'http', status: 400, code: 'VALIDATION_FAILED', details });
  });

  it('fails as http for a 401', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'm', details: [] } }), {
        status: 401,
      }),
    );
    await expect(updateMe({})).rejects.toMatchObject({ kind: 'http', status: 401 });
  });
});

describe('deleteMe', () => {
  it('sends DELETE /api/me with no body and resolves undefined on 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(deleteMe()).resolves.toBeUndefined();
    const { url, init } = call();
    expect(url.pathname).toBe('/api/me');
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
  });

  it('fails as http for a 401 and does not report it', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'm', details: [] } }), {
        status: 401,
      }),
    );
    await expect(deleteMe()).rejects.toMatchObject({ kind: 'http', status: 401 });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('still reports a 503', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'm', details: [] } }),
        { status: 503 },
      ),
    );
    await expect(deleteMe()).rejects.toMatchObject({ kind: 'http', status: 503 });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('still reports a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(deleteMe()).rejects.toMatchObject({ kind: 'network' });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});

describe('updateMe reporting', () => {
  it('reports a 401 (only deleteMe expects it)', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'm', details: [] } }), {
        status: 401,
      }),
    );
    await expect(updateMe({})).rejects.toMatchObject({ status: 401 });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});
