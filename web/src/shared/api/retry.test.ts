import { describe, expect, it } from 'vitest';

import { ApiError, retryDelay, shouldRetry } from './index';
import { isRetryable } from './retry';

function http(status: number): ApiError {
  return new ApiError('m', { kind: 'http', template: '/t', status });
}

function kind(value: 'network' | 'timeout' | 'schema' | 'path'): ApiError {
  return new ApiError('m', { kind: value, template: '/t' });
}

describe('shouldRetry', () => {
  it.each([[kind('network')], [http(503)]])('retries twice: %s', (error) => {
    expect(shouldRetry(0, error)).toBe(true);
    expect(shouldRetry(1, error)).toBe(true);
    expect(shouldRetry(2, error)).toBe(false);
    expect(shouldRetry(3, error)).toBe(false);
  });

  it.each([
    ['400', http(400)],
    ['401', http(401)],
    ['404', http(404)],
    ['429', http(429)],
    ['500', http(500)],
    ['502', http(502)],
    ['504', http(504)],
    ['timeout', kind('timeout')],
    ['schema', kind('schema')],
    ['path', kind('path')],
    ['a plain Error', new Error('x')],
    ['an AbortError', new DOMException('a', 'AbortError')],
    ['a string', 'network'],
    ['undefined', undefined],
  ])('never retries %s', (_name, error) => {
    expect(isRetryable(error)).toBe(false);
    expect(shouldRetry(0, error)).toBe(false);
  });
});

describe('retryDelay', () => {
  it('waits 1 s, then 2 s', () => {
    expect(retryDelay(0)).toBe(1000);
    expect(retryDelay(1)).toBe(2000);
  });
});
