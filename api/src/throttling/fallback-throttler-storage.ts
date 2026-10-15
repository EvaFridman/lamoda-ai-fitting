import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { type ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import type { Redis } from 'ioredis';

import { REDIS } from '../redis/redis.module.js';

// Not exported from the package root; derived from the interface instead.
type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

// After a failed command, how long the counters stay in memory before one request tries Redis
// again (spec 0006 F28). A Redis that holds the connection but does not answer stays 'ready', so
// without it every request would wait for the command timeout on each of its tier's throttlers.
export const REDIS_RETRY_AFTER_MS = 10_000;

// Request counters in Redis, shared by the blue and green copies, so a deploy does not reset
// anyone's limit. While Redis is unreachable, the counters fall back to this process's memory: the
// limit keeps working (traffic goes to one copy at a time, so it stays close to exact) instead of
// either switching off or failing every request. After a failed command Redis is tried again every
// REDIS_RETRY_AFTER_MS, by one request; back to Redis when that call succeeds.
@Injectable()
export class FallbackThrottlerStorage implements ThrottlerStorage, OnApplicationShutdown {
  private readonly logger = new Logger(FallbackThrottlerStorage.name);
  private readonly shared: ThrottlerStorageRedisService;
  private readonly local = new ThrottlerStorageService();
  private usingLocal = false;
  // While usingLocal: when the next request may try Redis.
  private retryAt = 0;

  constructor(@Inject(REDIS) private readonly redis: Redis) {
    // Given an existing client, the Redis storage does not close it on shutdown: RedisModule does.
    this.shared = new ThrottlerStorageRedisService(redis);
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    // While the client is not connected, go straight to memory: a command would first wait for
    // ioredis's reconnect attempts, adding that delay to every request during an outage.
    if (this.redis.status !== 'ready') {
      return this.fallBack('not connected', key, ttl, limit, blockDuration, throttlerName);
    }
    const probing = this.usingLocal;
    if (probing) {
      if (Date.now() < this.retryAt) {
        return this.local.increment(key, ttl, limit, blockDuration, throttlerName);
      }
      // This request tries Redis; the ones that arrive while it waits stay in memory.
      this.retryAt = Date.now() + REDIS_RETRY_AFTER_MS;
    }
    try {
      const record = await this.shared.increment(key, ttl, limit, blockDuration, throttlerName);
      // Only the probe ends the fallback: a late answer to a call sent before the failure says
      // nothing about Redis now, and would let every request wait for the timeout again.
      if (probing && this.usingLocal) {
        this.usingLocal = false;
        this.logger.log('Redis is back: request counters are shared again');
      }
      return record;
    } catch (error) {
      this.retryAt = Date.now() + REDIS_RETRY_AFTER_MS;
      return this.fallBack(String(error), key, ttl, limit, blockDuration, throttlerName);
    }
  }

  private fallBack(
    reason: string,
    ...args: Parameters<ThrottlerStorage['increment']>
  ): Promise<ThrottlerStorageRecord> {
    // Logged once per outage, not once per request.
    if (!this.usingLocal) {
      this.usingLocal = true;
      this.logger.warn(`Redis unavailable (${reason}): request counters kept in memory`);
    }
    return this.local.increment(...args);
  }

  onApplicationShutdown(): void {
    // The memory storage holds timers; without this, a stopping process could wait for them.
    this.local.onApplicationShutdown();
  }
}
