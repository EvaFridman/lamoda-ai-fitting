import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { REDIS_CACHE } from '../../redis/redis.module.js';
import type { ProductFacetsDto } from '../dto/product-facets-response.dto.js';
import type { ProductFilterQueryDto } from '../dto/product-filter-query.dto.js';
import { FACETS_CACHE_RETRY_AFTER_MS, facetsCacheKey, ProductFacetsCache } from './facets-cache.js';

const A = '0a1b2c3d-0000-4000-8000-00000000000a';
const B = '0a1b2c3d-0000-4000-8000-00000000000b';

function filter(partial: Partial<ProductFilterQueryDto>): ProductFilterQueryDto {
  return partial as ProductFilterQueryDto;
}

describe('facetsCacheKey', () => {
  it('is `facets:v1:` and 64 hex characters', () => {
    expect(facetsCacheKey(filter({}))).toMatch(/^facets:v1:[0-9a-f]{64}$/);
  });

  it('is the same for arrays in another order, with duplicates and ids in upper case', () => {
    const base = facetsCacheKey(filter({ brandId: [A, B], attributeValueId: [A, B] }));

    expect(facetsCacheKey(filter({ brandId: [B, A], attributeValueId: [B, A] }))).toBe(base);
    expect(facetsCacheKey(filter({ brandId: [A, B, A], attributeValueId: [A, B, B] }))).toBe(base);
    expect(
      facetsCacheKey(
        filter({ brandId: [A.toUpperCase(), B], attributeValueId: [A, B.toUpperCase()] }),
      ),
    ).toBe(base);
  });

  it('treats sizes case-sensitively', () => {
    expect(facetsCacheKey(filter({ size: ['M'] }))).not.toBe(
      facetsCacheKey(filter({ size: ['m'] })),
    );
    expect(facetsCacheKey(filter({ size: ['S', 'M'] }))).toBe(
      facetsCacheKey(filter({ size: ['M', 'S', 'M'] })),
    );
  });

  it('keeps "AB-12" and "ab 12" apart, for the article test compares the whole q', () => {
    expect(facetsCacheKey(filter({ q: 'AB-12' }))).not.toBe(facetsCacheKey(filter({ q: 'ab 12' })));
  });

  it('keeps q as sent: letter case gives another key (O58)', () => {
    expect(facetsCacheKey(filter({ q: 'Платье' }))).not.toBe(
      facetsCacheKey(filter({ q: 'платье' })),
    );
    // JavaScript lower-cases both to "ας"; the database's lower() gives "ασ" and "ας".
    expect(facetsCacheKey(filter({ q: 'ΑΣ' }))).not.toBe(facetsCacheKey(filter({ q: 'ας' })));
  });

  it('gives the same q the same key', () => {
    expect(facetsCacheKey(filter({ q: 'Платье' }))).toBe(facetsCacheKey(filter({ q: 'Платье' })));
  });

  it('tells a missing q from other filters, and the filters from each other', () => {
    const keys = [
      filter({}),
      filter({ q: 'dress' }),
      filter({ minPrice: 100 }),
      filter({ maxPrice: 100 }),
      filter({ minPrice: 100, maxPrice: 100 }),
      filter({ hasDiscount: true }),
      filter({ hasDiscount: false }),
      filter({ categoryId: [A] }),
      filter({ brandId: [A] }),
      filter({ attributeValueId: [A] }),
    ].map(facetsCacheKey);

    expect(new Set(keys).size).toBe(keys.length);
  });
});

interface FakeRedis {
  status: string;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
}

const facets = { total: 3 } as unknown as ProductFacetsDto;
const query = filter({ brandId: [A] });

async function build(redis: FakeRedis, ttl = 90): Promise<ProductFacetsCache> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      ProductFacetsCache,
      { provide: REDIS_CACHE, useValue: redis },
      { provide: ConfigService, useValue: { get: () => ttl } },
    ],
  }).compile();
  return moduleRef.get(ProductFacetsCache);
}

