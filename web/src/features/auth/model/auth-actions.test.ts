import { beforeEach, describe, expect, it, vi } from 'vitest';

import { signInWithGoogle, signOut, signOutEverywhere } from './auth-actions';

const client = vi.hoisted(() => ({
  signIn: { social: vi.fn() },
  signOut: vi.fn(),
  revokeSessions: vi.fn(),
}));

vi.mock('@/shared/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/auth')>()),
  authClient: client,
}));

vi.mock('@/shared/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api')>()),
  reportApiError: vi.fn(),
}));

describe('auth actions', () => {
  beforeEach(() => {
    client.signIn.social.mockReset().mockResolvedValue({ error: null });
    client.signOut.mockReset().mockResolvedValue({ error: null });
    client.revokeSessions.mockReset().mockResolvedValue({ error: null });
  });

  it('signs in with Google, the callback url and the same url for a failure, with a signal', async () => {
    await signInWithGoogle('/page?a=1');
    expect(client.signIn.social).toHaveBeenCalledExactlyOnceWith({
      provider: 'google',
      callbackURL: '/page?a=1',
      errorCallbackURL: '/page?a=1',
      fetchOptions: { signal: expect.any(AbortSignal) },
    });
  });

  it('throws an ApiError when the sign-in is refused', async () => {
    client.signIn.social.mockResolvedValue({ error: { status: 429 } });
    await expect(signInWithGoogle('/')).rejects.toMatchObject({
      kind: 'http',
      status: 429,
      template: '/api/auth/sign-in/social',
    });
  });

  it('signs out with a signal', async () => {
    await signOut();
    expect(client.signOut).toHaveBeenCalledExactlyOnceWith({
      fetchOptions: { signal: expect.any(AbortSignal) },
    });
    expect(client.revokeSessions).not.toHaveBeenCalled();
  });

  it('throws an ApiError when the sign-out fails', async () => {
    client.signOut.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(signOut()).rejects.toMatchObject({
      kind: 'network',
      template: '/api/auth/sign-out',
    });
  });

  it('revokes every session, then signs out', async () => {
    const order: string[] = [];
    client.revokeSessions.mockImplementation(() => {
      order.push('revoke');
      return Promise.resolve({ error: null });
    });
    client.signOut.mockImplementation(() => {
      order.push('signOut');
      return Promise.resolve({ error: null });
    });
    await signOutEverywhere();
    expect(order).toEqual(['revoke', 'signOut']);
  });

  it('still signs out when revoking answers 401', async () => {
    client.revokeSessions.mockResolvedValue({ error: { status: 401 } });
    await expect(signOutEverywhere()).resolves.toBeUndefined();
    expect(client.signOut).toHaveBeenCalledTimes(1);
  });

  it('does not sign out when revoking cannot reach the api', async () => {
    client.revokeSessions.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(signOutEverywhere()).rejects.toMatchObject({ kind: 'network' });
    expect(client.signOut).not.toHaveBeenCalled();
  });

  it('does not sign out when revoking fails', async () => {
    client.revokeSessions.mockResolvedValue({ error: { status: 500 } });
    await expect(signOutEverywhere()).rejects.toMatchObject({
      status: 500,
      template: '/api/auth/revoke-sessions',
    });
    expect(client.signOut).not.toHaveBeenCalled();
  });
});
