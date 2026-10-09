import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';

import { Prisma } from '../../generated/prisma/client.js';
import {
  AppException,
  ConflictError,
  type ErrorDetail,
  InUseError,
  NotFoundError,
  UnauthorizedError,
} from '../errors/app.exception.js';
import type { ErrorCode } from '../errors/error-codes.js';
import { constraintFields } from '../errors/constraint-fields.js';

// Maps anything thrown while handling a request to the error the api answers (spec 0004 E20).
// The order matters: our own errors first, then the database, then body-parser's (a client that
// drops its upload has a socket code too, and is not an outage), then connection failures, then
// Nest's errors; whatever is left is a 500 with a generic message.
export function toAppException(exception: unknown): AppException {
  if (exception instanceof AppException) return exception;
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = fromDatabase(exception);
    if (mapped !== undefined) return mapped;
  }
  const bodyError = fromBodyParser(exception);
  if (bodyError !== undefined) return bodyError;
  if (isConnectionFailure(exception)) return serviceUnavailable();
  if (exception instanceof HttpException) return fromHttpException(exception);
  return internalError();
}

// Where the pg driver adapter puts Postgres's own error (Prisma 7.10, pinned by spec 0002 T3 in
// api/test/support/violation.ts): unique, foreign key and RESTRICT errors name the constraint in
// `constraint.index`; a CHECK has no `constraint` field and is named only in the message.
interface DriverAdapterCause {
  kind?: string;
  originalCode?: string;
  originalMessage?: string;
  constraint?: { index?: string };
}

function adapterCause(error: Prisma.PrismaClientKnownRequestError): DriverAdapterCause {
  const meta = error.meta as { driverAdapterError?: { cause?: DriverAdapterCause } } | undefined;
  return meta?.driverAdapterError?.cause ?? {};
}

function constraintName(cause: DriverAdapterCause): string | undefined {
  return cause.constraint?.index ?? /constraint "([^"]+)"/.exec(cause.originalMessage ?? '')?.[1];
}

function fieldDetails(cause: DriverAdapterCause, code: ErrorCode, message: string): ErrorDetail[] {
  return constraintFields(constraintName(cause)).map((field) => ({ field, code, message }));
}

function fromDatabase(error: Prisma.PrismaClientKnownRequestError): AppException | undefined {
  const cause = adapterCause(error);
  switch (error.code) {
    case 'P2025':
      return new NotFoundError();
    case 'P2002':
      return new ConflictError(
        'A record with these values already exists',
        fieldDetails(cause, 'ALREADY_EXISTS', 'This value is already taken'),
      );
    case 'P2003':
      // Deleting (or re-keying) a row others refer to; ON DELETE RESTRICT reports 23001, NO
      // ACTION reports 23503 with Postgres's "update or delete on table" message.
      if (
        cause.kind === 'RestrictViolation' ||
        cause.originalMessage?.startsWith('update or delete on table') === true
      ) {
        return new InUseError();
      }
      return new AppException(
        HttpStatus.BAD_REQUEST,
        'RELATED_NOT_FOUND',
        'A referenced record does not exist',
        fieldDetails(cause, 'RELATED_NOT_FOUND', 'No record with this id'),
      );
  }
  // A CHECK (23514) has no Prisma code of its own (P2039 in 7.10), a too long value is P2000, a
  // missing required value P2011 and a number out of range P2020: all are database rules the api's
  // validation should have caught.
  if (cause.originalCode === '23514' || DATA_RULE_CODES.has(error.code)) {
    return new AppException(
      HttpStatus.BAD_REQUEST,
      'CONSTRAINT_VIOLATION',
      'The data breaks a database rule',
      fieldDetails(cause, 'CONSTRAINT_VIOLATION', 'This value breaks a database rule'),
    );
  }
  return undefined;
}

const DATA_RULE_CODES = new Set(['P2000', 'P2011', 'P2020']);

