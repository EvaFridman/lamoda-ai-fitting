import 'reflect-metadata';

import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { describe, expect, it } from 'vitest';

import { UnauthorizedError } from '../errors/app.exception.js';
import { requestContextMiddleware } from '../http/request-context.js';
import { AdminOnly, Public } from './access.decorators.js';
import { AccessGuard } from './access.guard.js';

class Unmarked {
  route(): void {}
}

class Routes {
  @Public()
  open(): void {}

  @AdminOnly()
  secured(): void {}
}

@AdminOnly()
class AdminController {
  route(): void {}

  @Public()
  open(): void {}
}

@Public()
class PublicController {
  route(): void {}

  @AdminOnly()
  secured(): void {}
}

type Handler = (...args: never[]) => unknown;

function makeGuard(): AccessGuard {
  return new AccessGuard(new Reflector());
}

// Runs the real middleware on a fake request, as the app does before any guard.
function contextFor(
  controller: new () => object,
  handler: Handler,
  headers: Record<string, string> = {},
  adminToken = 'secret',
): ExecutionContext {
  const request = {
    get: (name: string) => headers[name] ?? headers[name.toLowerCase()],
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as Request;
  const response = { setHeader: () => undefined } as unknown as Response;
  requestContextMiddleware({ proxySecret: '', adminToken })(request, response, () => undefined);
  return {
    getClass: () => controller,
    getHandler: () => handler,
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

const right = { 'X-Admin-Token': 'secret' };

describe('AccessGuard', () => {
  it('refuses a route with neither marker, even with the right token', () => {
    const guard = makeGuard();

    expectUnauthorized(() => guard.canActivate(contextFor(Unmarked, Unmarked.prototype.route)));
    expectUnauthorized(() =>
      guard.canActivate(contextFor(Unmarked, Unmarked.prototype.route, right)),
    );
  });

  it('lets anyone through a @Public() route, with no token, a wrong one or the right one', () => {
    const guard = makeGuard();
    const open = Routes.prototype.open;

    expect(guard.canActivate(contextFor(Routes, open))).toBe(true);
    expect(guard.canActivate(contextFor(Routes, open, { 'X-Admin-Token': 'wrong' }))).toBe(true);
    expect(guard.canActivate(contextFor(Routes, open, right))).toBe(true);
  });

  it('lets the right token through an @AdminOnly() route', () => {
    expect(makeGuard().canActivate(contextFor(Routes, Routes.prototype.secured, right))).toBe(true);
  });

  it('refuses an @AdminOnly() route with a wrong token of the same or another length', () => {
    const guard = makeGuard();
    const secured = Routes.prototype.secured;

    for (const token of ['secreT', 'secret-longer', 's', '']) {
      expectUnauthorized(() =>
        guard.canActivate(contextFor(Routes, secured, { 'X-Admin-Token': token })),
      );
    }
    expectUnauthorized(() => guard.canActivate(contextFor(Routes, secured)));
  });

  it('refuses every @AdminOnly() request when ADMIN_API_TOKEN is empty', () => {
    const guard = makeGuard();
    const secured = Routes.prototype.secured;

    expectUnauthorized(() =>
      guard.canActivate(contextFor(Routes, secured, { 'X-Admin-Token': '' }, '')),
    );
    expectUnauthorized(() =>
      guard.canActivate(contextFor(Routes, secured, { 'X-Admin-Token': 'anything' }, '')),
    );
    expectUnauthorized(() => guard.canActivate(contextFor(Routes, secured, {}, '')));
  });

  it('takes the marker of a controller, and a route marker over it', () => {
    const guard = makeGuard();

    expectUnauthorized(() =>
      guard.canActivate(contextFor(AdminController, AdminController.prototype.route)),
    );
    expect(guard.canActivate(contextFor(AdminController, AdminController.prototype.open))).toBe(
      true,
    );
    expect(guard.canActivate(contextFor(PublicController, PublicController.prototype.route))).toBe(
      true,
    );
    expectUnauthorized(() =>
      guard.canActivate(contextFor(PublicController, PublicController.prototype.secured)),
    );
  });

  it('throws a plain error, not a 401, on an admin route when the request middleware did not run', () => {
    const context = {
      getClass: () => Routes,
      getHandler: () => Routes.prototype.secured,
      switchToHttp: () => ({ getRequest: () => ({}) }),
    } as unknown as ExecutionContext;

    const error = thrownBy(() => makeGuard().canActivate(context));

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(UnauthorizedError);
  });
});

describe('@AdminOnly()', () => {
  it('puts no guard of its own on the route', () => {
    expect(Reflect.getMetadata('__guards__', Routes.prototype.secured)).toBeUndefined();
  });

  it('marks the route with the Swagger security scheme `admin`, and @Public() does not', () => {
    expect(Reflect.getMetadata('swagger/apiSecurity', Routes.prototype.secured)).toEqual([
      { admin: [] },
    ]);
    expect(Reflect.getMetadata('swagger/apiSecurity', Routes.prototype.open)).toBeUndefined();
  });
});
