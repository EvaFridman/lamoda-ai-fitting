import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import * as Sentry from '@sentry/nestjs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { toAppException } from './to-app-exception.js';

// The one handler of every HTTP error (spec 0004 E18): each answers `{ error: { code, message,
// details } }` with the status of E20. Registered as APP_FILTER in AppModule. WebSocket gateways
// do not pass through it.
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly adapterHost: HttpAdapterHost,
    @InjectPinoLogger(AppExceptionFilter.name) private readonly logger: PinoLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost;
    const response: unknown = host.switchToHttp().getResponse();

    // /health/ready keeps terminus's own body: compose and deploy.sh read it (spec 0004 E22).
    if (isHealthCheckFailure(exception)) {
      // Only deploy.sh reads /health/ready, so a failed check is a rare and useful report.
      Sentry.captureException(exception);
      httpAdapter.reply(response, exception.getResponse(), exception.getStatus());
      return;
    }

    const error = toAppException(exception);
    const status = error.getStatus();
    if (status >= 500) {
      // The stack and the original error stay in the log; the body says only "internal error".
      this.logger.error({ err: loggable(exception), code: error.code }, error.message);
      // Only 5xx go to Sentry (spec 0004 E24): a 4xx is the client's mistake, not a bug.
      Sentry.captureException(exception, { tags: { 'error.code': error.code } });
    } else {
      this.logger.warn({ code: error.code, status }, error.message);
    }
    httpAdapter.reply(response, error.body, status);
  }
}

// What of an error goes to the log. Errors carry data in their fields (Prisma's `meta` holds a row,
// `Failing row contains (...)`; ioredis's `command` its arguments; an HTTP client's its request),
// and Prisma's message and stack can hold a whole call with its arguments: personal data, which
// never goes to the log. So only chosen fields are kept, also for the errors in `cause` and in an
// AggregateError, and for Prisma's errors the codes and stack frames without the message.
export function loggable(exception: unknown, seen = new Set<Error>()): unknown {
  if (!(exception instanceof Error)) return exception;
  if (seen.has(exception)) return '[Circular]';
  seen.add(exception);

  const { code, meta, cause } = exception as { code?: unknown; meta?: unknown; cause?: unknown };
  const entry: Record<string, unknown> = { type: exception.name, code };
  if (exception.name.startsWith('PrismaClient')) {
    const adapterCause = (
      meta as { driverAdapterError?: { cause?: { kind?: unknown; originalCode?: unknown } } }
    )?.driverAdapterError?.cause;
    entry.kind = adapterCause?.kind;
    entry.sqlState = adapterCause?.originalCode;
    entry.stack = stackFrames(exception);
  } else {
    entry.message = exception.message;
    entry.stack = exception.stack;
  }
  if (cause !== undefined) entry.cause = loggable(cause, seen);
  if (exception instanceof AggregateError) {
    entry.errors = (exception.errors as unknown[]).map((error) => loggable(error, seen));
  }
  return entry;
}

// The stack without its first lines, which repeat the message.
function stackFrames(error: Error): string {
  const frames = (error.stack ?? '')
    .split('\n')
    .filter((line) => line.trimStart().startsWith('at '));
  return [error.name, ...frames].join('\n');
}

// terminus answers a failed check with a ServiceUnavailableException carrying its result.
function isHealthCheckFailure(exception: unknown): exception is HttpException {
  if (!(exception instanceof HttpException)) return false;
  if (exception.getStatus() !== HttpStatus.SERVICE_UNAVAILABLE) return false;
  const body = exception.getResponse();
  return (
    typeof body === 'object' && 'status' in body && body.status === 'error' && 'details' in body
  );
}
