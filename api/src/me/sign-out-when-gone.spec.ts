import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { NotFoundError, UnauthorizedError } from '../common/errors/app.exception.js';
import type { AuthCookie } from './me.service.js';
import { expireSessionCookies, signOutWhenGone } from './sign-out-when-gone.js';

const cookie = (name: string, sameSite: 'Lax' | 'None' = 'Lax'): AuthCookie =>
  ({
    name,
    attributes: { path: '/', secure: true, sameSite, domain: 'example.com' },
  }) as AuthCookie;

function response(headersSent = false) {
  const clearCookie = vi.fn();
  return { res: { clearCookie, headersSent } as unknown as Response, clearCookie };
}

describe('signOutWhenGone', () => {
  it('returns the result and leaves the cookies alone', async () => {
    const { res, clearCookie } = response();
    const cookies = vi.fn(() => Promise.resolve([cookie('a')]));

    expect(await signOutWhenGone(res, cookies, () => Promise.resolve(42))).toBe(42);

    expect(cookies).not.toHaveBeenCalled();
    expect(clearCookie).not.toHaveBeenCalled();
  });

  it('expires every session cookie on a 401 and rethrows it', async () => {
    const { res, clearCookie } = response();
    const error = new UnauthorizedError();

    await expect(
      signOutWhenGone(
        res,
        () => Promise.resolve([cookie('token'), cookie('data', 'None')]),
        () => Promise.reject(error),
      ),
    ).rejects.toBe(error);

    expect(clearCookie).toHaveBeenCalledTimes(2);
    expect(clearCookie).toHaveBeenCalledWith('token', {
      path: '/',
      domain: 'example.com',
      secure: true,
      sameSite: 'lax',
      httpOnly: true,
    });
    expect(clearCookie).toHaveBeenCalledWith('data', expect.objectContaining({ sameSite: 'none' }));
  });

  it('keeps the cookies for another failure', async () => {
    const { res, clearCookie } = response();
    const cookies = vi.fn(() => Promise.resolve([cookie('a')]));
    const error = new NotFoundError();

    await expect(signOutWhenGone(res, cookies, () => Promise.reject(error))).rejects.toBe(error);

    expect(clearCookie).not.toHaveBeenCalled();
  });
});

describe('expireSessionCookies', () => {
  it('sets nothing once the headers are sent', async () => {
    const { res, clearCookie } = response(true);
    const cookies = vi.fn(() => Promise.resolve([cookie('a')]));

    await expireSessionCookies(res, cookies);

    expect(cookies).not.toHaveBeenCalled();
    expect(clearCookie).not.toHaveBeenCalled();
  });
});
