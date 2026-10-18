import * as Sentry from '@sentry/nestjs';
import type { NextFunction, Request, Response } from 'express';

import { loggable } from '../common/filters/app-exception.filter.js';
import { findRequestContext } from '../common/http/request-context.js';
import type { AuthLogger } from './auth.js';
import { clientBodyError, TIMED_OUT, type TimedOut } from './auth-limits.js';

// What /api/auth answers when Better Auth fails on something that is not its own error (a database
// error): the same `{ code, message }` as its own errors, so every answer of /api/auth has one
// format (N17). Better Auth throws such errors on (`onAPIError.throw`) instead of printing them
// whole with console.error, session token and user data included. Like AppExceptionFilter for a
// 5xx: logged without the row (loggable) and reported to Sentry. A body the parser refused
// (authBody) is the client's: 413 or 400, logged as a warning, not reported.
export const AUTH_INTERNAL_ERROR = {
  code: 'INTERNAL_SERVER_ERROR',
  message: 'Internal server error',
} as const;

export function authErrorHandler(
  logger: AuthLogger,
): (error: unknown, req: Request, res: Response, next: NextFunction) => void {
  return (error, req, res, _next) => {
    const requestId = findRequestContext(req)?.requestId;
    // Answered 503 already (authTimeout): writing Better Auth's answer to it failed. Only the end
    // is logged, as TimeoutInterceptor does.
    const timedOut = res.locals[TIMED_OUT] as TimedOut | undefined;
    if (timedOut !== undefined) {
      logger.warn(
        {
          requestId,
          durationMs: Date.now() - timedOut.started,
          errorType: error instanceof Error ? error.name : undefined,
        },
        'A /api/auth request that timed out has ended',
      );
      return;
    }
    const refused = clientBodyError(error);
    if (refused !== undefined && !res.headersSent) {
      logger.warn({ requestId, code: refused.body.code }, refused.body.message);
      res.status(refused.status).json(refused.body);
      return;
    }
    logger.error({ err: loggable(error), requestId }, AUTH_INTERNAL_ERROR.message);
    // Once the response has started there is nothing to answer with: the connection is closed.
    // Not Express's own handler, which prints the whole error with console.error.
    if (res.headersSent) {
      res.destroy();
      return;
    }
    Sentry.captureException(error, { tags: { 'error.code': AUTH_INTERNAL_ERROR.code } });
    res.status(500).json(AUTH_INTERNAL_ERROR);
  };
}