// Postgres (through Prisma's pg adapter) or Redis (ioredis) cannot be reached, or Postgres is
// restarting or out of connections: try again later, not a bug.
const PRISMA_CONNECTION_CODES = new Set(['P1001', 'P1008', 'P1017', 'P2037']);
// Postgres SQLSTATE: class 08 is a connection exception; 57P01–57P03 are a shutdown or a start
// in progress; 53300 is too many connections.
const POSTGRES_UNAVAILABLE = /^(08|57P0[1-3]$|53300$)/;
const SOCKET_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
  'EHOSTUNREACH',
]);
const CONNECTION_MESSAGES = [
  // ioredis: the connection was closed under a command.
  'Connection is closed.',
  // pg, passed through by the adapter as is: the server dropped the connection, or the pool
  // could not open one in time.
  'Connection terminated',
  'timeout exceeded when trying to connect',
];

function isConnectionFailure(exception: unknown): boolean {
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    if (PRISMA_CONNECTION_CODES.has(exception.code)) return true;
    const sqlState = adapterCause(exception).originalCode;
    if (sqlState !== undefined && POSTGRES_UNAVAILABLE.test(sqlState)) return true;
  }
  // An HttpException's message can hold request input; it never means an outage.
  if (!(exception instanceof Error) || exception instanceof HttpException) return false;
  const code = (exception as { code?: unknown }).code;
  return (
    // ioredis: retries for a command ran out.
    exception.name === 'MaxRetriesPerRequestError' ||
    // `includes`: Prisma may wrap pg's error in a message of its own.
    CONNECTION_MESSAGES.some((text) => exception.message.includes(text)) ||
    (typeof code === 'string' && SOCKET_ERROR_CODES.has(code))
  );
}

// body-parser's errors reach the filter unchanged (AppExpressAdapter). They are http-errors: most
// carry a `type`; a body that fails to decompress (a gzip header on a plain body) carries only a
// 4xx `status` and `expose: true`, the mark http-errors puts on errors caused by the client.
function fromBodyParser(exception: unknown): AppException | undefined {
  if (!(exception instanceof Error)) return undefined;
  const { type, status, expose } = exception as {
    type?: unknown;
    status?: unknown;
    expose?: unknown;
  };
  switch (type) {
    case 'entity.parse.failed':
      return new AppException(HttpStatus.BAD_REQUEST, 'BAD_JSON', 'The body is not valid JSON');
    case 'entity.too.large':
      return payloadTooLarge();
  }
  const clientError = typeof status === 'number' && status >= 400 && status < 500;
  if (clientError && (typeof type === 'string' || expose === true)) {
    return new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'The body cannot be read');
  }
  return undefined;
}

function fromHttpException(exception: HttpException): AppException {
  if (exception instanceof ThrottlerException) {
    return new AppException(
      HttpStatus.TOO_MANY_REQUESTS,
      'TOO_MANY_REQUESTS',
      'Too many requests, try again later',
    );
  }
  // Our code throws NotFoundError; a bare NotFoundException comes from Nest's router.
  if (exception instanceof NotFoundException) {
    // Not Nest's "Cannot GET /path?query": the url (with any token in its query) is not echoed.
    return new AppException(HttpStatus.NOT_FOUND, 'ROUTE_NOT_FOUND', 'Route not found');
  }
  switch (exception.getStatus()) {
    case HttpStatus.BAD_REQUEST:
      return new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', exception.message);
    case HttpStatus.UNAUTHORIZED:
      return new UnauthorizedError();
    case HttpStatus.PAYLOAD_TOO_LARGE:
      return payloadTooLarge();
    case HttpStatus.SERVICE_UNAVAILABLE:
      return serviceUnavailable();
  }
  return internalError();
}

function payloadTooLarge(): AppException {
  return new AppException(
    HttpStatus.PAYLOAD_TOO_LARGE,
    'PAYLOAD_TOO_LARGE',
    'The body is too large',
  );
}

function serviceUnavailable(): AppException {
  return new AppException(
    HttpStatus.SERVICE_UNAVAILABLE,
    'SERVICE_UNAVAILABLE',
    'A service the api depends on is unavailable, try again later',
  );
}

// The real error goes to the log only: a 500 carries no internal details (spec 0004 AC13).
function internalError(): AppException {
  return new AppException(
    HttpStatus.INTERNAL_SERVER_ERROR,
    'INTERNAL_ERROR',
    'Internal server error',
  );
}
