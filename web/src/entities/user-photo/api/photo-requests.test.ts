import * as Sentry from '@sentry/nextjs';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import { userKeys } from '@/entities/user';
import { ApiError } from '@/shared/api';

import { userPhotoKeys } from './keys';
import {
  deletePhoto,
  deleteTransientPhoto,
  setDefaultPhoto,
  UPLOAD_TIMEOUT_MS,
  uploadPhoto,
} from './photo-requests';
import { myPhotosQueryOptions } from './queries';

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const photo = {
  id: ID,
  url: 'https://s3.example/keep/users/u/photo.webp?X-Amz-Signature=abc',
  isDefault: true,
  transient: false,
  width: 768,
  height: 1024,
  createdAt: '2026-10-01T12:00:00.000Z',
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('userPhotoKeys', () => {
  it('starts with the user keys, so a signed-out tab drops the photos too', () => {
    expect(userPhotoKeys.all.slice(0, userKeys.all.length)).toEqual(userKeys.all);
  });

  it('does not start with the me key, so a refetch of /me by prefix leaves the photos', () => {
    expect(userPhotoKeys.all.slice(0, userKeys.me.length)).not.toEqual(userKeys.me);
  });
});

describe('myPhotosQueryOptions', () => {
  it('uses the photos key', () => {
    expect(myPhotosQueryOptions().queryKey).toEqual(userPhotoKeys.all);
  });

  it('reads GET /api/me/photos and returns the list', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([photo])));
    await expect(new QueryClient().query(myPhotosQueryOptions())).resolves.toEqual([photo]);
    const { url, init } = call();
    expect(url.pathname).toBe('/api/me/photos');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects a body that is not a list of photos', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ items: [] })));
    const error = await new QueryClient().query(myPhotosQueryOptions()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'schema' });
  });
});

describe('uploadPhoto', () => {
  it('posts a multipart body with the photo and save=true by default', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(photo)));
    const file = new File(['bytes'], 'me.png', { type: 'image/png' });
    await expect(uploadPhoto(file)).resolves.toEqual(photo);
    const { url, init } = call();
    expect(url.pathname).toBe('/api/me/photos');
    expect(init.method).toBe('POST');
    const body = init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('save')).toBe('true');
    const sent = body.get('photo') as File;
    expect(sent).toBeInstanceOf(Blob);
    expect(sent.size).toBe(5);
    expect(sent.type).toBe('image/png');
  });

  it('sets no Content-Type of its own, so the browser adds the boundary', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(photo)));
    await uploadPhoto(new Blob(['x']));
    expect(new Headers(call().init.headers).has('content-type')).toBe(false);
  });

  it('sends save=false for a one-time photo', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ...photo, transient: true })));
    await uploadPhoto(new Blob(['x']), { save: false });
    expect((call().init.body as FormData).get('save')).toBe('false');
  });

  it('sends no consent part unless it is given', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(photo)));
    await uploadPhoto(new Blob(['x']));
    const body = call().init.body as FormData;
    expect(body.has('consent')).toBe(false);
    expect([...body.keys()]).toEqual(['save', 'photo']);
  });

  it('sends the consents version between save and the photo', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(photo)));
    await uploadPhoto(new Blob(['x']), { save: false, consent: 1 });
    const body = call().init.body as FormData;
    expect(body.get('consent')).toBe('1');
    expect(body.get('save')).toBe('false');
    expect([...body.keys()]).toEqual(['save', 'consent', 'photo']);
  });

  it('fails with the detail CONSENT_REQUIRED of a user with no stored consents', async () => {
    const details = [{ field: 'consent', code: 'CONSENT_REQUIRED', message: 'required' }];
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'VALIDATION_FAILED', message: 'm', details } }),
        { status: 400 },
      ),
    );
    await expect(uploadPhoto(new Blob(['x']))).rejects.toMatchObject({
      kind: 'http',
      status: 400,
      details,
    });
  });

  it('uses the upload timeout of 120 s', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    fetchMock.mockResolvedValue(new Response(JSON.stringify(photo)));
    await uploadPhoto(new Blob(['x']));
    expect(UPLOAD_TIMEOUT_MS).toBe(120_000);
    expect(timeout).toHaveBeenCalledWith(120_000);
  });

  it('is cancelled by the caller signal, unreported', async () => {
    fetchMock.mockImplementation(
      (_url: unknown, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = init.signal as AbortSignal;
          signal.addEventListener('abort', () => reject(signal.reason));
        }),
    );
    const caller = new AbortController();
    const pending = uploadPhoto(new Blob(['x']), { signal: caller.signal }).catch(
      (e: unknown) => e,
    );
    caller.abort();
    const error = await pending;
    expect(error).not.toBeInstanceOf(ApiError);
    expect((error as Error).name).toBe('AbortError');
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('fails with the details of a refused photo', async () => {
    const details = [{ field: 'photo', code: 'PHOTO_REFUSED', message: 'several people' }];
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'VALIDATION_FAILED', message: 'm', details } }),
        { status: 400 },
      ),
    );
    await expect(uploadPhoto(new Blob(['x']))).rejects.toMatchObject({
      kind: 'http',
      status: 400,
      code: 'VALIDATION_FAILED',
      details,
    });
  });

  it('fails with 409 LIMIT_REACHED', async () => {
    fetchMock.mockResolvedValue(errorResponse(409, 'LIMIT_REACHED'));
    await expect(uploadPhoto(new Blob(['x']))).rejects.toMatchObject({
      kind: 'http',
      status: 409,
      code: 'LIMIT_REACHED',
    });
  });

  it('fails as schema when the photo url is a javascript: link', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ...photo, url: 'javascript:alert(1)' })),
    );
    await expect(uploadPhoto(new Blob(['x']))).rejects.toMatchObject({ kind: 'schema' });
  });

  it('fails as schema when the answer is not a photo', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 1 })));
    await expect(uploadPhoto(new Blob(['x']))).rejects.toMatchObject({ kind: 'schema' });
  });
});

