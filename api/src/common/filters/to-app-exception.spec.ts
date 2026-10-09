import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { describe, expect, it } from 'vitest';

import { Prisma } from '../../generated/prisma/client.js';
import {
  AppException,
  ConflictError,
  InUseError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../errors/app.exception.js';
import { toAppException } from './to-app-exception.js';

function prismaError(code: string, meta: Record<string, unknown> = {}) {
  return new Prisma.PrismaClientKnownRequestError('prisma failed', {
    code,
    clientVersion: '7.10.0',
    meta,
  });
}

function withCause(cause: Record<string, unknown>) {
  return { driverAdapterError: { cause } };
}

function bodyParserError(type: string, status: number): Error {
  return Object.assign(new Error(type), { type, status });
}

describe('toAppException, one case per row of E20', () => {
  it('invalid body or query: 400 VALIDATION_FAILED, details kept', () => {
    const details = [{ field: 'name', code: 'IS_NOT_EMPTY', message: 'name should not be empty' }];
    const result = toAppException(new ValidationError(details));
    expect(result.getStatus()).toBe(400);
    expect(result.body).toEqual({
      error: { code: 'VALIDATION_FAILED', message: 'Validation failed', details },
    });
  });

  it('broken JSON: 400 BAD_JSON', () => {
    const result = toAppException(bodyParserError('entity.parse.failed', 400));
    expect(result.getStatus()).toBe(400);
    expect(result.body.error).toMatchObject({ code: 'BAD_JSON', details: [] });
  });

  it('bad id in the path: 400 INVALID_ID passes through with its details', () => {
    const original = new AppException(HttpStatus.BAD_REQUEST, 'INVALID_ID', 'id must be a UUID', [
      { field: 'id', code: 'INVALID_ID', message: 'id must be a UUID' },
    ]);
    const result = toAppException(original);
    expect(result).toBe(original);
    expect(result.getStatus()).toBe(400);
  });

  it('reference to a missing row (P2003 on create): 400 RELATED_NOT_FOUND with the field', () => {
    const result = toAppException(
      prismaError(
        'P2003',
        withCause({
          originalCode: '23503',
          kind: 'ForeignKeyConstraintViolation',
          constraint: { index: 'products_brand_id_fkey' },
          originalMessage:
            'insert or update on table "products" violates foreign key constraint "products_brand_id_fkey"',
        }),
      ),
    );
    expect(result.getStatus()).toBe(400);
    expect(result.body.error.code).toBe('RELATED_NOT_FOUND');
    expect(result.body.error.details.map((d) => d.field)).toEqual(['brandId']);
    expect(result.body.error.details[0]?.code).toBe('RELATED_NOT_FOUND');
  });

  it('database rule violation (CHECK, P2039): 400 CONSTRAINT_VIOLATION with the field', () => {
    const result = toAppException(
      prismaError(
        'P2039',
        withCause({
          originalCode: '23514',
          kind: 'postgres',
          originalMessage:
            'new row for relation "brands" violates check constraint "brands_name_check"',
        }),
      ),
    );
    expect(result.getStatus()).toBe(400);
    expect(result.body.error.code).toBe('CONSTRAINT_VIOLATION');
    expect(result.body.error.details.map((d) => d.field)).toEqual(['name']);
  });

  it('a too long value (P2000): 400 CONSTRAINT_VIOLATION', () => {
    const result = toAppException(prismaError('P2000'));
    expect(result.getStatus()).toBe(400);
    expect(result.body.error.code).toBe('CONSTRAINT_VIOLATION');
    expect(result.body.error.details).toEqual([]);
  });

  it('no or wrong admin token: 401 UNAUTHORIZED', () => {
    const result = toAppException(new UnauthorizedError());
    expect(result.getStatus()).toBe(401);
    expect(result.body.error.code).toBe('UNAUTHORIZED');
  });

  it('a bare Nest UnauthorizedException: 401 UNAUTHORIZED', () => {
    const result = toAppException(new UnauthorizedException());
    expect(result.getStatus()).toBe(401);
    expect(result.body.error.code).toBe('UNAUTHORIZED');
  });

  it('unknown route (Nest NotFoundException): 404 ROUTE_NOT_FOUND', () => {
    const result = toAppException(new NotFoundException('Cannot GET /nope?token=secret'));
    expect(result.getStatus()).toBe(404);
    expect(result.body.error.code).toBe('ROUTE_NOT_FOUND');
    expect(result.body.error.message).toBe('Route not found');
    expect(result.body.error.message).not.toContain('nope');
    expect(result.body.error.message).not.toContain('secret');
  });

  it('a BadRequestException that mentions a connection is still 400, not 503', () => {
    const result = toAppException(new BadRequestException('Connection terminated'));
    expect(result.getStatus()).toBe(400);
    expect(result.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('missing record (NotFoundError): 404 NOT_FOUND', () => {
    const result = toAppException(new NotFoundError());
    expect(result.getStatus()).toBe(404);
    expect(result.body.error.code).toBe('NOT_FOUND');
  });

  it('missing record (P2025): 404 NOT_FOUND', () => {
    const result = toAppException(
      prismaError('P2025', { modelName: 'Brand', operation: 'an update' }),
    );
    expect(result.getStatus()).toBe(404);
    expect(result.body.error.code).toBe('NOT_FOUND');
  });

  it('duplicate unique value (P2002): 409 ALREADY_EXISTS with the field', () => {
    const result = toAppException(
      prismaError(
        'P2002',
        withCause({
          originalCode: '23505',
          kind: 'UniqueConstraintViolation',
          constraint: { index: 'brands_name_key' },
          table: 'brands',
        }),
      ),
    );
    expect(result.getStatus()).toBe(409);
    expect(result.body.error.code).toBe('ALREADY_EXISTS');
    expect(result.body.error.details.map((d) => d.field)).toEqual(['name']);
  });

  it('ConflictError passes through as 409 ALREADY_EXISTS', () => {
    const result = toAppException(new ConflictError());
    expect(result.getStatus()).toBe(409);
    expect(result.body.error.code).toBe('ALREADY_EXISTS');
  });

  it('record in use (P2003 RESTRICT, 23001): 409 IN_USE', () => {
    const result = toAppException(
      prismaError(
        'P2003',
        withCause({
          originalCode: '23001',
          kind: 'RestrictViolation',
          constraint: { index: 'products_brand_id_fkey' },
        }),
      ),
    );
    expect(result.getStatus()).toBe(409);
    expect(result.body.error.code).toBe('IN_USE');
    expect(result.body.error.details).toEqual([]);
  });

  it('record in use (P2003 NO ACTION, "update or delete on table"): 409 IN_USE', () => {
    const result = toAppException(
      prismaError(
        'P2003',
        withCause({
          originalCode: '23503',
          kind: 'ForeignKeyConstraintViolation',
          originalMessage:
            'update or delete on table "brands" violates foreign key constraint "products_brand_id_fkey" on table "products"',
        }),
      ),
    );
    expect(result.getStatus()).toBe(409);
    expect(result.body.error.code).toBe('IN_USE');
  });

  it('InUseError passes through as 409 IN_USE', () => {
    expect(toAppException(new InUseError()).body.error.code).toBe('IN_USE');
  });

  it('body too large (body-parser): 413 PAYLOAD_TOO_LARGE', () => {
    const result = toAppException(bodyParserError('entity.too.large', 413));
    expect(result.getStatus()).toBe(413);
    expect(result.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('body too large (Nest PayloadTooLargeException): 413 PAYLOAD_TOO_LARGE', () => {
    const result = toAppException(new PayloadTooLargeException());
    expect(result.getStatus()).toBe(413);
    expect(result.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('too many requests (ThrottlerException): 429 TOO_MANY_REQUESTS', () => {
    const result = toAppException(new ThrottlerException());
    expect(result.getStatus()).toBe(429);
    expect(result.body.error.code).toBe('TOO_MANY_REQUESTS');
  });

  it('database unreachable (P1001): 503 SERVICE_UNAVAILABLE', () => {
    const result = toAppException(
      prismaError('P1001', withCause({ kind: 'DatabaseNotReachable' })),
    );
    expect(result.getStatus()).toBe(503);
    expect(result.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('Redis unreachable (MaxRetriesPerRequestError): 503 SERVICE_UNAVAILABLE', () => {
    const error = new Error('Reached the max retries per request limit');
    error.name = 'MaxRetriesPerRequestError';
    const result = toAppException(error);
    expect(result.getStatus()).toBe(503);
    expect(result.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('Redis connection closed: 503 SERVICE_UNAVAILABLE', () => {
    const result = toAppException(new Error('Connection is closed.'));
    expect(result.getStatus()).toBe(503);
    expect(result.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('a refused socket (ECONNREFUSED): 503 SERVICE_UNAVAILABLE', () => {
    const error = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    expect(toAppException(error).body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('a bare Nest ServiceUnavailableException: 503 SERVICE_UNAVAILABLE', () => {
    expect(toAppException(new ServiceUnavailableException()).getStatus()).toBe(503);
  });

  it('anything else: 500 INTERNAL_ERROR without internal details', () => {
    const result = toAppException(new TypeError('secret internal detail at /srv/app'));
    expect(result.getStatus()).toBe(500);
    expect(result.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error', details: [] },
    });
    expect(JSON.stringify(result.body)).not.toContain('secret');
  });

  it('a thrown string or null: 500 INTERNAL_ERROR', () => {
    expect(toAppException('boom').body.error.code).toBe('INTERNAL_ERROR');
    expect(toAppException(null).body.error.code).toBe('INTERNAL_ERROR');
  });

  it('an unknown Prisma error: 500 INTERNAL_ERROR', () => {
    const result = toAppException(prismaError('P2999'));
    expect(result.getStatus()).toBe(500);
    expect(result.body.error.message).toBe('Internal server error');
  });

  it('an unexpected HTTP status such as 403: 500 INTERNAL_ERROR', () => {
    const result = toAppException(new ForbiddenException('nope'));
    expect(result.getStatus()).toBe(500);
    expect(result.body.error.code).toBe('INTERNAL_ERROR');
  });

  it('a bare Nest BadRequestException: 400 VALIDATION_FAILED', () => {
    const result = toAppException(new BadRequestException('bad'));
    expect(result.getStatus()).toBe(400);
    expect(result.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('another body-parser 4xx error: 400 VALIDATION_FAILED', () => {
    const result = toAppException(bodyParserError('encoding.unsupported', 415));
    expect(result.getStatus()).toBe(400);
    expect(result.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('a body-parser zlib error without a type (gzip header on a plain body): 400 VALIDATION_FAILED', () => {
    const error = Object.assign(new Error('incorrect header check'), {
      status: 400,
      statusCode: 400,
      expose: true,
      code: 'Z_DATA_ERROR',
    });
    const result = toAppException(error);
    expect(result.getStatus()).toBe(400);
    expect(result.body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'The body cannot be read',
      details: [],
    });
  });

  it('a number out of range (P2020): 400 CONSTRAINT_VIOLATION', () => {
    const result = toAppException(prismaError('P2020'));
    expect(result.getStatus()).toBe(400);
    expect(result.body.error.code).toBe('CONSTRAINT_VIOLATION');
  });

  it.each(['P2037', 'P1008', 'P1017'])('Prisma %s: 503 SERVICE_UNAVAILABLE', (code) => {
    const result = toAppException(prismaError(code));
    expect(result.getStatus()).toBe(503);
    expect(result.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it.each(['08006', '08001', '57P01', '57P03', '53300'])(
    'Postgres SQLSTATE %s under another Prisma code: 503 SERVICE_UNAVAILABLE',
    (originalCode) => {
      const result = toAppException(
        prismaError('P2010', withCause({ kind: 'postgres', originalCode })),
      );
      expect(result.getStatus()).toBe(503);
      expect(result.body.error.code).toBe('SERVICE_UNAVAILABLE');
    },
  );

  it('Postgres query canceled (57014) is not an outage: 500 INTERNAL_ERROR', () => {
    const result = toAppException(
      prismaError('P2010', withCause({ kind: 'postgres', originalCode: '57014' })),
    );
    expect(result.getStatus()).toBe(500);
    expect(result.body.error.code).toBe('INTERNAL_ERROR');
  });

  it.each(['Connection terminated unexpectedly', 'timeout exceeded when trying to connect'])(
    'a pg error "%s": 503 SERVICE_UNAVAILABLE',
    (message) => {
      const result = toAppException(new Error(message));
      expect(result.getStatus()).toBe(503);
      expect(result.body.error.code).toBe('SERVICE_UNAVAILABLE');
    },
  );

  it('a client that drops its upload (body-parser, ECONNRESET, 400, expose): 400, not 503', () => {
    const error = Object.assign(new Error('request aborted'), {
      status: 400,
      statusCode: 400,
      expose: true,
      code: 'ECONNRESET',
    });
    const result = toAppException(error);
    expect(result.getStatus()).toBe(400);
    expect(result.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('a plain HttpException with a 5xx status does not leak its message', () => {
    const result = toAppException(new HttpException('internal secret', 502));
    expect(result.getStatus()).toBe(500);
    expect(result.body.error.message).toBe('Internal server error');
  });
});
