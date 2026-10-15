// @vitest-environment node
import * as Sentry from '@sentry/nextjs';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { ApiError, type ApiErrorKind } from './api-error';
import { reportApiError, reportFailure } from './report';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

// Sentry's own type of the second argument is a union that hides `fingerprint` and `tags`.
const capture = vi.mocked(Sentry.captureException) as unknown as Mock<
  (error: unknown, hint?: { fingerprint?: string[]; tags?: Record<string, string> }) => void
>;

function apiError(
  kind: ApiErrorKind,
  extra: { template?: string; method?: string; status?: number; code?: string } = {},
): ApiError {
  return new ApiError('failed', { template: '/products/:id', method: 'GET', kind, ...extra });
}

// The throttle map lives as long as the module: each test starts past every earlier window.
let clock = Date.now();

beforeEach(() => {
  capture.mockReset();
  vi.useFakeTimers();
  clock += 10 * 60_000;
  vi.setSystemTime(clock);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('reportApiError which failures', () => {
  it.each([
    ['network', apiError('network')],
    ['timeout', apiError('timeout')],
    ['schema', apiError('schema')],
    ['http 500', apiError('http', { status: 500 })],
    ['http 502 without a code', apiError('http', { status: 502 })],
    ['http 503', apiError('http', { status: 503, code: 'SERVICE_UNAVAILABLE' })],
    ['http 504', apiError('http', { status: 504 })],
    ['http 401', apiError('http', { status: 401, code: 'UNAUTHORIZED' })],
  ])('reports %s', (_name, error) => {
    reportApiError(error);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0]?.[0]).toBe(error);
  });

  it.each([
    ['http 400', apiError('http', { status: 400 })],
    ['http 404', apiError('http', { status: 404, code: 'NOT_FOUND' })],
    ['http 409', apiError('http', { status: 409 })],
    ['http 413', apiError('http', { status: 413 })],
    ['http 429', apiError('http', { status: 429 })],
    ['path', apiError('path', { method: undefined })],
  ])('does not report %s', (_name, error) => {
    reportApiError(error);
    expect(capture).not.toHaveBeenCalled();
  });
});

describe('reportApiError fingerprint and tags', () => {
  it('fingerprints by kind, method and template', () => {
    reportApiError(apiError('network'));
    expect(capture).toHaveBeenCalledWith(expect.any(ApiError), {
      fingerprint: ['api-failure', 'network', 'GET', '/products/:id'],
      tags: {},
    });
  });

  it('ends the fingerprint of an http failure with its status', () => {
    reportApiError(apiError('http', { status: 503 }));
    expect(capture.mock.calls[0]?.[1]?.fingerprint).toEqual([
      'api-failure',
      'http',
      'GET',
      '/products/:id',
      '503',
    ]);
  });

  it('sends a 500 and a 401 of one route within the same minute, but 500 twice once', () => {
    reportApiError(apiError('http', { status: 500 }));
    reportApiError(apiError('http', { status: 401 }));
    reportApiError(apiError('http', { status: 500 }));
    expect(capture).toHaveBeenCalledTimes(2);
    expect(capture.mock.calls.map((call) => call[1]?.fingerprint?.at(-1))).toEqual(['500', '401']);
  });

  it('is one fingerprint for two ids of one template', () => {
    // The concrete id never reaches the error, only the template.
    reportApiError(apiError('network'));
    vi.advanceTimersByTime(61_000);
    reportApiError(apiError('network'));
    const [first, second] = capture.mock.calls.map((call) => call[1]?.fingerprint);
    expect(first).toEqual(second);
  });

  it('separates templates and methods', () => {
    reportApiError(apiError('network'));
    reportApiError(apiError('network', { template: '/brands/:id' }));
    reportApiError(apiError('network', { method: 'POST' }));
    expect(capture).toHaveBeenCalledTimes(3);
    const prints = capture.mock.calls.map((call) => JSON.stringify(call[1]?.fingerprint));
    expect(new Set(prints).size).toBe(3);
  });

  it('tags status, code and request id', () => {
    reportApiError(apiError('http', { status: 503, code: 'SERVICE_UNAVAILABLE' }), {
      requestId: 'a'.repeat(32),
    });
    expect(capture.mock.calls[0]?.[1]?.tags).toEqual({
      api_status: '503',
      api_code: 'SERVICE_UNAVAILABLE',
      request_id: 'a'.repeat(32),
    });
  });

  it('leaves out api_code when the answer had none', () => {
    reportApiError(apiError('http', { status: 502 }));
    expect(capture.mock.calls[0]?.[1]?.tags).toEqual({ api_status: '502' });
  });

  it('carries no path, query or body in tags or fingerprint', () => {
    const error = new ApiError('x', {
      kind: 'http',
      template: '/products/:id',
      method: 'GET',
      status: 500,
    });
    reportApiError(error);
    const event = JSON.stringify(capture.mock.calls[0]?.[1]);
    expect(event).not.toMatch(/secret|\?|query/);
  });
});

describe('reportApiError throttle', () => {
  it('sends one event for ten identical failures within 60 seconds', () => {
    for (let i = 0; i < 10; i++) {
      reportApiError(apiError('network'));
      vi.advanceTimersByTime(5_000);
    }
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('sends another after 60 seconds', () => {
    reportApiError(apiError('network'));
    vi.advanceTimersByTime(59_999);
    reportApiError(apiError('network'));
    expect(capture).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    reportApiError(apiError('network'));
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it('does not let a skipped failure start a window', () => {
    reportApiError(apiError('http', { status: 404 }));
    reportApiError(apiError('http', { status: 404 }));
    expect(capture).not.toHaveBeenCalled();
  });
});

describe('reportFailure', () => {
  it('does not report an ApiError again', () => {
    reportFailure(apiError('network'));
    expect(capture).not.toHaveBeenCalled();
  });

  it('reports a plain Error by its name', () => {
    const error = new TypeError('boom');
    reportFailure(error);
    expect(capture).toHaveBeenCalledWith(error, {
      fingerprint: ['web-failure', 'TypeError'],
      tags: {},
    });
  });

  it('reports a non-Error by its type', () => {
    reportFailure('boom');
    expect(capture).toHaveBeenCalledWith('boom', {
      fingerprint: ['web-failure', 'string'],
      tags: {},
    });
  });

  it('throttles like api failures', () => {
    reportFailure(new Error('a'));
    reportFailure(new Error('b'));
    expect(capture).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    reportFailure(new Error('c'));
    expect(capture).toHaveBeenCalledTimes(2);
  });
});
