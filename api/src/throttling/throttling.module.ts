import type { IncomingMessage } from 'node:http';

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizeIp, ThrottlerModule } from '@nestjs/throttler';

import { requestContextOf } from '../common/http/request-context.js';
import type { Env } from '../config/env.js';
import { FallbackThrottlerStorage } from './fallback-throttler-storage.js';
import { type Tier, TIERS, throttlerName, type Window, WINDOWS } from './tiered-throttler.guard.js';

// Provided by its own module so ThrottlerModule.forRootAsync can inject it, and Nest runs its
// shutdown hook.
@Module({
  providers: [FallbackThrottlerStorage],
  exports: [FallbackThrottlerStorage],
})
class ThrottlerStorageModule {}

// The env variable with each tier's limit for each window.
const LIMITS: Record<Tier, Record<Window, Extract<keyof Env, `THROTTLE_${string}`>>> = {
  read: { burst: 'THROTTLE_READ_BURST', minute: 'THROTTLE_READ_MINUTE' },
  write: { burst: 'THROTTLE_WRITE_BURST', minute: 'THROTTLE_WRITE_MINUTE' },
  expensive: { burst: 'THROTTLE_EXPENSIVE_BURST', minute: 'THROTTLE_EXPENSIVE_MINUTE' },
};

// A request limit per client address and route for every HTTP route (opt out with
// @SkipThrottle()); over it, 429. Six named throttlers, a burst and a minute window per quota tier;
// TieredThrottlerGuard counts a request only in its route's tier (spec 0006 F6). The address is the
// request context's (F13): X-Forwarded-For counts only on a request that carries the proxy secret.
// IPv6 addresses count per /64, the throttler's default. The guard itself is registered in
// AppModule, next to the access guard it must run before.
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ThrottlerStorageModule],
      inject: [ConfigService, FallbackThrottlerStorage],
      useFactory: (config: ConfigService<Env, true>, storage: FallbackThrottlerStorage) => ({
        throttlers: TIERS.flatMap((tier) =>
          (Object.keys(WINDOWS) as Window[]).map((window) => ({
            name: throttlerName(tier, window),
            ttl: WINDOWS[window],
            limit: config.get(LIMITS[tier][window], { infer: true }),
          })),
        ),
        storage,
        getTracker: (req) => normalizeIp(requestContextOf(req as IncomingMessage).clientAddress),
      }),
    }),
  ],
})
export class ThrottlingModule {}
