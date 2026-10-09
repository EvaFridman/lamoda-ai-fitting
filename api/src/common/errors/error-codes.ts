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
