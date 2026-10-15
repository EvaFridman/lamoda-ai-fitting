import type { IncomingMessage } from 'node:http';

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizeIp, ThrottlerModule } from '@nestjs/throttler';

import { requestContextOf } from '../common/http/request-context.js';
import type { Env } from '../config/env.js';
import { FallbackThrottlerStorage } from './fallback-throttler-storage.js';

// Provided by its own module so ThrottlerModule.forRootAsync can inject it, and Nest runs its
// shutdown hook.
@Module({
  providers: [FallbackThrottlerStorage],
  exports: [FallbackThrottlerStorage],
})
class ThrottlerStorageModule {}

// A request limit per client address for every HTTP route (opt out with @SkipThrottle()); over it,
// 429. The address is the request context's (spec 0006 F13): X-Forwarded-For counts only on a
// request that carries the proxy secret. IPv6 addresses count per /64, the throttler's default.
// The guard itself is registered in AppModule, next to the access guard it must run before.
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ThrottlerStorageModule],
      inject: [ConfigService, FallbackThrottlerStorage],
      useFactory: (config: ConfigService<Env, true>, storage: FallbackThrottlerStorage) => ({
        throttlers: [
          {
            ttl: config.get('THROTTLE_TTL_MS', { infer: true }),
            limit: config.get('THROTTLE_LIMIT', { infer: true }),
          },
        ],
        storage,
        getTracker: (req) => normalizeIp(requestContextOf(req as IncomingMessage).clientAddress),
      }),
    }),
  ],
})
export class ThrottlingModule {}
