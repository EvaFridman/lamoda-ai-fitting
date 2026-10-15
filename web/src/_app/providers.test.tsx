import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/shared/api';

import { createBrowserQueryClient } from './providers';

describe('createBrowserQueryClient defaults', () => {
  it('keeps data fresh 60 s, refetches on reconnect but not on focus', () => {
    const options = createBrowserQueryClient().getDefaultOptions().queries;
    expect(options?.staleTime).toBe(60_000);
    expect(options?.refetchOnWindowFocus).toBe(false);
    expect(options?.refetchOnReconnect).toBe(true);
  });

  it('makes a new client each time', () => {
    expect(createBrowserQueryClient()).not.toBe(createBrowserQueryClient());
  });
});

describe('browser query retries', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function failing(error: unknown) {
    return vi.fn<() => Promise<unknown>>().mockRejectedValue(error);
  }

  async function run(queryFn: () => Promise<unknown>) {
    const client = createBrowserQueryClient();
    const result = client.fetchQuery({ queryKey: ['k'], queryFn }).catch((e: unknown) => e);
    return { client, result };
  }

  it.each([
    ['503', new ApiError('m', { kind: 'http', template: '/t', status: 503 })],
    ['network', new ApiError('m', { kind: 'network', template: '/t' })],
  ])('retries %s twice, after 1 s and then 2 s', async (_name, error) => {
    const queryFn = failing(error);
    const { result } = await run(queryFn);
    await vi.advanceTimersByTimeAsync(0);
    expect(queryFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(queryFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(queryFn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(queryFn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(queryFn).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(queryFn).toHaveBeenCalledTimes(3);
    expect(await result).toBe(error);
  });

  it('succeeds when a retry gets an answer', async () => {
    const queryFn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new ApiError('m', { kind: 'http', template: '/t', status: 503 }))
      .mockResolvedValue('data');
    const { result } = await run(queryFn);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toBe('data');
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['400', new ApiError('m', { kind: 'http', template: '/t', status: 400 })],
    ['401', new ApiError('m', { kind: 'http', template: '/t', status: 401 })],
    ['404', new ApiError('m', { kind: 'http', template: '/t', status: 404 })],
    ['429', new ApiError('m', { kind: 'http', template: '/t', status: 429 })],
    ['500', new ApiError('m', { kind: 'http', template: '/t', status: 500 })],
    ['502', new ApiError('m', { kind: 'http', template: '/t', status: 502 })],
    ['timeout', new ApiError('m', { kind: 'timeout', template: '/t' })],
    ['schema', new ApiError('m', { kind: 'schema', template: '/t' })],
    ['path', new ApiError('m', { kind: 'path', template: '/t' })],
    ['a plain Error', new Error('x')],
  ])('does not retry %s', async (_name, error) => {
    const queryFn = failing(error);
    const { result } = await run(queryFn);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(await result).toBe(error);
  });
});
