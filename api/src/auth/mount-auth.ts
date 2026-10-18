import { ConfigService } from '@nestjs/config';
import { UnknownElementException } from '@nestjs/core/errors/exceptions/unknown-element.exception.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { toNodeHandler } from 'better-auth/node';
import type { Express, NextFunction, Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { pinoHttp } from 'pino-http';

import type { Env } from '../config/env.js';
import { pinoHttpOptions } from '../core/core.module.js';
import { authThrottle, tierLimits } from '../throttling/auth-throttle.js';
import { FallbackThrottlerStorage } from '../throttling/fallback-throttler-storage.js';
import type { Auth } from './auth.js';
import { authErrorHandler } from './auth-error-handler.js';
import { authBody, authTimeout, onlyParsedBodies } from './auth-limits.js';
import { authRoutes } from './auth-routes.js';
import { AUTH } from './auth.module.js';

// Better Auth at /api/auth (spec 0013 plan §3), as an Express route ahead of Nest's: called by
// createHttpApp() before init(). The path keeps `/api/`, which Better Auth matches against its
// baseURL; nginx and web pass it unchanged. Every answer is Better Auth's `{ code, message }`
// (N17), its failures too (authErrorHandler): no Nest guard, interceptor or filter sees them, so
// the rate limit is authThrottle's. An app whose module has no AuthModule (a spec's small module)
// gets no /api/auth.
export async function mountAuth(app: NestExpressApplication): Promise<void> {
  const auth = providedAuth(app);
  if (auth === undefined) return;
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  // Transient: resolved, not got. Resolving it also creates nestjs-pino's root logger.
  const logger = await app.resolve(PinoLogger);
  logger.setContext('BetterAuth');
  const origin = new URL(config.get('WEB_ORIGIN', { infer: true }));
  const express: Express = app.getHttpAdapter().getInstance();
  express.all(
    '/api/auth/*splat',
    // nestjs-pino logs requests from a Nest middleware, which runs only after this route: the
    // same request line here, on the same logger (its redaction and request id included). Without
    // the query: the callback's carries Google's code and the OAuth state.
    pinoHttp({
      ...pinoHttpOptions(config),
      transport: undefined,
      logger: PinoLogger.root,
      serializers: { req: withoutQuery },
    }),
    // A refused route counts too.
    authThrottle(app.get(FallbackThrottlerStorage), tierLimits(config)),
    authRoutes(),
    // The api's body limit and timeout (N28); the timeout starts once the body is read, as
    // TimeoutInterceptor's starts after the parser.
    authBody(config.get('BODY_LIMIT', { infer: true })),
    onlyParsedBodies(),
    authTimeout(config.get('REQUEST_TIMEOUT_MS', { infer: true }), logger),
    siteAddress(origin),
    toNodeHandler(auth),
    authErrorHandler(logger),
  );
}

// toNodeHandler builds the request's address from the client's Host and X-Forwarded-Proto, so a
// value with a path in it (`X-Forwarded-Proto: http://x/api/auth/list-sessions#`) would route
// Better Auth to another path than the one authRoutes and authThrottle checked. nginx sends sane
// values, but the api is reachable without it inside Docker: both come from WEB_ORIGIN instead.
function siteAddress(origin: URL): (req: Request, res: Response, next: NextFunction) => void {
  const proto = origin.protocol.slice(0, -1);
  return (req, _res, next) => {
    req.headers.host = origin.host;
    req.headers['x-forwarded-proto'] = proto;
    next();
  };
}

// pino-http's serialized request (method, url, query, params, headers, ...).
function withoutQuery(req: { url?: string } & Record<string, unknown>): Record<string, unknown> {
  const { query: _query, ...rest } = req;
  return { ...rest, url: req.url?.split('?')[0] };
}

// The Better Auth instance, or undefined in an app whose module has no AuthModule.
export function providedAuth(app: NestExpressApplication): Auth | undefined {
  try {
    return app.get<Auth>(AUTH);
  } catch (error) {
    if (error instanceof UnknownElementException) return undefined;
    throw error;
  }
}
