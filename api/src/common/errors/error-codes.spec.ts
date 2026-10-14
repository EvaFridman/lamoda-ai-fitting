import { describe, expect, it } from 'vitest';

import { AppException } from './app.exception.js';
import { ERROR_CODES, ERROR_STATUS, type ErrorCode } from './error-codes.js';

// Spec 0004 E20, written out on purpose: changing a status must change this table too.
const E20_STATUS: ReadonlyArray<readonly [ErrorCode, number]> = [
  ['VALIDATION_FAILED', 400],
  ['BAD_JSON', 400],
  ['INVALID_ID', 400],
  ['RELATED_NOT_FOUND', 400],
  ['CONSTRAINT_VIOLATION', 400],
  ['UNAUTHORIZED', 401],
  ['ROUTE_NOT_FOUND', 404],
  ['NOT_FOUND', 404],
  ['ALREADY_EXISTS', 409],
  ['IN_USE', 409],
  ['PAYLOAD_TOO_LARGE', 413],
  ['TOO_MANY_REQUESTS', 429],
  ['SERVICE_UNAVAILABLE', 503],
  ['INTERNAL_ERROR', 500],
];

describe('ERROR_STATUS', () => {
  it('has a status for every code and nothing else', () => {
    expect(Object.keys(ERROR_STATUS).sort()).toEqual([...ERROR_CODES].sort());
  });

  it('lists every code in the E20 table', () => {
    expect(E20_STATUS.map(([code]) => code).sort()).toEqual([...ERROR_CODES].sort());
  });

  it.each(E20_STATUS)('%s is %i', (code, status) => {
    expect(ERROR_STATUS[code]).toBe(status);
  });

  it.each(E20_STATUS)('AppException with %s answers %i', (code, status) => {
    const exception = new AppException(code, 'x');

    expect(exception.getStatus()).toBe(status);
    expect(exception.code).toBe(code);
  });
});
