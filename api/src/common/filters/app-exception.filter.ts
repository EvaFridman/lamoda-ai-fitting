import type { IncomingMessage } from 'node:http';

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

import {
  AppException,
  RequestTimeoutError,
  SessionUnavailableError,
} from '../errors/app.exception.js';
import { findRequestContext } from '../http/request-context.js';
import { toAppException } from './to-app-exception.js';

// How often an outage's 503 of one route goes to Sentry (spec 0014 O60); the others only to the
// log, as a repeat timeout's (spec 0006 F29).
export const OUTAGE_REPORT_INTERVAL_MS = 60_000;

// The one handler of every HTTP error (spec 0004 E18): each answers `{ error: { code, message,
// details } }` with the status of E20. Registered as APP_FILTER in AppModule. WebSocket gateways
// do not pass through it.
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  // When each route's outage last went to Sentry. One key per route template, so the map stays
  // small.
  private readonly lastOutageReported = new Map<string, number>();

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
    // On its own line too: a body the parser refuses (BAD_JSON) fails before pino-http's
    // middleware, so this line is the only one of the request (spec 0006 plan, Risks).
    const request = host.switchToHttp().getRequest<RoutedRequest>();
    const requestId = findRequestContext(request)?.requestId;
    if (
      (exception instanceof RequestTimeoutError || exception instanceof SessionUnavailableError) &&
      !exception.report
    ) {
      // A repeat timeout of a route, or a repeat failed session read, already reported this
      // minute: the log only (spec 0006 F29, 0013 N29).
      this.logger.warn({ code: error.code, status, requestId }, error.message);
    } else if (isOutage(exception, error) && !this.shouldReportOutage(routeOf(request))) {
      // The database or Redis down or too slow (a statement timeout, no free connection), already
      // reported for this route this minute: the log only, so a slow filter sent again and again
      // cannot spend the Sentry quota (O60).
      this.logger.warn({ err: loggable(exception), code: error.code, requestId }, error.message);
    } else if (status >= 500) {
      // The stack and the original error stay in the log; the body says only "internal error".
      this.logger.error({ err: loggable(exception), code: error.code, requestId }, error.message);
      // Only 5xx go to Sentry (spec 0004 E24): a 4xx is the client's mistake, not a bug.
      Sentry.captureException(exception, { tags: { 'error.code': error.code } });
    } else {
      this.logger.warn({ code: error.code, status, requestId }, error.message);
    }
    httpAdapter.reply(response, error.body, status);
  }

  private shouldReportOutage(route: string): boolean {
    const now = Date.now();
    const last = this.lastOutageReported.get(route);
    if (last !== undefined && now - last < OUTAGE_REPORT_INTERVAL_MS) return false;
    this.lastOutageReported.set(route, now);
    return true;
  }
}

// Express puts the matched route on the request; a failure before routing (a middleware) has none.
type RoutedRequest = IncomingMessage & { route?: { path?: unknown } };

// The route's template (`/products/:id`), never the path itself, which would make one key per
// request.
function routeOf(request: RoutedRequest): string {
  const path = request.route?.path;
  return `${request.method ?? ''} ${typeof path === 'string' ? path : '(no route)'}`;
}

// A 503 of a dependency that is down, too slow or busy: toAppException's connection failures and
// the api's own 503s (the facet slots, O62), but not a timeout or a session read, which have
// their own `report`.
function isOutage(exception: unknown, error: AppException): boolean {
  return (
    error.code === 'SERVICE_UNAVAILABLE' &&
    !(exception instanceof RequestTimeoutError) &&
    !(exception instanceof SessionUnavailableError)
  );
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
