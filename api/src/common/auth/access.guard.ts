import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { UnauthorizedError } from '../errors/app.exception.js';
import { requestContextOf } from '../http/request-context.js';
import { type Access, ACCESS_METADATA } from './access.decorators.js';

// Access is closed by default (spec 0006 F3): a route answers 401 unless it is marked @Public(),
// or @SignedIn() and the request's principal is a user (the request-context middleware reads the
// session cookie). @Closed() and no marker answer 401 to everyone (spec 0013 plan §4). Registered
// globally in AppModule, after the throttler guard. Throws instead of returning false: Nest would
// answer false with a ForbiddenException, a 403 the error filter does not expect.
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const access = this.accessOf(context);
    if (access === 'public') {
      return true;
    }
    if (access === 'user') {
      const { principal } = requestContextOf(context.switchToHttp().getRequest<Request>());
      if (principal.kind === 'user') {
        return true;
      }
      throw new UnauthorizedError('Sign-in required');
    }
    throw new UnauthorizedError('The route is closed');
  }

  // The marker of the route, or of its controller.
  protected accessOf(context: ExecutionContext): Access | undefined {
    return this.reflector.getAllAndOverride<Access | undefined>(ACCESS_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
  }
}
