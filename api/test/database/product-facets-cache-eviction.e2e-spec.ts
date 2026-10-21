import { randomUUID } from 'node:crypto';

import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { REDIS_CACHE } from '../../src/redis/redis.module.js';
import { startTestRedis, type TestRedis, usedMemory } from '../support/redis.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 90_000 });

const MB = 1024 * 1024;
const FILLER_VALUE = 'x'.repeat(10 * 1024);

// Spec 0018 AC6: the caches' Redis has a memory limit; once it is full the oldest entries are
// evicted and writes go on. The filter counts are stored there.
describe('the caches Redis (allkeys-lru) with the filter counts', () => {
  let redis: TestRedis;
  let cacheClient: Redis;
  let testApp: TestApp;

  beforeAll(async () => {
    redis = await startTestRedis('allkeys-lru');
    // Redis' LRU is approximate; a bigger sample makes the oldest key's eviction near certain.
    await redis.client.config('SET', 'maxmemory-samples', '20');
    cacheClient = new Redis(redis.url, { maxRetriesPerRequest: 3, commandTimeout: 1000 });
    await vi.waitFor(() => expect(cacheClient.status).toBe('ready'));
    testApp = await createTestApp({
      override: (builder) => builder.overrideProvider(REDIS_CACHE).useValue(cacheClient),
    });
  });

  afterAll(async () => {
    try {
      await testApp?.close();
    } finally {
      cacheClient?.disconnect();
      await redis?.stop();
    }
  });

  async function arrange(): Promise<string> {
    const token = `tk${randomUUID().replaceAll('-', '')}`;
    const { prisma } = testApp;
    const brand = await prisma.brand.create({ data: { name: `Brand ${token}` } });
    const category = await prisma.category.create({
      data: { name: `Category ${token}`, slug: randomUUID(), isActive: true },
    });
    await prisma.product.create({
      data: {
        article: `ART-${randomUUID()}`,
        name: `${token} dress`,
        price: 100,
        brandId: brand.id,
        categoryId: category.id,
        variations: { create: [{ size: 'M', stock: 1 }] },
      },
    });
    return token;
  }

  const facets = (token: string) =>
    request(testApp.app.getHttpServer()).get(`/products/facets?q=${token}`);

  async function facetKeys(): Promise<string[]> {
    return redis.client.keys('facets:v1:*');
  }

  it('stores the counts, evicts the oldest entries when full and keeps answering and writing', async () => {
    const first = await arrange();
    expect((await facets(first)).status).toBe(200);
    await vi.waitFor(async () => expect(await facetKeys()).toHaveLength(1));
    const [oldestKey] = await facetKeys();
    // Redis' LRU clock ticks once a second: without this the key ties with the first fillers.
    // OBJECT IDLETIME does not touch the key's LRU.
    await vi.waitFor(
      async () =>
        expect(
          await redis.client.object('IDLETIME', oldestKey ?? 'missing'),
        ).toBeGreaterThanOrEqual(2),
      { timeout: 5000 },
    );

    const limit = await redis.limitMemory(MB);
    // Five times what fits: every write must succeed, the old ones go.
    const fillerCount = Math.ceil((5 * MB) / FILLER_VALUE.length);
    for (let i = 0; i < fillerCount; i += 1) {
      await expect(redis.client.set(`filler:${i}`, FILLER_VALUE)).resolves.toBe('OK');
    }

    expect(await redis.client.exists(oldestKey ?? 'missing')).toBe(0);
    const stats = await redis.client.info('stats');
    expect(Number(/^evicted_keys:(\d+)/m.exec(stats)?.[1])).toBeGreaterThan(0);
    expect(await usedMemory(redis.client)).toBeLessThanOrEqual(limit + MB / 2);

    // The api still answers 200, writes the new counts and then answers a repeat from the cache.
    const second = await arrange();
    const answered = await facets(second);
    expect(answered.status).toBe(200);
    expect((answered.body as { total: number }).total).toBe(1);
    await vi.waitFor(async () => expect(await facetKeys()).not.toContain(oldestKey));
    await vi.waitFor(async () => expect((await facetKeys()).length).toBeGreaterThan(0));
    const queryRaw = vi.spyOn(testApp.prisma, '$queryRaw');

    const repeated = await facets(second);

    expect(repeated.body).toEqual(answered.body);
    expect(queryRaw).not.toHaveBeenCalled();
    queryRaw.mockRestore();
  });
});
