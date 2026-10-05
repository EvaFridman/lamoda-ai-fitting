import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import type { Env } from '../config/env.js';
import { FallbackThrottlerStorage } from './fallback-throttler-storage.js';

// Provided by its own module so ThrottlerModule.forRootAsync can inject it, and Nest runs its
// shutdown hook.
@Module({
  providers: [FallbackThrottlerStorage],
  exports: [FallbackThrottlerStorage],
})
class ThrottlerStorageModule {}

// A request limit per client IP for every HTTP route (opt out with @SkipThrottle()); over it, 429.
// The client IP is right behind nginx thanks to `trust proxy` in main.ts.
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
      }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class ThrottlingModule {}
