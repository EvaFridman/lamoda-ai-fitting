import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { emptyCatalogPrisma } from '../support/empty-catalog.js';
import { startTestRedis, type TestRedis, usedMemory } from '../support/redis.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 90_000 });

const MB = 1024 * 1024;
const FILLER_VALUE = 'x'.repeat(10 * 1024);

// Spec 0018 AC7: the counters' Redis has its own memory limit and never evicts a counter; once
// full, the api's limits keep working as with Redis down (spec 0006 F28).
describe('the rate limit with a full counters Redis (noeviction)', () => {
  let redis: TestRedis;
  let app: INestApplication;

  beforeAll(async () => {
    redis = await startTestRedis('noeviction');
    // ConfigModule validates the process environment when the module is imported.
    vi.resetModules();
    vi.stubEnv('REDIS_URL', redis.url);
    const { AppModule } = await import('../../src/app.module.js');
    const { createHttpApp } = await import('../../src/common/http/http-app.js');
    const { REDIS } = await import('../../src/redis/redis.module.js');
    const { PrismaService } = await import('../../src/prisma/prisma.service.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(emptyCatalogPrisma())
      .compile();
    app = await createHttpApp(
      (adapter, options) =>
        moduleRef.createNestApplication<NestExpressApplication>(adapter, options),
      { logger: false },
    );
    await app.init();
    const counters = app.get<Redis>(REDIS);
    await vi.waitFor(() => expect(counters.status).toBe('ready'));
  });

  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      vi.unstubAllEnvs();
      await redis?.stop();
    }
  });

  const statuses = async (path: string, times: number): Promise<number[]> => {
    const result: number[] = [];
    for (let i = 0; i < times; i += 1) {
      result.push((await request(app.getHttpServer()).get(path)).status);
    }
    return result;
  };

  it('counts in Redis while it has room, then keeps the limit on the fallback once it is full', async () => {
    // Before it is full the counters land in Redis, so what follows proves the fallback and not
    // a Redis that was never reached.
    expect(await statuses('/categories', 2)).toEqual([200, 200]);
    const allKeys = await redis.client.keys('*');
    expect(allKeys.length).toBeGreaterThan(0);
    // Only the minute windows: the 1-second burst counters may expire before the final check.
    const counterKeys: string[] = [];
    for (const key of allKeys) {
      if ((await redis.client.pttl(key)) > 10_000) counterKeys.push(key);
    }
    expect(counterKeys.length).toBeGreaterThan(0);

    await redis.limitMemory(MB);
    const fillerKeys: string[] = [];
    let refused = false;
    for (let i = 0; i < 400 && !refused; i += 1) {
      const key = `filler:${i}`;
      try {
        await redis.client.set(key, FILLER_VALUE);
        fillerKeys.push(key);
      } catch (error) {
        expect(String(error)).toMatch(/OOM/);
        refused = true;
      }
    }
    expect(refused).toBe(true);
    // Expiring burst keys could free memory below the limit: pin the limit under what is used.
    await redis.client.config(
      'SET',
      'maxmemory',
      String((await usedMemory(redis.client)) - 256 * 1024),
    );
    await expect(redis.client.set('probe', FILLER_VALUE)).rejects.toThrow(/OOM/);

    // A route not counted yet: its counter cannot be written to Redis any more.
    expect(await statuses('/users', 6)).toEqual([401, 401, 401, 401, 401, 429]);

    // Nothing was evicted: every filler key and every counter written before is still there.
    expect(await redis.client.exists(...fillerKeys)).toBe(fillerKeys.length);
    expect(await redis.client.exists(...counterKeys)).toBe(counterKeys.length);
    const stats = await redis.client.info('stats');
    expect(Number(/^evicted_keys:(\d+)/m.exec(stats)?.[1])).toBe(0);
  });
});
