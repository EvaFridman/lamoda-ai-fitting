import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { requestContextOf } from '../http/request-context.js';
import type { Principal } from './principal.js';

// A handler parameter: the principal of the request, as the request-context middleware found it.
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal =>
    requestContextOf(context.switchToHttp().getRequest<Request>()).principal,
);
