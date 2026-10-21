import { describe, expect, it } from 'vitest';

import { ApiError } from '@/shared/api';

import { isRefusedCursor } from './cursor';

const detail = { field: 'cursor', code: 'INVALID_CURSOR', message: 'bad' };

function error(init: Partial<ConstructorParameters<typeof ApiError>[1]> = {}) {
  return new ApiError('m', {
    kind: 'http',
    template: '/products',
    status: 400,
    details: [detail],
    ...init,
  });
}

describe('isRefusedCursor', () => {
  it('is true for a 400 with an INVALID_CURSOR detail on the cursor', () => {
    expect(isRefusedCursor(error())).toBe(true);
    expect(isRefusedCursor(error({ details: [{ ...detail, field: 'q' }, detail] }))).toBe(true);
  });

  it('is false for another status', () => {
    expect(isRefusedCursor(error({ status: 500 }))).toBe(false);
    expect(isRefusedCursor(error({ status: 404 }))).toBe(false);
    expect(isRefusedCursor(error({ status: undefined }))).toBe(false);
  });

  it('is false for another kind of failure', () => {
    expect(isRefusedCursor(error({ kind: 'network' }))).toBe(false);
    expect(isRefusedCursor(error({ kind: 'schema' }))).toBe(false);
  });

  it('is false for another field or another code', () => {
    expect(isRefusedCursor(error({ details: [{ ...detail, field: 'q' }] }))).toBe(false);
    expect(isRefusedCursor(error({ details: [{ ...detail, code: 'IS_STRING' }] }))).toBe(false);
    expect(isRefusedCursor(error({ details: [] }))).toBe(false);
  });

  it('is false for anything that is not an ApiError', () => {
    expect(isRefusedCursor(undefined)).toBe(false);
    expect(isRefusedCursor(null)).toBe(false);
    expect(isRefusedCursor(new Error('x'))).toBe(false);
    expect(isRefusedCursor({ kind: 'http', status: 400, details: [detail] })).toBe(false);
  });
});
