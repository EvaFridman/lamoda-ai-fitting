import 'reflect-metadata';

import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import type { Env } from '../../config/env.js';
import { UnauthorizedError } from '../errors/app.exception.js';
import { AdminGuard, AdminOnly } from './admin.guard.js';

function makeGuard(token: string): AdminGuard {
  const config = { get: () => token } as unknown as ConfigService<Env, true>;
  return new AdminGuard(config);
}

function contextWith(headers: Record<string, string>): ExecutionContext {
  const request = {
    get: (name: string) => headers[name] ?? headers[name.toLowerCase()],
  };
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
    const guard = makeGuard('secret');

    expect(guard.canActivate(contextWith({ 'X-Admin-Token': 'secret' }))).toBe(true);
  });

  it('refuses a wrong token of the same length', () => {
    const guard = makeGuard('secret');

    expectUnauthorized(() => guard.canActivate(contextWith({ 'X-Admin-Token': 'secreT' })));
  });

  it('refuses a wrong token of another length', () => {
    const guard = makeGuard('secret');

    expectUnauthorized(() => guard.canActivate(contextWith({ 'X-Admin-Token': 'secret-longer' })));
    expectUnauthorized(() => guard.canActivate(contextWith({ 'X-Admin-Token': 's' })));
  });

  it('refuses a request without the header', () => {
    const guard = makeGuard('secret');

    expectUnauthorized(() => guard.canActivate(contextWith({})));
  });

  it('refuses an empty header', () => {
    const guard = makeGuard('secret');

    expectUnauthorized(() => guard.canActivate(contextWith({ 'X-Admin-Token': '' })));
  });

  it('refuses every request when ADMIN_API_TOKEN is empty, even with an empty token sent', () => {
    const guard = makeGuard('');

    expectUnauthorized(() => guard.canActivate(contextWith({ 'X-Admin-Token': '' })));
    expectUnauthorized(() => guard.canActivate(contextWith({ 'X-Admin-Token': 'anything' })));
    expectUnauthorized(() => guard.canActivate(contextWith({})));
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
