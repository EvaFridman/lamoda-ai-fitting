import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';
import { Connection } from '@temporalio/client';
import type { Redis } from 'ioredis';

import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS } from '../redis/redis.module.js';

// How long one dependency may take to answer before it counts as down. Readiness is polled by
// compose and by deploy.sh; a hanging dependency must not hang the check.
const TIMEOUT_MS = 2000;

@Injectable()
export class DependencyChecks implements OnModuleDestroy {
  // The check's own connection, without the gRPC retries of the shared one (TemporalClientModule):
  // one answer within the timeout is the check, and deploy.sh asks up to 10 times, 1 s apart. A
  // retry left
  // scheduled would also fire after the app closes the connection and throw "Channel has been
  // shut down" out of a timer. Otherwise it connects as the shared one does: TLS or an API key added
  // there goes here too, or the check tests another path.
  private readonly temporalConnection: Connection;

  constructor(
    private readonly indicator: HealthIndicatorService,
    private readonly prisma: PrismaService,
    // Named apart from the check methods below: a constructor property `redis` would shadow the
    // method `redis()` on every instance.
    @Inject(REDIS) private readonly redisClient: Redis,
    config: ConfigService<Env, true>,
  ) {
    this.temporalConnection = Connection.lazy({
      address: config.get('TEMPORAL_ADDRESS', { infer: true }),
      interceptors: [],
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.temporalConnection.close();
  }

  postgres(): PromiseLike<HealthIndicatorResult<'postgres'>> {
    return this.indicator
      .check('postgres')
      .attempt(async () => {
        await this.prisma.$queryRaw`SELECT 1`;
      })
      .withTimeout(TIMEOUT_MS);
  }

  redis(): PromiseLike<HealthIndicatorResult<'redis'>> {
    return this.indicator
      .check('redis')
      .attempt(async () => {
        await this.redisClient.ping();
      })
      .withTimeout(TIMEOUT_MS);
  }

  temporal(): PromiseLike<HealthIndicatorResult<'temporal'>> {
    return this.indicator
      .check('temporal')
      .attempt(async () => {
        // The deadline also cancels the gRPC call itself, not only the wait for it.
        await this.temporalConnection.withDeadline(Date.now() + TIMEOUT_MS, () =>
          this.temporalConnection.workflowService.getSystemInfo({}),
        );
      })
      .withTimeout(TIMEOUT_MS);
  }
}
