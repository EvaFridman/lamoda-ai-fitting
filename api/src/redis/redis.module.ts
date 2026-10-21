import { Global, Inject, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

import type { Env } from '../config/env.js';

// Injection token of the counters' client (`redis`, `noeviction`): the throttler and /health/ready.
// `@Inject(REDIS) private readonly redis: Redis`.
export const REDIS = Symbol('REDIS');
// Injection token of the caches' client (`redis-cache`, `allkeys-lru`, spec 0018 V4): the filter
// counts. Readiness never checks it: without it the caches are skipped (V5).
export const REDIS_CACHE = Symbol('REDIS_CACHE');

function createClient(url: string, name: string): Redis {
  const logger = new Logger(name);
  // ioredis reconnects by itself; the api starts even while Redis is down, and /health/ready
  // reports the counters' one.
  const client = new Redis(url, {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    // A Redis that accepts the connection but does not answer would hold a request in the
    // throttler guard, before the request timeout starts, until nginx answered 504. A command
    // fails after 1 s instead and the throttler counts in memory (spec 0006 F28). Blocking
    // commands (BLPOP, XREAD BLOCK) and pub/sub need a client of their own without it.
    commandTimeout: 1000,
  });
  // Without a listener, a connection error would be an unhandled 'error' event.
  client.on('error', (error: Error) => logger.warn(`connection error: ${error.message}`));
  return client;
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): Redis =>
        createClient(config.get('REDIS_URL', { infer: true }), 'Redis'),
    },
    {
      provide: REDIS_CACHE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): Redis =>
        createClient(config.get('REDIS_CACHE_URL', { infer: true }), 'RedisCache'),
    },
  ],
  exports: [REDIS, REDIS_CACHE],
})
export class RedisModule implements OnModuleDestroy {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(REDIS_CACHE) private readonly redisCache: Redis,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.redis.quit(), this.redisCache.quit()]);
  }
}
