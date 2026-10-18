import 'reflect-metadata';

import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { describe, expect, it } from 'vitest';

import { UnauthorizedError } from '../errors/app.exception.js';
import { requestContextMiddleware, type SessionReader } from '../http/request-context.js';
import { Closed, Public, SignedIn } from './access.decorators.js';
import { AccessGuard } from './access.guard.js';

class Unmarked {
  route(): void {}
}

class Routes {
  @Public()
  open(): void {}

  @SignedIn()
  own(): void {}

  @Closed()
  shut(): void {}
}

@SignedIn()
class SignedInController {
  route(): void {}

  @Public()
  open(): void {}

  @Closed()
  shut(): void {}
}

@Closed()
class ClosedController {
  route(): void {}

  @SignedIn()
  own(): void {}
}

@Public()
class PublicController {
  route(): void {}

  @SignedIn()
  own(): void {}
}

type Handler = (...args: never[]) => unknown;

function makeGuard(): AccessGuard {
  return new AccessGuard(new Reflector());
}

const user = { userId: 'user-1', sessionId: 'session-1' };
const signedIn: SessionReader = () => Promise.resolve(user);

// Runs the real middleware on a fake request, as the app does before any guard.
async function contextFor(
  controller: new () => object,
  handler: Handler,
  readSession?: SessionReader,
): Promise<ExecutionContext> {
  const request = {
    get: () => undefined,
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as Request;
  const response = { setHeader: () => undefined } as unknown as Response;
  await new Promise<void>((resolve, reject) => {
    requestContextMiddleware({ proxySecret: '', readSession })(request, response, (error) =>
      error === undefined ? resolve() : reject(error as Error),
    );
  });
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

function expectUnauthorized(run: () => unknown, message: string): void {
  const error = thrownBy(run);
  expect(error).toBeInstanceOf(UnauthorizedError);
  expect((error as UnauthorizedError).getStatus()).toBe(401);
  expect((error as UnauthorizedError).getResponse()).toMatchObject({
    error: { code: 'UNAUTHORIZED', message, details: [] },
  });
}

const SIGN_IN = 'Sign-in required';
const CLOSED = 'The route is closed';

describe('AccessGuard', () => {
  it('refuses a route with no marker as closed, anonymous or signed in', async () => {
    const guard = makeGuard();
    const anonymous = await contextFor(Unmarked, Unmarked.prototype.route);
    const asUser = await contextFor(Unmarked, Unmarked.prototype.route, signedIn);

    expectUnauthorized(() => guard.canActivate(anonymous), CLOSED);
    expectUnauthorized(() => guard.canActivate(asUser), CLOSED);
  });

  it('lets anyone through a @Public() route', async () => {
    const guard = makeGuard();

    expect(guard.canActivate(await contextFor(Routes, Routes.prototype.open))).toBe(true);
    expect(guard.canActivate(await contextFor(Routes, Routes.prototype.open, signedIn))).toBe(true);
  });

  it('lets a signed-in user through a @SignedIn() route and refuses an anonymous request', async () => {
    const guard = makeGuard();

    expect(guard.canActivate(await contextFor(Routes, Routes.prototype.own, signedIn))).toBe(true);
    const anonymous = await contextFor(Routes, Routes.prototype.own);
    expectUnauthorized(() => guard.canActivate(anonymous), SIGN_IN);
    const unknown = await contextFor(Routes, Routes.prototype.own, () =>
      Promise.resolve(undefined),
    );
    expectUnauthorized(() => guard.canActivate(unknown), SIGN_IN);
  });

  it('refuses a @Closed() route to everyone, a signed-in user too', async () => {
    const guard = makeGuard();
    const anonymous = await contextFor(Routes, Routes.prototype.shut);
    const asUser = await contextFor(Routes, Routes.prototype.shut, signedIn);

    expectUnauthorized(() => guard.canActivate(anonymous), CLOSED);
    expectUnauthorized(() => guard.canActivate(asUser), CLOSED);
  });

  it('takes the marker of a controller, and a route marker over it', async () => {
    const guard = makeGuard();

    const signedInRoute = await contextFor(SignedInController, SignedInController.prototype.route);
    const signedInOpen = await contextFor(SignedInController, SignedInController.prototype.open);
    const signedInShut = await contextFor(
      SignedInController,
      SignedInController.prototype.shut,
      signedIn,
    );
    const closedRoute = await contextFor(
      ClosedController,
      ClosedController.prototype.route,
      signedIn,
    );
    const closedOwn = await contextFor(ClosedController, ClosedController.prototype.own, signedIn);
    const publicRoute = await contextFor(PublicController, PublicController.prototype.route);
    const publicOwn = await contextFor(PublicController, PublicController.prototype.own);

    expectUnauthorized(() => guard.canActivate(signedInRoute), SIGN_IN);
    expect(guard.canActivate(signedInOpen)).toBe(true);
    expectUnauthorized(() => guard.canActivate(signedInShut), CLOSED);
    expectUnauthorized(() => guard.canActivate(closedRoute), CLOSED);
    expect(guard.canActivate(closedOwn)).toBe(true);
    expect(guard.canActivate(publicRoute)).toBe(true);
    expectUnauthorized(() => guard.canActivate(publicOwn), SIGN_IN);
  });

  it('throws a plain error, not a 401, on a @SignedIn() route when the request middleware did not run', () => {
    const context = {
      getClass: () => Routes,
      getHandler: () => Routes.prototype.own,
      switchToHttp: () => ({ getRequest: () => ({}) }),
    } as unknown as ExecutionContext;

    const error = thrownBy(() => makeGuard().canActivate(context));

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(UnauthorizedError);
  });
});

describe('@SignedIn()', () => {
  it('puts no guard of its own on the route', () => {
    expect(Reflect.getMetadata('__guards__', Routes.prototype.own)).toBeUndefined();
  });

  it('marks the route with the Swagger security scheme `session`, and @Public() does not', () => {
    expect(Reflect.getMetadata('swagger/apiSecurity', Routes.prototype.own)).toEqual([
      { session: [] },
    ]);
    expect(Reflect.getMetadata('swagger/apiSecurity', Routes.prototype.open)).toBeUndefined();
  });
});

describe('@Closed()', () => {
  it('puts no guard of its own on the route', () => {
    expect(Reflect.getMetadata('__guards__', Routes.prototype.shut)).toBeUndefined();
  });

  it('writes the x-closed extension and no security scheme', () => {
    expect(Reflect.getMetadata('swagger/apiExtension', Routes.prototype.shut)).toMatchObject({
      'x-closed': true,
    });
    expect(Reflect.getMetadata('swagger/apiSecurity', Routes.prototype.shut)).toBeUndefined();
  });
});
