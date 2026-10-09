import { describe, expect, it } from 'vitest';

import { AppException } from '../errors/app.exception.js';
import { UuidPipe } from './uuid.pipe.js';

describe('UuidPipe', () => {
  const pipe = new UuidPipe();
  const valid = '3f2b8c1e-5d4a-4b6e-9a7c-1d2e3f4a5b6c';

  it('returns a valid UUID unchanged', async () => {
    await expect(pipe.transform(valid, { type: 'param', data: 'id' })).resolves.toBe(valid);
  });

  it('refuses a bad id with 400 INVALID_ID naming the parameter', async () => {
    const error = await pipe
      .transform('not-a-uuid', { type: 'param', data: 'brandId' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppException);
    const exception = error as AppException;
    expect(exception.getStatus()).toBe(400);
    expect(exception.body).toEqual({
      error: {
        code: 'INVALID_ID',
        message: 'brandId must be a UUID',
        details: [{ field: 'brandId', code: 'INVALID_ID', message: 'brandId must be a UUID' }],
      },
    });
  });

  it('names the parameter "id" when the decorator gave no name', async () => {
    const error = (await pipe
      .transform('x', { type: 'param' })
      .catch((e: unknown) => e)) as AppException;
    expect(error.body.error.details[0]?.field).toBe('id');
  });

  it('refuses an empty string', async () => {
    await expect(pipe.transform('', { type: 'param', data: 'id' })).rejects.toMatchObject({
      body: { error: { code: 'INVALID_ID' } },
    });
  });
});
