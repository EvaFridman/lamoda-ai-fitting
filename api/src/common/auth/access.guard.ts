import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { UnauthorizedError } from '../errors/app.exception.js';
import { requestContextOf } from '../http/request-context.js';
import { type Access, ACCESS_METADATA } from './access.decorators.js';

// Access is closed by default (spec 0006 F3): a route answers 401 unless it is marked @Public(),
// or @AdminOnly() and the request's principal is the admin (the request-context middleware compares
// X-Admin-Token with ADMIN_API_TOKEN; an empty ADMIN_API_TOKEN makes no one admin). Registered
// globally in AppModule, after the throttler guard. Throws instead of returning false: Nest would
// answer false with a ForbiddenException, a 403 the error filter does not expect.
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const access = this.reflector.getAllAndOverride<Access | undefined>(ACCESS_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (access === 'public') {
      return true;
    }
    if (access === 'admin') {
      const { principal } = requestContextOf(context.switchToHttp().getRequest<Request>());
      if (principal.kind === 'admin') {
        return true;
      }
    }
    throw new UnauthorizedError();
  }
}
