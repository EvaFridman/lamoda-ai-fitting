import { Inject, Injectable } from '@nestjs/common';
import { type HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';
import { Connection } from '@temporalio/client';
import type { Redis } from 'ioredis';

import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS } from '../redis/redis.module.js';

// How long one dependency may take to answer before it counts as down. Readiness is polled by
// compose and by deploy.sh; a hanging dependency must not hang the check.
const TIMEOUT_MS = 2000;

@Injectable()
export class DependencyChecks {
  constructor(
    private readonly indicator: HealthIndicatorService,
    private readonly prisma: PrismaService,
    // Named apart from the check methods below: a constructor property `redis` would shadow the
    // method `redis()` on every instance.
    @Inject(REDIS) private readonly redisClient: Redis,
    private readonly temporalConnection: Connection,
  ) {}

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
