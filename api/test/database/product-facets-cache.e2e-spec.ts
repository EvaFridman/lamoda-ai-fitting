import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { REDIS } from '../../src/redis/redis.module.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

// Redis in memory: what the filter-count cache uses (status, get, set) and what the modules call
// when the app starts and stops.
function fakeRedis() {
  const store = new Map<string, string>();
  return {
    status: 'ready',
    store,
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: vi.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    on: vi.fn(),
    quit: vi.fn(() => Promise.resolve('OK')),
  };
}

async function arrange(testApp: TestApp): Promise<string> {
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

describe('GET /products/facets: the cache', () => {
  const redis = fakeRedis();
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({
      override: (builder) => builder.overrideProvider(REDIS).useValue(redis),
    });
  });

  afterAll(async () => {
    await testApp.close();
  });

  const get = (query: string) =>
    request(testApp.app.getHttpServer()).get(`/products/facets?${query}`);

  it('answers a repeated request from Redis, without reaching the database', async () => {
    const token = await arrange(testApp);
    const sets = redis.set.mock.calls.length;
    const first = await get(`q=${token}`);
    expect(first.status).toBe(200);
    expect((first.body as { total: number }).total).toBe(1);
    await vi.waitFor(() => expect(redis.set.mock.calls.length).toBeGreaterThan(sets));
    const queryRaw = vi.spyOn(testApp.prisma, '$queryRaw');
    const findValues = vi.spyOn(testApp.prisma.attributeValue, 'findMany');

    const second = await get(`q=${token}`);

    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(queryRaw).not.toHaveBeenCalled();
    expect(findValues).not.toHaveBeenCalled();
    queryRaw.mockRestore();
    findValues.mockRestore();
  });

  it('shares the answer between the same filters written differently', async () => {
    const token = await arrange(testApp);
    const brand = randomUUID();
    const sets = redis.set.mock.calls.length;
    const first = await get(`q=${token}&brandId=${brand}`);
    await vi.waitFor(() => expect(redis.set.mock.calls.length).toBeGreaterThan(sets));
    const queryRaw = vi.spyOn(testApp.prisma, '$queryRaw');

    const second = await get(`q=${token}&brandId=${brand.toUpperCase()},${brand}`);

    expect(second.body).toEqual(first.body);
    expect(queryRaw).not.toHaveBeenCalled();
    queryRaw.mockRestore();
  });

  it('reaches the database for a different filter', async () => {
    const token = await arrange(testApp);
    const sets = redis.set.mock.calls.length;
    const first = await get(`q=${token}`);
    expect(first.status).toBe(200);
    await vi.waitFor(() => expect(redis.set.mock.calls.length).toBeGreaterThan(sets));
    const queryRaw = vi.spyOn(testApp.prisma, '$queryRaw');

    const other = await get(`q=${token}&minPrice=500`);

    expect(other.status).toBe(200);
    expect((other.body as { total: number }).total).toBe(0);
    expect(queryRaw).toHaveBeenCalled();
    queryRaw.mockRestore();
  });

  it('computes again when Redis holds a corrupt value', async () => {
    const token = await arrange(testApp);
    const sets = redis.set.mock.calls.length;
    const first = await get(`q=${token}`);
    await vi.waitFor(() => expect(redis.set.mock.calls.length).toBeGreaterThan(sets));
    const [key] = redis.set.mock.calls.at(-1) ?? [];
    redis.store.set(String(key), '{broken');

    const second = await get(`q=${token}`);

    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
  });
});

describe('GET /products/facets: Redis ready but failing', () => {
  const failingRedis = () => ({
    ...fakeRedis(),
    get: vi.fn(() => Promise.reject(new Error('Command timed out'))),
    set: vi.fn(() => Promise.reject(new Error('Command timed out'))),
  });

  it('answers 200 with the counts and does not ask Redis again within the back-off', async () => {
    const redis = failingRedis();
    const testApp = await createTestApp({
      override: (builder) => builder.overrideProvider(REDIS).useValue(redis),
    });
    try {
      const token = await arrange(testApp);
      const http = () => request(testApp.app.getHttpServer());

      const first = await http().get(`/products/facets?q=${token}`);
      await vi.waitFor(() => expect(redis.set).toHaveBeenCalled());
      const second = await http().get(`/products/facets?q=${token}`);

      expect(first.status).toBe(200);
      expect((first.body as { total: number }).total).toBe(1);
      expect(second.status).toBe(200);
      expect(second.body).toEqual(first.body);
      expect(redis.get).toHaveBeenCalledTimes(1);
    } finally {
      await testApp.close();
    }
  });

  it('answers 200 when only the write fails', async () => {
    const redis = { ...fakeRedis(), set: failingRedis().set };
    const testApp = await createTestApp({
      override: (builder) => builder.overrideProvider(REDIS).useValue(redis),
    });
    try {
      const token = await arrange(testApp);

      const response = await request(testApp.app.getHttpServer()).get(
        `/products/facets?q=${token}`,
      );
      await vi.waitFor(() => expect(redis.set).toHaveBeenCalled());

      expect(response.status).toBe(200);
      expect((response.body as { total: number }).total).toBe(1);
    } finally {
      await testApp.close();
    }
  });
});

describe('GET /products/facets: Redis client not connected', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('still answers 200 with the counts', async () => {
    const token = await arrange(testApp);
    const http = () => request(testApp.app.getHttpServer());

    const first = await http().get(`/products/facets?q=${token}`);
    const second = await http().get(`/products/facets?q=${token}`);

    expect(first.status).toBe(200);
    expect((first.body as { total: number }).total).toBe(1);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
  });
});
