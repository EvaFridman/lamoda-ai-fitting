import { HttpStatus } from '@nestjs/common';

// The `code` of every error response (spec 0004 E20). Clients tell errors apart by it, not by the
// status or the message; web keeps its own copy with a Russian text per code (spec 0005).
export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'BAD_JSON',
  'INVALID_ID',
  'RELATED_NOT_FOUND',
  'CONSTRAINT_VIOLATION',
  'UNAUTHORIZED',
  'ROUTE_NOT_FOUND',
  'NOT_FOUND',
  'ALREADY_EXISTS',
  'IN_USE',
  'PAYLOAD_TOO_LARGE',
  'TOO_MANY_REQUESTS',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

// The status each code answers with (E20), the one place it is set: AppException takes its status
// from here, and Swagger groups an operation's codes by it (swagger.ts).
export const ERROR_STATUS: Readonly<Record<ErrorCode, HttpStatus>> = {
  VALIDATION_FAILED: HttpStatus.BAD_REQUEST,
  BAD_JSON: HttpStatus.BAD_REQUEST,
  INVALID_ID: HttpStatus.BAD_REQUEST,
  RELATED_NOT_FOUND: HttpStatus.BAD_REQUEST,
  CONSTRAINT_VIOLATION: HttpStatus.BAD_REQUEST,
  UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
  ROUTE_NOT_FOUND: HttpStatus.NOT_FOUND,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  ALREADY_EXISTS: HttpStatus.CONFLICT,
  IN_USE: HttpStatus.CONFLICT,
  PAYLOAD_TOO_LARGE: HttpStatus.PAYLOAD_TOO_LARGE,
  TOO_MANY_REQUESTS: HttpStatus.TOO_MANY_REQUESTS,
  SERVICE_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  INTERNAL_ERROR: HttpStatus.INTERNAL_SERVER_ERROR,
};
