import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { NotFoundError, UnauthorizedError } from '../common/errors/app.exception.js';
import { MeController } from './me.controller.js';
import type { AuthCookie, MeService } from './me.service.js';

function setup(cookies: AuthCookie[]) {
  const me = {
    get: vi.fn().mockRejectedValue(new UnauthorizedError()),
    update: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
    sessionCookies: vi.fn().mockResolvedValue(cookies),
  };
  const res = { headersSent: false, clearCookie: vi.fn() };
  const controller = new MeController(me as unknown as MeService);
  return { me, res, controller, response: res as unknown as Response };
}

describe('MeController expired session cookies', () => {
  it('passes sameSite to Express in lower case when Better Auth gives it capitalised', async () => {
    const { controller, res, response } = setup([
      {
        name: 'session_token',
        attributes: { path: '/', secure: true, sameSite: 'Lax' },
      },
    ]);

    await controller.delete('user-id', response);

    expect(res.clearCookie).toHaveBeenCalledWith('session_token', {
      path: '/',
      domain: undefined,
      secure: true,
      sameSite: 'lax',
      httpOnly: true,
    });
  });

  it('keeps a lower-case sameSite and passes none for an absent one', async () => {
    const { controller, res, response } = setup([
      { name: 'a', attributes: { sameSite: 'strict' } },
      { name: 'b', attributes: {} },
    ]);

    await controller.delete('user-id', response);

    expect(res.clearCookie).toHaveBeenNthCalledWith(
      1,
      'a',
      expect.objectContaining({ sameSite: 'strict' }),
    );
    expect(res.clearCookie).toHaveBeenNthCalledWith(
      2,
      'b',
      expect.objectContaining({ sameSite: undefined }),
    );
  });

  it('expires the cookies when GET /me finds the user gone', async () => {
    const { controller, res, response } = setup([{ name: 'a', attributes: { sameSite: 'None' } }]);

    await expect(controller.get('user-id', response)).rejects.toBeInstanceOf(UnauthorizedError);

    expect(res.clearCookie).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({ sameSite: 'none' }),
    );
  });

  it('answers what MeService.update answers and sets no cookie', async () => {
    const { controller, me, res, response } = setup([{ name: 'a', attributes: {} }]);
    const user = { id: 'user-id' };
    me.update.mockResolvedValue(user);

    await expect(controller.update('user-id', { firstName: 'Мария' }, response)).resolves.toBe(
      user,
    );

    expect(me.update).toHaveBeenCalledWith('user-id', { firstName: 'Мария' });
    expect(res.clearCookie).not.toHaveBeenCalled();
  });

  it('expires the cookies when PATCH /me finds the user gone', async () => {
    const { controller, me, res, response } = setup([
      { name: 'a', attributes: { sameSite: 'Lax' } },
    ]);
    me.update.mockRejectedValue(new UnauthorizedError());

    await expect(controller.update('user-id', {}, response)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );

    expect(res.clearCookie).toHaveBeenCalledWith('a', expect.objectContaining({ sameSite: 'lax' }));
  });

  it('keeps the cookies when PATCH /me fails otherwise', async () => {
    const { controller, me, res, response } = setup([{ name: 'a', attributes: {} }]);
    me.update.mockRejectedValue(new Error('database down'));

    await expect(controller.update('user-id', { firstName: 'Мария' }, response)).rejects.toThrow(
      'database down',
    );

    expect(res.clearCookie).not.toHaveBeenCalled();
  });

  it('keeps the cookies on a failure other than the user being gone', async () => {
    const { controller, me, res, response } = setup([{ name: 'a', attributes: {} }]);
    me.get.mockRejectedValue(new NotFoundError());

    await expect(controller.get('user-id', response)).rejects.toBeInstanceOf(NotFoundError);

    expect(res.clearCookie).not.toHaveBeenCalled();
  });

  it('sets nothing when the answer has been sent already', async () => {
    const { controller, res, response } = setup([{ name: 'a', attributes: {} }]);
    res.headersSent = true;

    await controller.delete('user-id', response);

    expect(res.clearCookie).not.toHaveBeenCalled();
  });
});
