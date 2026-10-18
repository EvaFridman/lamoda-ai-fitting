import { createHash } from 'node:crypto';

import type { ConfigService } from '@nestjs/config';
import { normalizeIp, type ThrottlerStorage } from '@nestjs/throttler';
import type { NextFunction, Request, Response } from 'express';

import { AppException } from '../common/errors/app.exception.js';
import { requestContextOf } from '../common/http/request-context.js';
import type { Env } from '../config/env.js';
import { LIMITS } from './throttling.module.js';
import { type Tier, throttlerName, type Window, WINDOWS } from './tiered-throttler.guard.js';

export type TierLimits = Record<Tier, Record<Window, number>>;

// Longest window first, as TieredThrottlerGuard checks them (spec 0006 F23).
const ORDER: readonly Window[] = ['minute', 'burst'];
const SIGN_IN = '/api/auth/sign-in/';

export function tierLimits(config: ConfigService<Env, true>): TierLimits {
  const limitsOf = (tier: Tier): Record<Window, number> => ({
    burst: config.get(LIMITS[tier].burst, { infer: true }),
    minute: config.get(LIMITS[tier].minute, { infer: true }),
  });
  return { read: limitsOf('read'), write: limitsOf('write'), expensive: limitsOf('expensive') };
}

// The rate limit of Better Auth's routes (spec 0013 plan §5). They are Express routes ahead of
// Nest's, so TieredThrottlerGuard never sees them; this counts them in the same tiers, storage and
// client address: GET and HEAD in `read`, a POST that starts a sign-in in `expensive`, any other
// request in `write`. One counter per tier for all of /api/auth, not per path: the paths are the
// client's to choose, and a counter per path would let it pick a fresh one for every request. Over
// the limit it answers 429 in the api's format with Retry-After, like the guard.
export function authThrottle(
  storage: Pick<ThrottlerStorage, 'increment'>,
  limits: TierLimits,
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async (req, res, next) => {
    const tier = tierOf(req);
    const tracker = normalizeIp(requestContextOf(req).clientAddress);
    for (const window of ORDER) {
      const name = throttlerName(tier, window);
      const key = createHash('sha256').update(`auth-${name}-${tracker}`).digest('hex');
      const ttl = WINDOWS[window];
      const { isBlocked, timeToBlockExpire } = await storage.increment(
        key,
        ttl,
        limits[tier][window],
        ttl,
        name,
      );
      if (isBlocked) {
        const refused = new AppException('TOO_MANY_REQUESTS', 'Too many requests, try again later');
        res.setHeader('Retry-After', String(timeToBlockExpire));
        res.status(refused.getStatus()).json(refused.body);
        return;
      }
    }
    next();
  };
}

function tierOf(req: Request): Tier {
  if (req.method === 'GET' || req.method === 'HEAD') return 'read';
  return req.method === 'POST' && routedPath(req).startsWith(SIGN_IN) ? 'expensive' : 'write';
}

// The path as Better Auth routes it: it parses the address with WHATWG URL, which resolves `..`
// and `%2e%2e`, so `/api/auth/x/../sign-in/social` starts a sign-in too; nginx passes such a path
// as sent. Lower-cased, as Express matches paths without regard to case.
function routedPath(req: Request): string {
  return new URL(req.originalUrl, 'http://localhost').pathname.toLowerCase();
}
