import {
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UseGuards,
} from '@nestjs/common';
import { ApiSecurity } from '@nestjs/swagger';
import type { Request } from 'express';

import { UnauthorizedError } from '../errors/app.exception.js';
import { requestContextOf } from '../http/request-context.js';

export { ADMIN_TOKEN_HEADER } from '../http/request-context.js';
// The Swagger security scheme (swagger.ts) that routes under @AdminOnly() refer to.
export const ADMIN_SECURITY = 'admin';

// Lets a request through only when its principal is the admin (spec 0004 E1): the request-context
// middleware compares X-Admin-Token with ADMIN_API_TOKEN, and an empty ADMIN_API_TOKEN makes no
// one admin. Throws instead of returning false: Nest would answer false with a ForbiddenException,
// a 403 the error filter does not expect.
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { principal } = requestContextOf(context.switchToHttp().getRequest<Request>());
    if (principal.kind !== 'admin') {
      throw new UnauthorizedError();
    }
    return true;
  }
}

// On a controller or a route: needs the admin token; Swagger shows the route as secured.
export function AdminOnly(): MethodDecorator & ClassDecorator {
  return applyDecorators(UseGuards(AdminGuard), ApiSecurity(ADMIN_SECURITY));
}
