import type { IncomingMessage } from 'node:http';

import * as Sentry from '@sentry/nestjs';
import bodyParser from 'body-parser';
import type { NextFunction, Request, Response } from 'express';

import { TIMEOUT_REPORT_INTERVAL_MS } from '../common/http/timeout.interceptor.js';
import { findRequestContext } from '../common/http/request-context.js';
import type { AuthLogger } from './auth.js';

// The api's body limit and request timeout on /api/auth too (N28). Better Auth is an Express route
// ahead of Nest, so neither the JSON parser of createHttpApp() nor TimeoutInterceptor reaches it;
// these are their copies there, answering in Better Auth's `{ code, message }` (N17).

// Better Auth reads JSON bodies only: parsed here with BODY_LIMIT, it takes the parsed body. Every
// type with `json` in it counts, since Better Auth takes any type that contains
// `application/json` (`application/json5` too) and would read such a body itself, with no limit.
// An error goes to authErrorHandler, which answers it with clientBodyError.
export function authBody(limit: number): ReturnType<typeof bodyParser.json> {
  return bodyParser.json({ limit, type: isJsonBody });
}

// The media type (before any `;`) has `json` in it.
function isJsonBody(req: IncomingMessage): boolean {
  return /^[^;]*json/i.test(req.headers['content-type'] ?? '');
}

export const AUTH_UNSUPPORTED_BODY = {
  code: 'UNSUPPORTED_MEDIA_TYPE',
  message: 'Only JSON bodies are accepted',
} as const;

// After authBody: a body of another type, which authBody leaves unread, answers 415 before Better
// Auth, which would otherwise read it whole (it takes forms on the callback). GET and HEAD bodies
// are never read.
export function onlyParsedBodies(): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    const hasBody =
      req.headers['transfer-encoding'] !== undefined ||
      Number(req.headers['content-length'] ?? 0) > 0;
    if (req.method === 'GET' || req.method === 'HEAD' || !hasBody || isJsonBody(req)) {
      next();
      return;
    }
    res.status(415).json(AUTH_UNSUPPORTED_BODY);
  };
}

export interface AuthErrorAnswer {
  status: number;
  body: { code: string; message: string };
}

// body-parser's refusal of a body (http-errors with a `type`, or a 4xx marked `expose`), as
// Better Auth would answer it; anything else is not the client's and stays a 500.
export function clientBodyError(error: unknown): AuthErrorAnswer | undefined {
  if (!(error instanceof Error)) return undefined;
  const { type, status, expose } = error as { type?: unknown; status?: unknown; expose?: unknown };
  if (type === 'entity.too.large') {
    return { status: 413, body: { code: 'PAYLOAD_TOO_LARGE', message: 'The body is too large' } };
  }
  if (type === 'entity.parse.failed') {
    // Better Auth's own words for a body it cannot parse.
    return { status: 400, body: { code: 'BAD_REQUEST', message: 'Invalid JSON in request body' } };
  }
  // An unsupported charset or content encoding.
  if (status === 415) return { status: 415, body: AUTH_UNSUPPORTED_BODY };
  const clientError = typeof status === 'number' && status >= 400 && status < 500;
  if (clientError && (typeof type === 'string' || expose === true)) {
    return { status: 400, body: { code: 'BAD_REQUEST', message: 'The body cannot be read' } };
  }
  return undefined;
}

// What res.locals carries once the request has timed out; authErrorHandler logs the late end.
export const TIMED_OUT = 'authTimedOut';
export interface TimedOut {
  started: number;
}

// A request Better Auth has not answered within `ms` answers 503 SERVICE_UNAVAILABLE, as
// TimeoutInterceptor does elsewhere (spec 0006 F11, F29): its work is not cancelled, its late end
// is logged (authErrorHandler: writing to the answered response fails), and only the first timeout
// within a minute goes to Sentry.
export function authTimeout(
  ms: number,
  logger: AuthLogger,
): (req: Request, res: Response, next: NextFunction) => void {
  let lastReported: number | undefined;
  return (req, res, next) => {
    const started = Date.now();
    const timer = setTimeout(() => {
      if (res.headersSent) return;
      const timedOut: TimedOut = { started };
      res.locals[TIMED_OUT] = timedOut;
      const requestId = findRequestContext(req)?.requestId;
      const message = `The request took longer than ${ms} ms`;
      logger.warn({ requestId, path: req.path }, message);
      const now = Date.now();
      if (lastReported === undefined || now - lastReported >= TIMEOUT_REPORT_INTERVAL_MS) {
        lastReported = now;
        Sentry.captureMessage(`/api/auth: ${message}`, {
          level: 'warning',
          tags: { 'error.code': 'SERVICE_UNAVAILABLE' },
        });
      }
      res.status(503).json({ code: 'SERVICE_UNAVAILABLE', message });
    }, ms);
    res.on('close', () => clearTimeout(timer));
    next();
  };
}
