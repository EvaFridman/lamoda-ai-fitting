import { createHash, timingSafeEqual } from 'node:crypto';

import {
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiSecurity } from '@nestjs/swagger';
import type { Request } from 'express';

import type { Env } from '../../config/env.js';
import { UnauthorizedError } from '../errors/app.exception.js';

export const ADMIN_TOKEN_HEADER = 'X-Admin-Token';
// The Swagger security scheme (swagger.ts) that routes under @AdminOnly() refer to.
export const ADMIN_SECURITY = 'admin';

// Lets a request through only with the X-Admin-Token header equal to ADMIN_API_TOKEN (spec 0004
// E1); an empty ADMIN_API_TOKEN rejects every request. Throws instead of returning false: Nest
// would answer false with a ForbiddenException, a 403 the error filter does not expect.
@Injectable()
export class AdminGuard implements CanActivate {
  // Digests have equal lengths, so timingSafeEqual neither throws nor leaks the token's length.
  private readonly expected: Buffer | undefined;

  constructor(config: ConfigService<Env, true>) {
    const token = config.get('ADMIN_API_TOKEN', { infer: true });
    this.expected = token === '' ? undefined : digest(token);
  }

  canActivate(context: ExecutionContext): boolean {
    const sent = context.switchToHttp().getRequest<Request>().get(ADMIN_TOKEN_HEADER);
    if (this.expected === undefined || sent === undefined || sent === '') {
      throw new UnauthorizedError();
    }
    if (!timingSafeEqual(digest(sent), this.expected)) {
      throw new UnauthorizedError();
    }
    return true;
  }
}

// On a controller or a route: needs the admin token; Swagger shows the route as secured.
export function AdminOnly(): MethodDecorator & ClassDecorator {
  return applyDecorators(UseGuards(AdminGuard), ApiSecurity(ADMIN_SECURITY));
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
