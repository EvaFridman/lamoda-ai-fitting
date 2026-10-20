import {
  type ArgumentsHost,
  HttpException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import { ThrottlerException } from '@nestjs/throttler';
import * as Sentry from '@sentry/nestjs';
import type { Request, Response } from 'express';
import type { PinoLogger } from 'nestjs-pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Prisma } from '../../generated/prisma/client.js';
import {
  AppException,
  NotFoundError,
  RequestTimeoutError,
  SessionUnavailableError,
  UnauthorizedError,
  ValidationError,
} from '../errors/app.exception.js';
import { requestContextMiddleware, requestContextOf } from '../http/request-context.js';
import { AppExceptionFilter, loggable, OUTAGE_REPORT_INTERVAL_MS } from './app-exception.filter.js';

// getIsolationScope: the request-context middleware tags the scope with the request id.
vi.mock('@sentry/nestjs', () => ({
  captureException: vi.fn(),
  getIsolationScope: () => ({ setTag: () => undefined }),
}));

describe('AppExceptionFilter', () => {
  const response = { marker: 'response' };
  const reply = vi.fn();
  const logger = { error: vi.fn(), warn: vi.fn() };
  const request = {
    get: () => undefined,
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as Request;
  const host = {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
  } as unknown as ArgumentsHost;
  let requestId: string;
  let filter: AppExceptionFilter;

  beforeEach(() => {
    vi.resetAllMocks();
    requestContextMiddleware({ proxySecret: '' })(
      request,
      { setHeader: vi.fn() } as unknown as Response,
      () => undefined,
    );
    requestId = requestContextOf(request).requestId;
    filter = new AppExceptionFilter(
      { httpAdapter: { reply } } as unknown as HttpAdapterHost,
      logger as unknown as PinoLogger,
    );
  });

  it('replies with the error body and status, and logs a 4xx as a warning', () => {
    filter.catch(new NotFoundError(), host);

    expect(reply).toHaveBeenCalledWith(
      response,
      { error: { code: 'NOT_FOUND', message: 'Record not found', details: [] } },
      404,
    );
    expect(logger.warn).toHaveBeenCalledWith(
      { code: 'NOT_FOUND', status: 404, requestId },
      'Record not found',
    );
    expect(requestId).toMatch(/^[\da-f-]{36}$/);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs a 5xx as an error with the original error, and hides it from the body', () => {
    const original = new TypeError('internal detail');

    filter.catch(original, host);

    expect(reply).toHaveBeenCalledWith(
      response,
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error', details: [] } },
      500,
    );
    expect(logger.error).toHaveBeenCalledWith(
      {
        err: expect.objectContaining({
          type: 'TypeError',
          message: 'internal detail',
          stack: original.stack,
        }),
        code: 'INTERNAL_ERROR',
        requestId,
      },
      'Internal server error',
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('keeps the terminus body and status of a failed health check', () => {
    const terminusBody = {
      status: 'error',
      info: {},
      error: { redis: { status: 'down' } },
      details: { redis: { status: 'down' } },
    };

    filter.catch(new ServiceUnavailableException(terminusBody), host);

    expect(reply).toHaveBeenCalledWith(response, terminusBody, 503);
  });

  it('wraps a 503 that is not a health check result', () => {
    filter.catch(new HttpException('down', HttpStatus.SERVICE_UNAVAILABLE), host);

    expect(reply).toHaveBeenCalledWith(
      response,
      expect.objectContaining({ error: expect.objectContaining({ code: 'SERVICE_UNAVAILABLE' }) }),
      503,
    );
    expect(logger.error).toHaveBeenCalled();
  });

  it('still replies and logs when the request has no context (requestId is undefined)', () => {
    const bare = {
      switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({}) }),
    } as unknown as ArgumentsHost;

    filter.catch(new NotFoundError(), bare);

    expect(reply).toHaveBeenCalledWith(response, expect.anything(), 404);
    expect(logger.warn).toHaveBeenCalledWith(
      { code: 'NOT_FOUND', status: 404, requestId: undefined },
      'Record not found',
    );
  });

  describe('Sentry', () => {
    it('reports an unknown error as a 500 with its error code, and still replies the same', () => {
      const original = new TypeError('internal detail');

      filter.catch(original, host);

      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      expect(Sentry.captureException).toHaveBeenCalledWith(original, {
        tags: { 'error.code': 'INTERNAL_ERROR' },
      });
      expect(reply).toHaveBeenCalledWith(
        response,
        { error: { code: 'INTERNAL_ERROR', message: 'Internal server error', details: [] } },
        500,
      );
    });

    it('reports a 503 SERVICE_UNAVAILABLE', () => {
      const original = Object.assign(new Error('connect failed'), { code: 'ECONNREFUSED' });

      filter.catch(original, host);

      expect(Sentry.captureException).toHaveBeenCalledWith(original, {
        tags: { 'error.code': 'SERVICE_UNAVAILABLE' },
      });
      expect(reply).toHaveBeenCalledWith(
        response,
        expect.objectContaining({
          error: expect.objectContaining({ code: 'SERVICE_UNAVAILABLE' }),
        }),
        503,
      );
    });

    it('reports a failed /health/ready check and keeps the terminus body', () => {
      const terminusBody = {
        status: 'error',
        info: {},
        error: { redis: { status: 'down' } },
        details: { redis: { status: 'down' } },
      };
      const original = new ServiceUnavailableException(terminusBody);

      filter.catch(original, host);

      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      expect(Sentry.captureException).toHaveBeenCalledWith(original);
      expect(reply).toHaveBeenCalledWith(response, terminusBody, 503);
    });

    it('reports a RequestTimeoutError with report=true like any 5xx', () => {
      const original = new RequestTimeoutError(30_000, true);

      filter.catch(original, host);

      expect(Sentry.captureException).toHaveBeenCalledWith(original, {
        tags: { 'error.code': 'SERVICE_UNAVAILABLE' },
      });
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.warn).not.toHaveBeenCalled();
      expect(reply).toHaveBeenCalledWith(
        response,
        expect.objectContaining({
          error: expect.objectContaining({ code: 'SERVICE_UNAVAILABLE' }),
        }),
        503,
      );
    });

    it('logs a RequestTimeoutError with report=false as a warning, skips Sentry and still answers 503', () => {
      const original = new RequestTimeoutError(30_000, false);

      filter.catch(original, host);

      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        { code: 'SERVICE_UNAVAILABLE', status: 503, requestId },
        original.message,
      );
      expect(reply).toHaveBeenCalledWith(
        response,
        {
          error: { code: 'SERVICE_UNAVAILABLE', message: original.message, details: [] },
        },
        503,
      );
    });

    it('reports a SessionUnavailableError with report=true as an error', () => {
      const original = new SessionUnavailableError('The session could not be read', true);

      filter.catch(original, host);

      expect(Sentry.captureException).toHaveBeenCalledWith(original, {
        tags: { 'error.code': 'SERVICE_UNAVAILABLE' },
      });
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.warn).not.toHaveBeenCalled();
      expect(reply).toHaveBeenCalledWith(
        response,
        {
          error: { code: 'SERVICE_UNAVAILABLE', message: original.message, details: [] },
        },
        503,
      );
    });

    it('logs a SessionUnavailableError with report=false as a warning, skips Sentry and answers 503', () => {
      const original = new SessionUnavailableError('The session could not be read', false);

      filter.catch(original, host);

      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(reply).toHaveBeenCalledWith(
        response,
        {
          error: { code: 'SERVICE_UNAVAILABLE', message: original.message, details: [] },
        },
        503,
      );
    });

    it('keeps reporting other 503s while a timeout is not reported', () => {
      filter.catch(new RequestTimeoutError(30_000, false), host);
      filter.catch(new HttpException('down', HttpStatus.SERVICE_UNAVAILABLE), host);

      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['404 not found', () => new NotFoundError()],
      ['404 unknown route', () => new NotFoundException('Cannot GET /x')],
      ['400 validation', () => new ValidationError([{ field: 'a', code: 'x', message: 'bad' }])],
      ['401 unauthorized', () => new UnauthorizedError()],
      ['429 throttled', () => new ThrottlerException()],
    ])('does not report %s', (_name, make) => {
      filter.catch(make(), host);

      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(reply).toHaveBeenCalledTimes(1);
    });
  });

  describe('outage reports, once per route and minute (O60)', () => {
    function hostOf(method: string, routePath?: string, url = routePath): ArgumentsHost {
      const routed = {
        method,
        url,
        ...(routePath === undefined ? {} : { route: { path: routePath } }),
      };
      return {
        switchToHttp: () => ({ getResponse: () => response, getRequest: () => routed }),
      } as unknown as ArgumentsHost;
    }
    const outage = () => Object.assign(new Error('connect failed'), { code: 'ECONNREFUSED' });

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('reports the first outage of a route, and logs a repeat within a minute as a warning', () => {
      const first = outage();
      const repeat = outage();

      filter.catch(first, hostOf('GET', '/products'));
      vi.advanceTimersByTime(OUTAGE_REPORT_INTERVAL_MS - 1);
      filter.catch(repeat, hostOf('GET', '/products'));

      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      expect(Sentry.captureException).toHaveBeenCalledWith(first, {
        tags: { 'error.code': 'SERVICE_UNAVAILABLE' },
      });
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        { err: loggable(repeat), code: 'SERVICE_UNAVAILABLE', requestId: undefined },
        expect.any(String),
      );
      expect(reply).toHaveBeenCalledTimes(2);
      expect(reply).toHaveBeenLastCalledWith(
        response,
        expect.objectContaining({
          error: expect.objectContaining({ code: 'SERVICE_UNAVAILABLE' }),
        }),
        503,
      );
    });

    it('reports the route again once a minute has passed', () => {
      filter.catch(outage(), hostOf('GET', '/products'));
      vi.advanceTimersByTime(OUTAGE_REPORT_INTERVAL_MS);
      filter.catch(outage(), hostOf('GET', '/products'));

      expect(Sentry.captureException).toHaveBeenCalledTimes(2);
    });

    it('counts another route and another method on the same path independently', () => {
      filter.catch(outage(), hostOf('GET', '/products'));
      filter.catch(outage(), hostOf('GET', '/brands'));
      filter.catch(outage(), hostOf('POST', '/products'));

      expect(Sentry.captureException).toHaveBeenCalledTimes(3);
    });

    it('shares one key between two paths of one route template', () => {
      filter.catch(outage(), hostOf('GET', '/products/:id', '/products/1'));
      filter.catch(outage(), hostOf('GET', '/products/:id', '/products/2'));

      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('keys a request with no matched route as "(no route)", whatever its path', () => {
      filter.catch(outage(), hostOf('GET', undefined, '/a'));
      filter.catch(outage(), hostOf('GET', undefined, '/b'));

      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    });

    it('limits a statement timeout and a Prisma transaction timeout like any outage', () => {
      const statementTimeout = new Prisma.PrismaClientKnownRequestError('cancelled', {
        code: 'P2010',
        clientVersion: '7.10.0',
        meta: { driverAdapterError: { cause: { originalCode: '57014' } } },
      });
      const transactionTimeout = new Prisma.PrismaClientKnownRequestError(
        'Unable to start a transaction in the given time.',
        { code: 'P2028', clientVersion: '7.10.0' },
      );

      filter.catch(statementTimeout, hostOf('GET', '/products'));
      filter.catch(transactionTimeout, hostOf('GET', '/products'));

      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('reports a 500 every time', () => {
      filter.catch(new TypeError('bug'), hostOf('GET', '/products'));
      filter.catch(new TypeError('bug'), hostOf('GET', '/products'));

      expect(Sentry.captureException).toHaveBeenCalledTimes(2);
    });

    it('does not let an outage hide a 500 of the same route', () => {
      filter.catch(outage(), hostOf('GET', '/products'));
      filter.catch(new TypeError('bug'), hostOf('GET', '/products'));

      expect(Sentry.captureException).toHaveBeenCalledTimes(2);
    });

    it('does not limit a 503 of the api itself, which keeps its own report flag', () => {
      filter.catch(new RequestTimeoutError(30_000, true), hostOf('GET', '/products'));
      filter.catch(new RequestTimeoutError(30_000, true), hostOf('GET', '/products'));
      filter.catch(new SessionUnavailableError('unreadable', true), hostOf('GET', '/products'));

      expect(Sentry.captureException).toHaveBeenCalledTimes(3);
    });

    it('limits a plain AppException 503, such as the facet slots’, like any outage', () => {
      const busy = () => new AppException('SERVICE_UNAVAILABLE', 'Too many filter counts at once');

      filter.catch(busy(), hostOf('GET', '/products/facets'));
      filter.catch(busy(), hostOf('GET', '/products/facets'));

      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('does not let a RequestTimeoutError use up the route’s outage report', () => {
      filter.catch(new RequestTimeoutError(30_000, true), hostOf('GET', '/products'));
      filter.catch(outage(), hostOf('GET', '/products'));

      expect(Sentry.captureException).toHaveBeenCalledTimes(2);
    });

    it('keeps a separate count per filter instance', () => {
      const other = new AppExceptionFilter(
        { httpAdapter: { reply } } as unknown as HttpAdapterHost,
        logger as unknown as PinoLogger,
      );

      filter.catch(outage(), hostOf('GET', '/products'));
      other.catch(outage(), hostOf('GET', '/products'));

      expect(Sentry.captureException).toHaveBeenCalledTimes(2);
    });
  });

  it('logs a Prisma error through loggable: sanitized err, no personal data', () => {
    const original = unmappedPrismaError();

    filter.catch(original, host);

    expect(logger.error).toHaveBeenCalledWith(
      { err: loggable(original), code: 'INTERNAL_ERROR', requestId },
      'Internal server error',
    );
    expect(logger.error.mock.calls[0]?.[0].err).toMatchObject({
      type: 'PrismaClientKnownRequestError',
      code: 'P2010',
      sqlState: '22007',
    });
    const logged = JSON.stringify(logger.error.mock.calls);
    expect(logged).toContain('P2010');
    for (const secret of SECRETS) expect(logged).not.toContain(secret);
  });
});

const SECRETS = ['1990-13-45', 'Failing row', '+7999', 'Ivan'];

function unmappedPrismaError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Raw query failed. date/time field value out of range: "1990-13-45". Failing row contains (Ivan, +79990001122)',
    {
      code: 'P2010',
      clientVersion: '7.10.0',
      meta: {
        driverAdapterError: {
          cause: {
            kind: 'postgres',
            originalCode: '22007',
            message: 'date/time field value out of range: "1990-13-45"',
            detail: 'Failing row contains (Ivan, +79990001122)',
          },
        },
      },
    },
  );
}

describe('loggable', () => {
  it('keeps the codes and the stack frames of a Prisma known error, nothing else', () => {
    const result = loggable(unmappedPrismaError()) as Record<string, unknown>;

    expect(result).toMatchObject({
      type: 'PrismaClientKnownRequestError',
      code: 'P2010',
      kind: 'postgres',
      sqlState: '22007',
    });
    expect(Object.keys(result).sort()).toEqual(['code', 'kind', 'sqlState', 'stack', 'type']);
    expect(String(result.stack)).toMatch(/^PrismaClientKnownRequestError\n/);
    expect(String(result.stack)).toContain('at ');
    expect(JSON.stringify(result)).toContain('22007');
    for (const secret of SECRETS) expect(JSON.stringify(result)).not.toContain(secret);
  });

  it('logs nothing of the call arguments in a PrismaClientValidationError', () => {
    const error = new Prisma.PrismaClientValidationError(
      'Invalid `prisma.user.create()` invocation: data: { phone: "+79990001122", email: "ivan@example.com" }',
      { clientVersion: '7.10.0' },
    );

    const logged = JSON.stringify(loggable(error));

    expect(logged).toContain('PrismaClientValidationError');
    expect(logged).not.toContain('+7999');
    expect(logged).not.toContain('ivan@example.com');
    expect(logged).not.toContain('invocation');
  });

  it('turns a plain Error into a new object with type, message and the original stack', () => {
    const error = new Error('plain failure');
    const result = loggable(error);

    expect(result).not.toBe(error);
    expect(result).toMatchObject({ type: 'Error', message: 'plain failure', stack: error.stack });
  });

  it('does not copy other fields of an error, such as an ioredis command', () => {
    const error = Object.assign(new Error('redis failed'), {
      command: { name: 'set', args: ['secret-key', 'secret-value'] },
      meta: { row: 'secret-row' },
    });

    const logged = JSON.stringify(loggable(error));

    expect(logged).toContain('redis failed');
    expect(logged).not.toContain('secret');
  });

  it('logs the cause of an error without the Prisma message or detail', () => {
    const error = new Error('outer', { cause: unmappedPrismaError() });

    const result = loggable(error) as { message: string; cause: Record<string, unknown> };

    expect(result.message).toBe('outer');
    expect(result.cause).toMatchObject({ type: 'PrismaClientKnownRequestError', code: 'P2010' });
    const logged = JSON.stringify(result);
    for (const secret of SECRETS) expect(logged).not.toContain(secret);
    expect(logged).not.toContain('Raw query failed');
  });

  it('logs the errors of an AggregateError without call arguments', () => {
    const inner = new Prisma.PrismaClientValidationError(
      'Invalid `prisma.user.create()` invocation: data: { phone: "+79990001122" }',
      { clientVersion: '7.10.0' },
    );

    const result = loggable(new AggregateError([inner, new Error('second')], 'many')) as {
      errors: Record<string, unknown>[];
    };

    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toMatchObject({ type: 'PrismaClientValidationError' });
    expect(result.errors[1]).toMatchObject({ message: 'second' });
    expect(JSON.stringify(result)).not.toContain('+7999');
  });

  it('marks a cycle of causes as [Circular]', () => {
    const first = new Error('first');
    const second = new Error('second', { cause: first });
    first.cause = second;

    const result = loggable(first) as { cause: { cause: unknown } };

    expect(result.cause.cause).toBe('[Circular]');
  });

  it('returns a non-error value as it is', () => {
    expect(loggable('boom')).toBe('boom');
  });
});
