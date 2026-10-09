import * as Sentry from '@sentry/nestjs';
import {
  ApplicationFailure,
  CancelledFailure,
  CompleteAsyncError,
  type Context,
  type Info,
} from '@temporalio/activity';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isReported, sentryActivityInterceptor } from './sentry-activity.interceptor.js';

vi.mock('@sentry/nestjs', () => ({ captureException: vi.fn() }));

type RetryInfo = Pick<Info, 'attempt' | 'retryPolicy'>;

const info = (attempt: number, retryPolicy?: Info['retryPolicy']): RetryInfo => ({
  attempt,
  retryPolicy,
});

describe('isReported', () => {
  const error = new Error('boom');

  it('reports the first attempt', () => {
    expect(isReported(error, info(1))).toBe(true);
    expect(isReported(error, info(1, { maximumAttempts: 5 }))).toBe(true);
  });

  it('does not report the middle attempts of unlimited retries', () => {
    expect(isReported(error, info(2))).toBe(false);
    expect(isReported(error, info(50, {}))).toBe(false);
    expect(isReported(error, info(3, { maximumAttempts: 0 }))).toBe(false);
  });

  it('does not report attempts before the maximum', () => {
    expect(isReported(error, info(2, { maximumAttempts: 3 }))).toBe(false);
  });

  it('reports the last attempt, and any later one', () => {
    expect(isReported(error, info(3, { maximumAttempts: 3 }))).toBe(true);
    expect(isReported(error, info(4, { maximumAttempts: 3 }))).toBe(true);
  });

  it('reports a non-retryable failure on a later attempt', () => {
    expect(isReported(ApplicationFailure.nonRetryable('stop'), info(2))).toBe(true);
  });

  it('does not report a retryable ApplicationFailure on a later attempt', () => {
    expect(isReported(ApplicationFailure.retryable('again'), info(2))).toBe(false);
  });

  it('reports a type listed in nonRetryableErrorTypes, for a failure and for a plain error', () => {
    const policy = { nonRetryableErrorTypes: ['BadInput', 'TypeError'] };

    expect(
      isReported(ApplicationFailure.create({ message: 'x', type: 'BadInput' }), info(2, policy)),
    ).toBe(true);
    expect(isReported(new TypeError('x'), info(2, policy))).toBe(true);
    expect(isReported(new RangeError('x'), info(2, policy))).toBe(false);
  });

  it('matches nonRetryableErrorTypes by the class name when the error sets no name', () => {
    class BadInput extends Error {}

    expect(isReported(new BadInput('x'), info(2, { nonRetryableErrorTypes: ['BadInput'] }))).toBe(
      true,
    );
    expect(isReported(new BadInput('x'), info(2, { nonRetryableErrorTypes: ['Other'] }))).toBe(
      false,
    );
  });

  it('does not report an AbortError of a cancelled activity, but does when not cancelled', () => {
    const abort = new DOMException('aborted', 'AbortError');

    expect(isReported(abort, info(1), true)).toBe(false);
    expect(isReported(abort, info(1), false)).toBe(true);
    expect(isReported(abort, info(1))).toBe(true);
  });

  it('never reports CompleteAsyncError, even on the first attempt', () => {
    expect(isReported(new CompleteAsyncError(), info(1))).toBe(false);
  });

  it('never reports a cancellation, even on the first attempt', () => {
    expect(isReported(new CancelledFailure('cancelled'), info(1))).toBe(false);
    expect(isReported(new CancelledFailure('cancelled'), info(3, { maximumAttempts: 3 }))).toBe(
      false,
    );
  });
});

describe('sentryActivityInterceptor', () => {
  beforeEach(() => {
    vi.mocked(Sentry.captureException).mockReset();
  });

  function interceptorFor(attempt: number, retryPolicy?: Info['retryPolicy'], aborted = false) {
    const ctx = {
      info: { activityType: 'generate', workflowType: 'fitting', attempt, retryPolicy },
      cancellationSignal: { aborted },
    } as unknown as Context;
    const execute = sentryActivityInterceptor(ctx).inbound?.execute;
    if (!execute) throw new Error('no execute');
    return execute;
  }
  const input = { args: [], headers: {} };

  it('returns the result of next and reports nothing', async () => {
    const execute = interceptorFor(1);

    await expect(execute(input, () => Promise.resolve('done'))).resolves.toBe('done');
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('reports a failure of the first attempt with tags and rethrows the same error', async () => {
    const failure = new Error('boom');
    const execute = interceptorFor(1);

    await expect(execute(input, () => Promise.reject(failure))).rejects.toBe(failure);

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(failure, {
      tags: {
        'temporal.activity': 'generate',
        'temporal.workflow': 'fitting',
        'temporal.attempt': 1,
      },
    });
  });

  it('rethrows without reporting a failure of a middle attempt', async () => {
    const failure = new Error('boom');
    const execute = interceptorFor(4);

    await expect(execute(input, () => Promise.reject(failure))).rejects.toBe(failure);

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('reports the last attempt with its attempt number', async () => {
    const failure = new Error('boom');
    const execute = interceptorFor(3, { maximumAttempts: 3 });

    await expect(execute(input, () => Promise.reject(failure))).rejects.toBe(failure);

    expect(Sentry.captureException).toHaveBeenCalledWith(failure, {
      tags: expect.objectContaining({ 'temporal.attempt': 3 }),
    });
  });

  it('rethrows a cancellation without reporting it', async () => {
    const cancelled = new CancelledFailure('cancelled');
    const execute = interceptorFor(1);

    await expect(execute(input, () => Promise.reject(cancelled))).rejects.toBe(cancelled);

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('rethrows an AbortError of a cancelled activity without reporting it', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    const execute = interceptorFor(1, undefined, true);

    await expect(execute(input, () => Promise.reject(abort))).rejects.toBe(abort);

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('reports an AbortError of an activity that was not cancelled', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    const execute = interceptorFor(1);

    await expect(execute(input, () => Promise.reject(abort))).rejects.toBe(abort);

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});