describe('ProductFacetsCache', () => {
  let redis: FakeRedis;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    redis = {
      status: 'ready',
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
    };
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('answers a hit with the cached JSON and does not compute', async () => {
    redis.get.mockResolvedValue(JSON.stringify(facets));
    const compute = vi.fn();
    const cache = await build(redis);

    const result = await cache.get(query, compute);

    expect(result).toEqual(facets);
    expect(redis.get).toHaveBeenCalledWith(facetsCacheKey(query));
    expect(compute).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('computes on a miss and stores the JSON for the configured TTL', async () => {
    const compute = vi.fn().mockResolvedValue(facets);
    const cache = await build(redis, 90);

    const result = await cache.get(query, compute);

    expect(result).toBe(facets);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(facetsCacheKey(query), JSON.stringify(facets), 'EX', 90);
  });

  it('does not wait for the write', async () => {
    redis.set.mockReturnValue(new Promise(() => undefined));
    const cache = await build(redis);

    await expect(cache.get(query, () => Promise.resolve(facets))).resolves.toBe(facets);
  });

  it('computes without asking Redis while the client is not ready', async () => {
    redis.status = 'reconnecting';
    const compute = vi.fn().mockResolvedValue(facets);
    const cache = await build(redis);

    await expect(cache.get(query, compute)).resolves.toBe(facets);

    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('treats a corrupt cached value as a miss', async () => {
    redis.get.mockResolvedValue('{not json');
    const compute = vi.fn().mockResolvedValue(facets);
    const cache = await build(redis);

    await expect(cache.get(query, compute)).resolves.toBe(facets);

    expect(compute).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledTimes(1);
  });

  describe('when Redis fails', () => {
    it('answers the computed counts and leaves Redis alone for 10 s, then probes it', async () => {
      redis.get.mockRejectedValue(new Error('timeout'));
      const compute = vi.fn().mockResolvedValue(facets);
      const cache = await build(redis);

      await expect(cache.get(query, compute)).resolves.toBe(facets);
      expect(redis.get).toHaveBeenCalledTimes(1);

      await expect(cache.get(query, compute)).resolves.toBe(facets);
      await vi.advanceTimersByTimeAsync(FACETS_CACHE_RETRY_AFTER_MS - 1);
      await expect(cache.get(query, compute)).resolves.toBe(facets);
      expect(redis.get).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      await expect(cache.get(query, compute)).resolves.toBe(facets);
      expect(redis.get).toHaveBeenCalledTimes(2);
      expect(compute).toHaveBeenCalledTimes(4);
    });

    it('lets one request probe while the others compute without Redis', async () => {
      redis.get.mockRejectedValueOnce(new Error('timeout'));
      const cache = await build(redis);
      await cache.get(query, () => Promise.resolve(facets));
      await vi.advanceTimersByTimeAsync(FACETS_CACHE_RETRY_AFTER_MS);
      let answerProbe: (value: string | null) => void = () => undefined;
      redis.get.mockReturnValueOnce(new Promise((resolve) => (answerProbe = resolve)));
      redis.get.mockClear();

      const probe = cache.get(query, () => Promise.resolve(facets));
      const others = await Promise.all([
        cache.get(query, () => Promise.resolve(facets)),
        cache.get(query, () => Promise.resolve(facets)),
      ]);
      answerProbe(null);
      await probe;

      expect(others).toEqual([facets, facets]);
      expect(redis.get).toHaveBeenCalledTimes(1);
    });

    it('resumes caching after a probe succeeds', async () => {
      redis.get.mockRejectedValueOnce(new Error('timeout'));
      const cache = await build(redis);
      await cache.get(query, () => Promise.resolve(facets));
      await vi.advanceTimersByTimeAsync(FACETS_CACHE_RETRY_AFTER_MS);
      await cache.get(query, () => Promise.resolve(facets));
      redis.get.mockClear();

      await cache.get(query, () => Promise.resolve(facets));
      await cache.get(query, () => Promise.resolve(facets));

      expect(redis.get).toHaveBeenCalledTimes(2);
    });

    it('starts the back-off when the write fails', async () => {
      redis.set.mockRejectedValue(new Error('timeout'));
      const cache = await build(redis);

      await expect(cache.get(query, () => Promise.resolve(facets))).resolves.toBe(facets);
      await vi.advanceTimersByTimeAsync(0);
      redis.get.mockClear();
      await expect(cache.get(query, () => Promise.resolve(facets))).resolves.toBe(facets);

      expect(redis.get).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(FACETS_CACHE_RETRY_AFTER_MS);
      await cache.get(query, () => Promise.resolve(facets));
      expect(redis.get).toHaveBeenCalledTimes(1);
    });

    it('logs a warning at most once per 60 s, without the key', async () => {
      redis.get.mockRejectedValue(new Error('timeout'));
      const cache = await build(redis);

      for (let i = 0; i < 5; i += 1) {
        await cache.get(query, () => Promise.resolve(facets));
        await vi.advanceTimersByTimeAsync(FACETS_CACHE_RETRY_AFTER_MS);
      }
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).not.toContain('facets:v1:');

      await vi.advanceTimersByTimeAsync(60_000);
      await cache.get(query, () => Promise.resolve(facets));
      expect(warn).toHaveBeenCalledTimes(2);
    });
  });
});
