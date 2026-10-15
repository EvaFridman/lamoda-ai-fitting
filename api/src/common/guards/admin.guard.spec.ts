import 'reflect-metadata';

import type { ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';
import { describe, expect, it } from 'vitest';

import { UnauthorizedError } from '../errors/app.exception.js';
import { requestContextMiddleware } from '../http/request-context.js';
import { AdminGuard, AdminOnly } from './admin.guard.js';

function makeGuard(): AdminGuard {
  return new AdminGuard();
}

// Runs the real middleware on a fake request, as the app does before any guard.
function contextWith(headers: Record<string, string>, adminToken = 'secret'): ExecutionContext {
  const request = {
    get: (name: string) => headers[name] ?? headers[name.toLowerCase()],
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as Request;
  const response = { setHeader: () => undefined } as unknown as Response;
  requestContextMiddleware({ proxySecret: '', adminToken })(request, response, () => undefined);
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

function expectUnauthorized(run: () => unknown): void {
  const error = thrownBy(run);
  expect(error).toBeInstanceOf(UnauthorizedError);
  expect((error as UnauthorizedError).getStatus()).toBe(401);
  expect((error as UnauthorizedError).getResponse()).toMatchObject({
    error: { code: 'UNAUTHORIZED', details: [] },
  });
}

describe('AdminGuard', () => {
  it('lets a request with the right token through', () => {
    const guard = makeGuard();

    expect(guard.canActivate(contextWith({ 'X-Admin-Token': 'secret' }))).toBe(true);
  });

  it('refuses a wrong token of the same length', () => {
    const guard = makeGuard();

    expectUnauthorized(() => guard.canActivate(contextWith({ 'X-Admin-Token': 'secreT' })));
  });

  it('refuses a wrong token of another length', () => {
    const guard = makeGuard();

    expectUnauthorized(() => guard.canActivate(contextWith({ 'X-Admin-Token': 'secret-longer' })));
    expectUnauthorized(() => guard.canActivate(contextWith({ 'X-Admin-Token': 's' })));
  });

  it('refuses a request without the header', () => {
    const guard = makeGuard();

    expectUnauthorized(() => guard.canActivate(contextWith({})));
  });

  it('refuses an empty header', () => {
    const guard = makeGuard();

    expectUnauthorized(() => guard.canActivate(contextWith({ 'X-Admin-Token': '' })));
  });

  it('refuses every request when ADMIN_API_TOKEN is empty, even with an empty token sent', () => {
    const guard = makeGuard();

    expectUnauthorized(() => guard.canActivate(contextWith({ 'X-Admin-Token': '' }, '')));
    expectUnauthorized(() => guard.canActivate(contextWith({ 'X-Admin-Token': 'anything' }, '')));
    expectUnauthorized(() => guard.canActivate(contextWith({}, '')));
  });

  it('throws a plain error, not a 401, when the request middleware did not run', () => {
    const context = {
      switchToHttp: () => ({ getRequest: () => ({}) }),
    } as unknown as ExecutionContext;

    const error = thrownBy(() => makeGuard().canActivate(context));

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(UnauthorizedError);
  });
});

describe('@AdminOnly()', () => {
  class Routes {
    @AdminOnly()
    secured(): void {}

    open(): void {}
  }

  it('puts AdminGuard on the route', () => {
    const guards = Reflect.getMetadata('__guards__', Routes.prototype.secured) as unknown[];

    expect(guards).toContain(AdminGuard);
    expect(Reflect.getMetadata('__guards__', Routes.prototype.open)).toBeUndefined();
  });

  it('marks the route with the Swagger security scheme `admin`', () => {
    const security = Reflect.getMetadata(
      'swagger/apiSecurity',
      Routes.prototype.secured,
    ) as unknown[];

    expect(security).toEqual([{ admin: [] }]);
  });
});
