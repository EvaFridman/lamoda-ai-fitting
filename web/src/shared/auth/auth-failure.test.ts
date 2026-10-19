import { describe, expect, it, vi } from 'vitest';

import { ApiError, errorText } from '@/shared/api';

import { authFailure, callAuth } from './auth-failure';

const reported = vi.hoisted(() => ({ reportApiError: vi.fn() }));

vi.mock('@/shared/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api')>()),
  reportApiError: reported.reportApiError,
}));

function timeoutError(): Error {
  const error = new Error('timed out');
  error.name = 'TimeoutError';
  return error;
}

describe('authFailure', () => {
  it('turns an Error into a network failure', () => {
    reported.reportApiError.mockClear();
    const cause = new TypeError('Failed to fetch');
    const error = authFailure(cause, 'sign-out', 'POST');
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      kind: 'network',
      template: '/api/auth/sign-out',
      method: 'POST',
      cause,
    });
    expect(reported.reportApiError).toHaveBeenCalledExactlyOnceWith(error);
  });

  it('turns a TimeoutError into a timeout failure', () => {
    expect(authFailure(timeoutError(), 'get-session', 'GET')).toMatchObject({
      kind: 'timeout',
      template: '/api/auth/get-session',
    });
  });

  it('reads the code and status of the api format', () => {
    const error = authFailure(
      { status: 429, error: { code: 'TOO_MANY_REQUESTS', message: 'x', details: [] } },
      'sign-in/social',
      'POST',
    );
    expect(error).toMatchObject({
      kind: 'http',
      status: 429,
      code: 'TOO_MANY_REQUESTS',
      template: '/api/auth/sign-in/social',
    });
    expect(errorText(error)).toBe('Слишком много запросов, подождите немного');
  });

  it("reads Better Auth's own code", () => {
    const error = authFailure(
      { status: 500, code: 'INTERNAL_SERVER_ERROR', message: 'x' },
      'revoke-sessions',
      'POST',
    );
    expect(error).toMatchObject({ kind: 'http', status: 500, code: 'INTERNAL_SERVER_ERROR' });
    expect(errorText(error)).toBe('Ошибка на сервере, попробуйте позже');
  });

  it('keeps the status and no code for an answer without either format', () => {
    const error = authFailure(
      { status: 503, statusText: 'Service Unavailable' },
      'sign-out',
      'POST',
    );
    expect(error).toMatchObject({ kind: 'http', status: 503, code: undefined });
    expect(errorText(error)).toBe('Сервис временно недоступен, попробуйте позже');
  });

  it('ignores a code that is not a short string', () => {
    const error = authFailure({ status: 400, code: 'X'.repeat(65) }, 'sign-out', 'POST');
    expect(error.code).toBeUndefined();
  });

  it('gives status 0 for a failure that is neither an Error nor has a status', () => {
    expect(authFailure({ weird: true }, 'sign-out', 'POST')).toMatchObject({
      kind: 'http',
      status: 0,
    });
  });

  it('reports the failure once per call', () => {
    reported.reportApiError.mockClear();
    authFailure({ status: 500 }, 'sign-out', 'POST');
    expect(reported.reportApiError).toHaveBeenCalledTimes(1);
  });
});

describe('callAuth', () => {
  it('resolves when the call returns no error', async () => {
    const call = vi.fn().mockResolvedValue({ error: null });
    await expect(callAuth('sign-out', 'POST', call)).resolves.toBeUndefined();
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('passes an abort signal that is not yet aborted', async () => {
    const call = vi.fn().mockResolvedValue({ error: null });
    await callAuth('sign-out', 'POST', call);
    const options = call.mock.calls[0]?.[0] as { signal: AbortSignal };
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.signal.aborted).toBe(false);
  });

  it('gives the call a signal that times out after 15 seconds', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    try {
      const call = vi.fn().mockResolvedValue({ error: null });
      await callAuth('sign-out', 'POST', call);
      expect(timeout).toHaveBeenCalledExactlyOnceWith(15_000);
    } finally {
      timeout.mockRestore();
    }
  });

  it('throws an http ApiError for a returned error', async () => {
    const call = vi.fn().mockResolvedValue({ error: { status: 429 } });
    await expect(callAuth('sign-in/social', 'POST', call)).rejects.toMatchObject({
      kind: 'http',
      status: 429,
      template: '/api/auth/sign-in/social',
      method: 'POST',
    });
  });

  it('throws a network ApiError for a rejection', async () => {
    const call = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(callAuth('sign-out', 'POST', call)).rejects.toMatchObject({ kind: 'network' });
  });

  it('throws a timeout ApiError for a TimeoutError', async () => {
    const call = vi.fn().mockRejectedValue(timeoutError());
    await expect(callAuth('sign-out', 'POST', call)).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('treats a rejection that is not an Error as a network failure', async () => {
    const call = vi.fn().mockRejectedValue('boom');
    await expect(callAuth('sign-out', 'POST', call)).rejects.toMatchObject({ kind: 'network' });
  });

  it('resolves for a returned error with the accepted status, without reporting it', async () => {
    reported.reportApiError.mockClear();
    const call = vi.fn().mockResolvedValue({ error: { status: 401 } });
    await expect(
      callAuth('revoke-sessions', 'POST', call, { acceptStatus: 401 }),
    ).resolves.toBeUndefined();
    expect(reported.reportApiError).not.toHaveBeenCalled();
  });

  it('still throws and reports a returned error with another status', async () => {
    reported.reportApiError.mockClear();
    const call = vi.fn().mockResolvedValue({ error: { status: 500 } });
    await expect(
      callAuth('revoke-sessions', 'POST', call, { acceptStatus: 401 }),
    ).rejects.toMatchObject({ kind: 'http', status: 500 });
    expect(reported.reportApiError).toHaveBeenCalledTimes(1);
  });

  it('still throws a rejection when a status is accepted', async () => {
    const call = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      callAuth('revoke-sessions', 'POST', call, { acceptStatus: 401 }),
    ).rejects.toMatchObject({ kind: 'network' });
  });

  it('reports each failure', async () => {
    reported.reportApiError.mockClear();
    const call = vi.fn().mockResolvedValue({ error: { status: 500 } });
    await expect(callAuth('sign-out', 'POST', call)).rejects.toBeInstanceOf(ApiError);
    expect(reported.reportApiError).toHaveBeenCalledTimes(1);
  });
});
