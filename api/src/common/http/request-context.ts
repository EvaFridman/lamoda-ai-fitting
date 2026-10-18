import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';

import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/nestjs';
import type { NextFunction, Request, Response } from 'express';

import type { Env } from '../../config/env.js';
import { ANONYMOUS, type Principal } from '../auth/principal.js';

export const PROXY_SECRET_HEADER = 'X-Proxy-Secret';
export const REQUEST_ID_HEADER = 'X-Request-Id';

// What the api knows about a request before any route runs (spec 0006 plan §1). pino, Sentry, the
// throttler, the guards and the error filter read it instead of the headers.
export interface RequestContext {
  // The client's address: from X-Forwarded-For only on a trusted request, else the connection's.
  readonly clientAddress: string;
  // From a trusted X-Request-Id (nginx's $request_id), else a new one; answered in X-Request-Id.
  readonly requestId: string;
  readonly principal: Principal;
}

export interface RequestContextOptions {
  // PROXY_SECRET: a request is trusted when its X-Proxy-Secret equals it; empty trusts nothing.
  proxySecret: string;
  // PROXY_SECRET_NEXT: trusted the same way while the secret is rotated (spec 0006 F21); empty or
  // left out trusts nothing more.
  proxySecretNext?: string;
  // Finds the signed-in user of a request by its session cookie (auth/session-reader.ts); left out,
  // every principal is anonymous (an app without AuthModule).
  readSession?: SessionReader;
}

// The user and the session of a request's valid session cookie; undefined without one. A broken or
// expired cookie is undefined, never an error; a failure to read the session (the database) rejects.
export type SessionReader = (
  req: Request,
) => Promise<{ userId: string; sessionId: string } | undefined>;

// nginx's $request_id: 32 hex characters.
const REQUEST_ID = /^[\da-f]{32}$/i;

const contexts = new WeakMap<IncomingMessage, RequestContext>();

// The Express middleware that builds the context. Registered with useRequestContext before Nest
// adds its body parser, so a body it refuses (BAD_JSON, PAYLOAD_TOO_LARGE) still gets a request id.
// The context is set with an anonymous principal at once, then with the user once the session is
// read (spec 0013 plan §4); a failure to read it goes to Nest's error handler (AppExceptionFilter)
// with the request id already set.
export function requestContextMiddleware(
  options: RequestContextOptions,
): (req: Request, res: Response, next: NextFunction) => void {
  const proxySecret = secretDigest(options.proxySecret);
  const proxySecretNext = secretDigest(options.proxySecretNext ?? '');
  const { readSession } = options;

  return (req, res, next) => {
    const sentSecret = req.get(PROXY_SECRET_HEADER);
    const trusted = matches(sentSecret, proxySecret) || matches(sentSecret, proxySecretNext);
    const context: RequestContext = {
      clientAddress:
        (trusted && forwardedAddress(req.get('X-Forwarded-For'))) || socketAddress(req),
      requestId: (trusted && sentRequestId(req.get(REQUEST_ID_HEADER))) || randomUUID(),
      principal: ANONYMOUS,
    };
    contexts.set(req, context);
    res.setHeader(REQUEST_ID_HEADER, context.requestId);
    Sentry.getIsolationScope().setTag('request_id', context.requestId);
    if (readSession === undefined) {
      next();
      return;
    }
    readSession(req).then((user) => {
      if (user !== undefined) {
        contexts.set(req, { ...context, principal: { kind: 'user', ...user } });
        // The id only: no email or name reaches Sentry.
        Sentry.getIsolationScope().setUser({ id: user.userId });
      }
      next();
    }, next);
  };
}

// Registers the middleware on an app that is not initialised yet, with the values from its
// configuration. createHttpApp (http-app.ts) calls it before `init()`.
export function useRequestContext(app: INestApplication, readSession?: SessionReader): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  app.use(
    requestContextMiddleware({
      proxySecret: config.get('PROXY_SECRET', { infer: true }),
      proxySecretNext: config.get('PROXY_SECRET_NEXT', { infer: true }),
      readSession,
    }),
  );
}

// The context of a request. Throws when the middleware did not run: an app set up without it would
// otherwise treat every request as anonymous from one address without anyone noticing.
export function requestContextOf(req: IncomingMessage): RequestContext {
  const context = contexts.get(req);
  if (context === undefined) {
    throw new Error('The request has no context: register useRequestContext before init()');
  }
  return context;
}

// For pino-http's genReqId, which also sees requests of apps without the middleware (unit tests).
export function findRequestContext(req: IncomingMessage): RequestContext | undefined {
  return contexts.get(req);
}

// nginx and web each send exactly one address; anything else is not taken.
function forwardedAddress(header: string | undefined): string | undefined {
  const address = header?.trim();
  return address !== undefined && isIP(address) !== 0 ? address : undefined;
}

function sentRequestId(header: string | undefined): string | undefined {
  return header !== undefined && REQUEST_ID.test(header) ? header : undefined;
}

// Undefined only once the connection is gone; such a request is answered to no one.
function socketAddress(req: Request): string {
  return req.socket.remoteAddress ?? '';
}

// Digests have equal lengths, so timingSafeEqual neither throws nor leaks the secret's length. An
// empty secret has no digest and matches nothing.
function secretDigest(secret: string): Buffer | undefined {
  return secret === '' ? undefined : digest(secret);
}

function matches(sent: string | undefined, expected: Buffer | undefined): boolean {
  if (expected === undefined || sent === undefined || sent === '') return false;
  return timingSafeEqual(digest(sent), expected);
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
