import { describe, expect, it } from 'vitest';

import { ApiError, retryDelay, shouldRetry } from './index';
import { isRetryable, isStartRetryable } from './retry';

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

describe('isStartRetryable', () => {
  it.each([
    ['a network error', kind('network')],
    ['a timeout', kind('timeout')],
    ['a 502', http(502)],
    ['a 503', http(503)],
    ['a 504', http(504)],
  ])('repeats %s', (_name, error) => {
    expect(isStartRetryable(error)).toBe(true);
  });

  it.each([
    ['a 400', http(400)],
    ['a 401', http(401)],
    ['a 409', http(409)],
    ['a 429', http(429)],
    ['a bare 500', http(500)],
    ['schema', kind('schema')],
    ['path', kind('path')],
    ['a plain Error', new Error('x')],
    ['undefined', undefined],
  ])('does not repeat %s', (_name, error) => {
    expect(isStartRetryable(error)).toBe(false);
  });
});

describe('retryDelay', () => {
  it('waits 1 s, then 2 s', () => {
    expect(retryDelay(0)).toBe(1000);
    expect(retryDelay(1)).toBe(2000);
  });
});
