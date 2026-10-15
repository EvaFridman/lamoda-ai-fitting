import { Global, Inject, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

import type { Env } from '../config/env.js';

// Injection token of the shared client: `@Inject(REDIS) private readonly redis: Redis`.
export const REDIS = Symbol('REDIS');

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): Redis => {
        const logger = new Logger('Redis');
        // ioredis reconnects by itself; the api starts even while Redis is down, and
        // /health/ready reports it.
        const client = new Redis(config.get('REDIS_URL', { infer: true }), {
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
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
