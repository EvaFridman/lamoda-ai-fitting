import { type CallHandler, type ExecutionContext, Logger, NotFoundException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { lastValueFrom, Observable, of, Subject, timer } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppException, RequestTimeoutError } from '../errors/app.exception.js';
import { requestContextMiddleware, requestContextOf } from './request-context.js';
import { TIMEOUT_REPORT_INTERVAL_MS, TimeoutInterceptor } from './timeout.interceptor.js';

class ProbeController {
  slow(): void {}
  other(): void {}
}

function contextOf(
  type: string,
  handler: () => void = ProbeController.prototype.slow,
  request: unknown = {},
): ExecutionContext {
  return {
    getType: () => type,
    getClass: () => ProbeController,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function handlerAfter(ms: number, value: string): CallHandler {
  return {
    handle: () =>
      new Observable((subscriber) =>
        timer(ms).subscribe(() => {
          subscriber.next(value);
          subscriber.complete();
        }),
      ),
  };
}

function never(): CallHandler {
  return { handle: () => new Observable(() => undefined) };
}

// Subscribes and collects what the interceptor emits to the subscriber.
function listen(source: Observable<unknown>) {
  const seen = { values: [] as unknown[], errors: [] as unknown[], completed: false };
  const subscription = source.subscribe({
    next: (value) => seen.values.push(value),
    error: (error: unknown) => seen.errors.push(error),
    complete: () => {
      seen.completed = true;
    },
  });
  return { seen, subscription };
}

describe('TimeoutInterceptor', () => {
  const warn = vi.spyOn(Logger.prototype, 'warn');

  beforeEach(() => {
    vi.useFakeTimers();
    warn.mockReset().mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes a fast http handler through', async () => {
    const interceptor = new TimeoutInterceptor(100);

    const result = lastValueFrom(interceptor.intercept(contextOf('http'), handlerAfter(50, 'ok')));
    await vi.advanceTimersByTimeAsync(60);

    await expect(result).resolves.toBe('ok');
  });

  it('errors a slow http handler with SERVICE_UNAVAILABLE 503 after ms', async () => {
    const interceptor = new TimeoutInterceptor(100);

    const result = lastValueFrom(
      interceptor.intercept(contextOf('http'), handlerAfter(5_000, 'late')),
    );
    const caught = result.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(101);

    const error = await caught;
    expect(error).toBeInstanceOf(RequestTimeoutError);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(503);
    expect((error as AppException).code).toBe('SERVICE_UNAVAILABLE');
    expect((error as AppException).message).toContain('100 ms');
  });

  it('does not time out a ws handler, however slow', async () => {
    const interceptor = new TimeoutInterceptor(100);

    const result = lastValueFrom(
      interceptor.intercept(contextOf('ws'), handlerAfter(5_000, 'slow')),
    );
    await vi.advanceTimersByTimeAsync(5_001);

    await expect(result).resolves.toBe('slow');
  });

  it('returns the handler observable itself for a ws context', () => {
    const interceptor = new TimeoutInterceptor(100);
    const source = of('x');

    expect(interceptor.intercept(contextOf('ws'), { handle: () => source })).toBe(source);
  });

  describe('before the timeout', () => {
    it('passes values, completion and errors through unchanged', () => {
      const interceptor = new TimeoutInterceptor(100);
      const subject = new Subject<string>();
      const { seen } = listen(interceptor.intercept(contextOf('http'), { handle: () => subject }));

      subject.next('a');
      subject.complete();

      expect(seen).toEqual({ values: ['a'], errors: [], completed: true });

      const failing = new Subject<string>();
      const original = new NotFoundException('gone');
      const second = listen(interceptor.intercept(contextOf('http'), { handle: () => failing }));
      failing.error(original);

      expect(second.seen.errors).toEqual([original]);
    });

    it('clears the timer: nothing fires and nothing is logged later', async () => {
      const interceptor = new TimeoutInterceptor(100);
      const subject = new Subject<string>();
      const { seen } = listen(interceptor.intercept(contextOf('http'), { handle: () => subject }));

      subject.next('a');
      subject.complete();
      await vi.advanceTimersByTimeAsync(1_000);

      expect(seen.errors).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
      expect(warn).not.toHaveBeenCalled();
    });

    it('clears the timer when the handler fails, and logs nothing', async () => {
      const interceptor = new TimeoutInterceptor(100);
      const subject = new Subject<string>();
      const { seen } = listen(interceptor.intercept(contextOf('http'), { handle: () => subject }));

      subject.error(new Error('boom'));
      await vi.advanceTimersByTimeAsync(1_000);

      expect(seen.errors).toHaveLength(1);
      expect(vi.getTimerCount()).toBe(0);
      expect(warn).not.toHaveBeenCalled();
    });

    it('keeps the timer after a first value: a handler that never completes still times out', async () => {
      const interceptor = new TimeoutInterceptor(100);
      const subject = new Subject<string>();
      const { seen } = listen(interceptor.intercept(contextOf('http'), { handle: () => subject }));

      subject.next('first');
      await vi.advanceTimersByTimeAsync(101);

      expect(seen.values).toEqual(['first']);
      expect(seen.errors).toHaveLength(1);
      expect(seen.errors[0]).toBeInstanceOf(RequestTimeoutError);
      expect(seen.completed).toBe(false);
    });

    it('passes a synchronous throw of next.handle() on, without marking the route reported', async () => {
      const interceptor = new TimeoutInterceptor(100);
      const boom = new Error('sync');
      const throwing: CallHandler = {
        handle: () => {
          throw boom;
        },
      };
      const { seen } = listen(interceptor.intercept(contextOf('http'), throwing));

      expect(seen.errors).toEqual([boom]);
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(1_000);

      expect(warn).not.toHaveBeenCalled();
      expect(seen.errors).toEqual([boom]);

      const later = listen(interceptor.intercept(contextOf('http'), never()));
      await vi.advanceTimersByTimeAsync(100);
      expect((later.seen.errors[0] as RequestTimeoutError).report).toBe(true);
    });

    it('unsubscribes the handler when the subscriber leaves, and clears the timer', () => {
      const interceptor = new TimeoutInterceptor(100);
      const subject = new Subject<string>();
      const { subscription } = listen(
        interceptor.intercept(contextOf('http'), { handle: () => subject }),
      );
      expect(subject.observed).toBe(true);

      subscription.unsubscribe();

      expect(subject.observed).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('after the timeout', () => {
    it('keeps listening to the handler and logs a warning with the route when it succeeds', async () => {
      const interceptor = new TimeoutInterceptor(100);
      const subject = new Subject<string>();
      const { seen } = listen(interceptor.intercept(contextOf('http'), { handle: () => subject }));

      await vi.advanceTimersByTimeAsync(100);
      expect(seen.errors).toHaveLength(1);
      expect(subject.observed).toBe(true);
      expect(warn).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(400);
      subject.next('late');
      subject.complete();

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith({
        msg: 'A handler that timed out has ended',
        route: 'ProbeController.slow',
        requestId: undefined,
        durationMs: 500,
        outcome: 'succeeded',
        errorType: undefined,
        code: undefined,
        errorMessage: undefined,
      });
      expect(seen.values).toEqual([]);
    });

    it('logs outcome failed with the code and message of the error', async () => {
      const interceptor = new TimeoutInterceptor(100);
      const subject = new Subject<string>();
      listen(interceptor.intercept(contextOf('http'), { handle: () => subject }));

      await vi.advanceTimersByTimeAsync(100);
      subject.error(new NotFoundException('gone'));

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'A handler that timed out has ended',
          route: 'ProbeController.slow',
          outcome: 'failed',
          errorType: 'NotFoundException',
          code: 'ROUTE_NOT_FOUND',
          errorMessage: expect.any(String),
        }),
      );
    });

    it('logs an unknown error without its own message', async () => {
      const interceptor = new TimeoutInterceptor(100);
      const subject = new Subject<string>();
      listen(interceptor.intercept(contextOf('http'), { handle: () => subject }));

      await vi.advanceTimersByTimeAsync(100);
      subject.error(new TypeError('secret detail'));

      const logged = JSON.stringify(warn.mock.calls);
      expect(logged).toContain('"outcome":"failed"');
      expect(logged).toContain('INTERNAL_ERROR');
      expect(logged).not.toContain('secret detail');
    });

    it('logs the error class name and INTERNAL_ERROR for a TypeError', async () => {
      const interceptor = new TimeoutInterceptor(100);
      const subject = new Subject<string>();
      listen(interceptor.intercept(contextOf('http'), { handle: () => subject }));

      await vi.advanceTimersByTimeAsync(100);
      subject.error(new TypeError('secret detail'));

      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'failed',
          errorType: 'TypeError',
          code: 'INTERNAL_ERROR',
        }),
      );
    });

    it('logs no errorType for a thrown value that is not an Error', async () => {
      const interceptor = new TimeoutInterceptor(100);
      const subject = new Subject<string>();
      listen(interceptor.intercept(contextOf('http'), { handle: () => subject }));

      await vi.advanceTimersByTimeAsync(100);
      subject.error('just a string');

      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'failed', errorType: undefined }),
      );
    });

    it('does not emit a late value to the subscriber', async () => {
      const interceptor = new TimeoutInterceptor(100);
      const subject = new Subject<string>();
      const { seen } = listen(interceptor.intercept(contextOf('http'), { handle: () => subject }));

      await vi.advanceTimersByTimeAsync(100);
      subject.next('late');

      expect(seen.values).toEqual([]);
      expect(seen.errors).toHaveLength(1);
      expect(seen.completed).toBe(false);
    });

    it('logs the request id of the request', async () => {
      const request = {
        get: () => undefined,
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as Request;
      requestContextMiddleware({ proxySecret: '' })(
        request,
        { setHeader: vi.fn() } as unknown as Response,
        () => undefined,
      );
      const interceptor = new TimeoutInterceptor(100);
      const subject = new Subject<string>();
      listen(
        interceptor.intercept(contextOf('http', ProbeController.prototype.slow, request), {
          handle: () => subject,
        }),
      );

      await vi.advanceTimersByTimeAsync(100);
      subject.complete();

      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: requestContextOf(request).requestId }),
      );
    });
  });

  describe('reporting (F29)', () => {
    async function timeoutOf(
      interceptor: TimeoutInterceptor,
      handler: () => void = ProbeController.prototype.slow,
    ): Promise<RequestTimeoutError> {
      const { seen } = listen(interceptor.intercept(contextOf('http', handler), never()));
      await vi.advanceTimersByTimeAsync(100);
      return seen.errors[0] as RequestTimeoutError;
    }

    it('reports the first timeout of a route and not a repeat within the window', async () => {
      const interceptor = new TimeoutInterceptor(100);

      const first = await timeoutOf(interceptor);
      const second = await timeoutOf(interceptor);

      expect(first.report).toBe(true);
      expect(second.report).toBe(false);
    });

    it('reports again once the window has passed', async () => {
      const interceptor = new TimeoutInterceptor(100);

      await timeoutOf(interceptor);
      await vi.advanceTimersByTimeAsync(TIMEOUT_REPORT_INTERVAL_MS);
      const again = await timeoutOf(interceptor);

      expect(again.report).toBe(true);
    });

    it('does not report within the window just before it ends', async () => {
      const interceptor = new TimeoutInterceptor(100);

      await timeoutOf(interceptor);
      await vi.advanceTimersByTimeAsync(TIMEOUT_REPORT_INTERVAL_MS - 1_000);
      const near = await timeoutOf(interceptor);

      expect(near.report).toBe(false);
    });

    it('counts each route on its own', async () => {
      const interceptor = new TimeoutInterceptor(100);

      const slow = await timeoutOf(interceptor, ProbeController.prototype.slow);
      const other = await timeoutOf(interceptor, ProbeController.prototype.other);

      expect(slow.report).toBe(true);
      expect(other.report).toBe(true);
    });

    it('counts each interceptor instance on its own', async () => {
      const first = await timeoutOf(new TimeoutInterceptor(100));
      const second = await timeoutOf(new TimeoutInterceptor(100));

      expect(first.report).toBe(true);
      expect(second.report).toBe(true);
    });
  });
});
