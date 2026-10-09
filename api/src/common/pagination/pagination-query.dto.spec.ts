import { describe, expect, it } from 'vitest';

import { ValidationError } from '../errors/app.exception.js';
import { createValidationPipe } from '../validation/validation-pipe.js';
import { MAX_OFFSET, PaginationQueryDto } from './pagination-query.dto.js';

const pipe = createValidationPipe();

function parse(query: Record<string, unknown>): Promise<unknown> {
  return pipe.transform(query, { type: 'query', metatype: PaginationQueryDto });
}

async function failureOf(query: Record<string, unknown>): Promise<ValidationError> {
  const error: unknown = await parse(query).then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ValidationError);
  return error as ValidationError;
}

describe('PaginationQueryDto', () => {
  it('defaults to limit 60 and offset 0', async () => {
    await expect(parse({})).resolves.toMatchObject({ limit: 60, offset: 0 });
  });

  it('converts query strings to numbers', async () => {
    const result = await parse({ limit: '10', offset: '5' });

    expect(result).toMatchObject({ limit: 10, offset: 5 });
  });

  it('accepts the bounds 1 and 100', async () => {
    await expect(parse({ limit: '1' })).resolves.toMatchObject({ limit: 1 });
    await expect(parse({ limit: '100' })).resolves.toMatchObject({ limit: 100 });
    await expect(parse({ offset: '0' })).resolves.toMatchObject({ offset: 0 });
  });

  it.each(['0', '101', '1.5', 'abc'])('refuses limit %s', async (limit) => {
    const error = await failureOf({ limit });

    expect(error.getStatus()).toBe(400);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.body.error.details.map((detail) => detail.field)).toContain('limit');
  });

  it.each(['-1', '1.5', 'abc'])('refuses offset %s', async (offset) => {
    const error = await failureOf({ offset });

    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.body.error.details.map((detail) => detail.field)).toContain('offset');
  });

  it('accepts offset MAX_OFFSET', async () => {
    await expect(parse({ offset: String(MAX_OFFSET) })).resolves.toMatchObject({
      offset: MAX_OFFSET,
    });
  });

  it.each([String(MAX_OFFSET + 1), '1e20'])('refuses offset %s', async (offset) => {
    const error = await failureOf({ offset });

    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.body.error.details.map((detail) => detail.field)).toContain('offset');
  });

  it('refuses an unknown query field', async () => {
    const error = await failureOf({ page: '2' });

    expect(error.body.error.details).toMatchObject([
      { field: 'page', code: 'WHITELIST_VALIDATION' },
    ]);
  });
});