describe('setDefaultPhoto', () => {
  it('sends PATCH /api/me/photos/<id> with { isDefault: true } as JSON', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(photo)));
    await expect(setDefaultPhoto(ID)).resolves.toEqual(photo);
    const { url, init } = call();
    expect(url.pathname).toBe(`/api/me/photos/${ID}`);
    expect(init.method).toBe('PATCH');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ isDefault: true }));
  });

  it('fails with 404 for a missing photo', async () => {
    fetchMock.mockResolvedValue(errorResponse(404, 'NOT_FOUND'));
    await expect(setDefaultPhoto(ID)).rejects.toMatchObject({ kind: 'http', status: 404 });
  });

  it('refuses an id that is not one path segment, before any request', async () => {
    expect(() => setDefaultPhoto('..')).toThrow(ApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('deletePhoto', () => {
  it('sends DELETE /api/me/photos/<id> with no body and resolves undefined on 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(deletePhoto(ID)).resolves.toBeUndefined();
    const { url, init } = call();
    expect(url.pathname).toBe(`/api/me/photos/${ID}`);
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
  });

  it('fails with 404 for a missing photo', async () => {
    fetchMock.mockResolvedValue(errorResponse(404, 'NOT_FOUND'));
    await expect(deletePhoto(ID)).rejects.toMatchObject({ kind: 'http', status: 404 });
  });

  it('is a network error when the request fails, and it is reported', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(deletePhoto(ID)).rejects.toMatchObject({ kind: 'network' });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});

describe('deleteTransientPhoto', () => {
  it('sends DELETE /api/me/photos/transient/<id> with no body and resolves undefined on 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(deleteTransientPhoto(ID)).resolves.toBeUndefined();
    const { url, init } = call();
    expect(url.pathname).toBe(`/api/me/photos/transient/${ID}`);
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
  });

  it('fails with 404 for a saved or a missing photo, unreported', async () => {
    fetchMock.mockResolvedValue(errorResponse(404, 'NOT_FOUND'));
    await expect(deleteTransientPhoto(ID)).rejects.toMatchObject({ kind: 'http', status: 404 });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('refuses an id that is not one path segment, before any request', () => {
    expect(() => deleteTransientPhoto('..')).toThrow(ApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
