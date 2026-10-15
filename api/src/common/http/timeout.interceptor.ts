import type { IncomingMessage } from 'node:http';

import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

import { RequestTimeoutError } from '../errors/app.exception.js';
import { toAppException } from '../filters/to-app-exception.js';
import { findRequestContext } from './request-context.js';

// How often a timeout of one route goes to Sentry (spec 0006 F29); the others only to the log.
export const TIMEOUT_REPORT_INTERVAL_MS = 60_000;

// A request whose handler has not answered within `ms` answers 503 SERVICE_UNAVAILABLE (spec 0006
// F11). The handler's work is not cancelled (Prisma has no cancellation): only the client is
// answered. The handler is still listened to, and how it ended is logged as a warning with the
// request id, since nothing else would show it (F29). HTTP only: socket handlers pass through.
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TimeoutInterceptor.name);
  // When each route's timeout last went to Sentry. One key per handler, so the map stays small.
  private readonly lastReported = new Map<string, number>();

  constructor(private readonly ms: number) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const route = `${context.getClass().name}.${context.getHandler().name}`;
    const requestId = findRequestContext(
      context.switchToHttp().getRequest<IncomingMessage>(),
    )?.requestId;

    return new Observable((subscriber) => {
      const started = Date.now();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        subscriber.error(new RequestTimeoutError(this.ms, this.shouldReport(route)));
      }, this.ms);
      // Registered before the handler is called: a handler that throws at once still clears it.
      subscriber.add(() => clearTimeout(timer));

      // The timer runs until the handler completes or fails, not until its first value: Nest
      // answers with the last value, so one that emits and never completes would answer nothing.
      const subscription = next.handle().subscribe({
        next: (value) => {
          if (!timedOut) subscriber.next(value);
        },
        error: (error: unknown) => {
          clearTimeout(timer);
          if (timedOut) this.logLate(route, requestId, started, error);
          else subscriber.error(error);
        },
        complete: () => {
          clearTimeout(timer);
          if (timedOut) this.logLate(route, requestId, started);
          else subscriber.complete();
        },
      });

      return () => {
        // After the timeout the handler is listened to until it ends, to log how it did.
        if (!timedOut) subscription.unsubscribe();
      };
    });
  }

  private shouldReport(route: string): boolean {
    const now = Date.now();
    const last = this.lastReported.get(route);
    if (last !== undefined && now - last < TIMEOUT_REPORT_INTERVAL_MS) return false;
    this.lastReported.set(route, now);
    return true;
  }

  // Only the class name, the code and the api's own message of a failure: the error itself can
  // carry request data (AppExceptionFilter's `loggable`); the name tells a TypeError from a Prisma
  // error where the api's code says only INTERNAL_ERROR.
  private logLate(route: string, requestId: string | undefined, started: number, error?: unknown) {
    const failure = error === undefined ? undefined : toAppException(error);
    this.logger.warn({
      msg: 'A handler that timed out has ended',
      route,
      requestId,
      durationMs: Date.now() - started,
      outcome: failure ? 'failed' : 'succeeded',
      errorType: error instanceof Error ? error.name : undefined,
      code: failure?.code,
      errorMessage: failure?.message,
    });
  }
}
