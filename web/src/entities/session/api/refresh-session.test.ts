import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/shared/api';

import { refreshSession } from './refresh-session';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('@/shared/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/auth')>()),
  authClient: { getSession: mocks.getSession, $store: { notify: mocks.notify } },
}));

describe('refreshSession', () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.notify.mockReset();
  });

  it('reads the session past the cookie cache, then tells the session hook', async () => {
    mocks.getSession.mockResolvedValue({ data: {}, error: null });
    await refreshSession();
    expect(mocks.getSession).toHaveBeenCalledExactlyOnceWith({
      query: { disableCookieCache: true },
      fetchOptions: { signal: expect.any(AbortSignal) },
    });
    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith('$sessionSignal');
    expect(mocks.getSession.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.notify.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('throws an ApiError for an error answer and does not notify', async () => {
    mocks.getSession.mockResolvedValue({ data: null, error: { status: 503 } });
    const failure = await refreshSession().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ kind: 'http', status: 503, method: 'GET' });
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('throws an ApiError for a call that got no answer and does not notify', async () => {
    mocks.getSession.mockRejectedValue(new TypeError('Failed to fetch'));
    const failure = await refreshSession().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ kind: 'network' });
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
