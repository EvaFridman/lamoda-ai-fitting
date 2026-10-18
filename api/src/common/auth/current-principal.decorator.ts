import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { UnauthorizedError } from '../errors/app.exception.js';
import { requestContextOf } from '../http/request-context.js';
import type { Principal } from './principal.js';

// A handler parameter: the principal of the request, as the request-context middleware found it.
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal =>
    requestContextOf(context.switchToHttp().getRequest<Request>()).principal,
);

// A handler parameter of a @SignedIn() route: the signed-in user's id, whose rows the route serves
// (spec 0013 N8). AccessGuard has let only a user through; on a route without the marker it is
// still 401, never someone else's data.
export const CurrentUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const { principal } = requestContextOf(context.switchToHttp().getRequest<Request>());
    if (principal.kind !== 'user') {
      throw new UnauthorizedError('Sign-in required');
    }
    return principal.userId;
  },
);
