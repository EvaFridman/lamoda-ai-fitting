import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { REDIS, REDIS_CACHE, RedisModule } from './redis.module.js';

const created = vi.hoisted(() => [] as { url: string; options: Record<string, unknown> }[]);

// The real client would try to connect; only the options the module gives it matter here.
vi.mock('ioredis', () => ({
  Redis: class {
    constructor(url: string, options: Record<string, unknown>) {
      created.push({ url, options });
    }
    on = vi.fn();
    quit = vi.fn().mockResolvedValue('OK');
  },
}));

type FakeClient = { quit: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn> };

describe('RedisModule', () => {
  afterEach(() => {
    created.length = 0;
  });

  async function boot() {
    return Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              REDIS_URL: 'redis://redis.test:6379',
              REDIS_CACHE_URL: 'redis://redis-cache.test:6379',
            }),
          ],
        }),
        RedisModule,
      ],
    }).compile();
  }

  it('creates the counters client from REDIS_URL and the caches client from REDIS_CACHE_URL', async () => {
    const moduleRef = await boot();

    expect(moduleRef.get(REDIS)).toBeDefined();
    expect(moduleRef.get(REDIS_CACHE)).toBeDefined();
    expect(created.map((client) => client.url).sort()).toEqual([
      'redis://redis-cache.test:6379',
      'redis://redis.test:6379',
    ]);
    await moduleRef.close();
  });

  it('gives both a 1 s command timeout and 3 retries per request (F28)', async () => {
    const moduleRef = await boot();

    expect(created).toHaveLength(2);
    for (const client of created) {
      expect(client.options).toMatchObject({ commandTimeout: 1000, maxRetriesPerRequest: 3 });
    }
    await moduleRef.close();
  });

  it('makes REDIS and REDIS_CACHE two distinct clients', async () => {
    const moduleRef = await boot();

    expect(moduleRef.get(REDIS)).not.toBe(moduleRef.get(REDIS_CACHE));
    await moduleRef.close();
  });

  it('listens for connection errors on both, so none is an unhandled event', async () => {
    const moduleRef = await boot();

    for (const token of [REDIS, REDIS_CACHE]) {
      expect(moduleRef.get<FakeClient>(token).on).toHaveBeenCalledWith(
        'error',
        expect.any(Function),
      );
    }
    await moduleRef.close();
  });

  it('quits both clients when the module is destroyed', async () => {
    const moduleRef = await boot();
    const counters = moduleRef.get<FakeClient>(REDIS);
    const caches = moduleRef.get<FakeClient>(REDIS_CACHE);

    await moduleRef.close();

    expect(counters.quit).toHaveBeenCalledTimes(1);
    expect(caches.quit).toHaveBeenCalledTimes(1);
  });
});
