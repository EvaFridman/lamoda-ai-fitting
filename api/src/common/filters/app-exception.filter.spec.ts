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
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Prisma } from '../../generated/prisma/client.js';
import {
  AppException,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../errors/app.exception.js';
import { AppExceptionFilter, loggable } from './app-exception.filter.js';

vi.mock('@sentry/nestjs', () => ({ captureException: vi.fn() }));

describe('AppExceptionFilter', () => {
  const response = { marker: 'response' };
  const reply = vi.fn();
  const logger = { error: vi.fn(), warn: vi.fn() };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  let filter: AppExceptionFilter;

  beforeEach(() => {
    vi.resetAllMocks();
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
      { code: 'NOT_FOUND', status: 404 },
      'Record not found',
    );
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

    it.each([
      ['404 not found', () => new NotFoundError()],
      ['404 unknown route', () => new NotFoundException('Cannot GET /x')],
      ['400 validation', () => new ValidationError([{ field: 'a', code: 'x', message: 'bad' }])],
      ['401 admin token', () => new UnauthorizedError()],
      ['403', () => new AppException(HttpStatus.FORBIDDEN, 'UNAUTHORIZED', 'Forbidden')],
      ['429 throttled', () => new ThrottlerException()],
    ])('does not report %s', (_name, make) => {
      filter.catch(make(), host);

      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(reply).toHaveBeenCalledTimes(1);
    });
  });

  it('logs a Prisma error through loggable: sanitized err, no personal data', () => {
    const original = unmappedPrismaError();

    filter.catch(original, host);

    expect(logger.error).toHaveBeenCalledWith(
      { err: loggable(original), code: 'INTERNAL_ERROR' },
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
