// @vitest-environment node
import * as Sentry from '@sentry/nextjs';
import type { ErrorEvent, EventHint } from '@sentry/nextjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { beforeSend } from '../../../sentry.options';

import { ApiError } from './api-error';
import { reportApiError } from './report';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

function send(event: Partial<ErrorEvent>, originalException?: unknown) {
  return beforeSend(event as ErrorEvent, { originalException } as EventHint);
}

function apiError(): ApiError {
  return new ApiError('failed', { kind: 'network', template: '/things', method: 'GET' });
}

describe('beforeSend', () => {
  it('drops an ApiError without a fingerprint', () => {
    expect(send({ message: 'x' }, apiError())).toBeNull();
  });

  it('keeps an ApiError with the api-failure fingerprint', () => {
    const event = { fingerprint: ['api-failure', 'network', 'GET', '/things'] };
    expect(send(event, apiError())).toBe(event);
  });

  it('keeps an ApiError whose fingerprint has api-failure after a scope entry', () => {
    const event = { fingerprint: ['scope-fp', 'api-failure', 'network'] };
    expect(send(event, apiError())).toBe(event);
  });

  it('drops an ApiError with another fingerprint', () => {
    expect(send({ fingerprint: ['web-failure', 'Error'] }, apiError())).toBeNull();
  });

  it('drops a copy of the class by name, not by instanceof', () => {
    class ApiError extends Error {
      override name = 'ApiError';
    }
    expect(send({}, new ApiError('copy'))).toBeNull();
  });

  it.each([
    ['a plain Error', new Error('x')],
    ['a non-Error', 'boom'],
    ['an object named ApiError', { name: 'ApiError' }],
    ['no original exception', undefined],
  ])('keeps the event for %s', (_name, original) => {
    const event = { message: 'x' };
    expect(send(event, original)).toBe(event);
  });
});

describe('beforeSend with report.ts', () => {
  const capture = vi.mocked(Sentry.captureException);

  beforeEach(() => {
    capture.mockReset();
  });

  it('lets through the event reportApiError produces', () => {
    const error = apiError();
    reportApiError(error);
    const hint = capture.mock.calls[0]?.[1] as { fingerprint: string[] };
    const event = { fingerprint: hint.fingerprint };
    expect(send(event, error)).toBe(event);
  });
});
