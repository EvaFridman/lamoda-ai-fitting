import { ApiExtension } from '@nestjs/swagger';

import type { ErrorCode } from './error-codes.js';

// The operation extension ApiErrors writes and swagger.ts reads, then removes.
export const ERROR_CODES_EXTENSION = 'x-error-codes';

// The error answers of a route that come from its logic, not its shape (spec 0004 E50): 409
// ALREADY_EXISTS or IN_USE, 400 RELATED_NOT_FOUND or CONSTRAINT_VIOLATION. swagger.ts adds them to
// the answers the shape implies (body, query, uuid path, admin) and builds the responses.
export function ApiErrors(...codes: ErrorCode[]): MethodDecorator {
  return ApiExtension(ERROR_CODES_EXTENSION, codes);
}
