import { describe, expect, it } from 'vitest';

describe('shared/api public entry', () => {
  // Client code imports this entry; it must not pull in `server-only` (no mock here on purpose).
  it('loads without server-only and exports the browser-safe parts', async () => {
    const api = await import('./index');
    expect(typeof api.buildPath).toBe('function');
    expect(typeof api.ApiError).toBe('function');
    expect('apiFetch' in api).toBe(false);
  });

  it('builds an ApiError with kind, template, status and cause', async () => {
    const { ApiError } = await import('./index');
    const cause = new Error('x');
    const error = new ApiError('m', { kind: 'http', template: '/t/:id', status: 500, cause });
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: 'ApiError',
      message: 'm',
      kind: 'http',
      template: '/t/:id',
      status: 500,
      cause,
    });
  });
});
