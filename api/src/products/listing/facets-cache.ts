import { createHash } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';

import type { Env } from '../../config/env.js';
import { REDIS_CACHE } from '../../redis/redis.module.js';
import type { ProductFacetsDto } from '../dto/product-facets-response.dto.js';
import type { ProductFilterQueryDto } from '../dto/product-filter-query.dto.js';

// After a failed command, how long the cache stays off before one request tries Redis again (spec
// 0014 O56, as the throttler's F28): a Redis that holds the connection but does not answer would
// otherwise add the command timeout to every facets request.
export const FACETS_CACHE_RETRY_AFTER_MS = 10_000;

// A failure is logged at most this often (plan §2.6).
const WARN_INTERVAL_MS = 60_000;

// The filter counts in the caches' Redis (spec 0018 V4) for FACETS_CACHE_TTL_SECONDS (spec 0014 plan
// §2.6, O18). Once full it evicts the least recently used keys, so a flood of filters evicts other
// cache entries, never a rate-limit counter. Redis failing is a miss: the counts are computed and
// answered, never an error. No invalidation: catalog writes
// are @Closed() and the seed runs before the switch, so a row changed by hand shows within the TTL.
@Injectable()
export class ProductFacetsCache {
  private readonly logger = new Logger(ProductFacetsCache.name);
  private readonly ttlSeconds: number;
  private failing = false;
  // While failing: when the next request may try Redis.
  private retryAt = 0;
  private warnedAt = -Infinity;

  constructor(
    @Inject(REDIS_CACHE) private readonly redis: Redis,
    config: ConfigService<Env, true>,
  ) {
    this.ttlSeconds = config.get('FACETS_CACHE_TTL_SECONDS', { infer: true });
  }

  async get(
    query: ProductFilterQueryDto,
    compute: () => Promise<ProductFacetsDto>,
  ): Promise<ProductFacetsDto> {
    if (!this.usable()) {
      return compute();
    }
    const key = facetsCacheKey(query);
    const cached = await this.read(key);
    if (cached !== undefined) {
      return cached;
    }
    const facets = await compute();
    // Not awaited: the answer does not wait for Redis.
    void this.write(key, facets);
    return facets;
  }

  private usable(): boolean {
    // While the client is not connected, a command would first wait for ioredis's reconnects.
    if (this.redis.status !== 'ready') {
      return false;
    }
    if (this.failing) {
      if (Date.now() < this.retryAt) {
        return false;
      }
      // This request tries Redis; the ones that arrive while it waits compute without it.
      this.retryAt = Date.now() + FACETS_CACHE_RETRY_AFTER_MS;
    }
    return true;
  }

  private async read(key: string): Promise<ProductFacetsDto | undefined> {
    let value: string | null;
    try {
      value = await this.redis.get(key);
    } catch (error) {
      this.fail(error);
      return undefined;
    }
    this.failing = false;
    if (value === null) {
      return undefined;
    }
    try {
      return JSON.parse(value) as ProductFacetsDto;
    } catch {
      return undefined;
    }
  }

  private async write(key: string, facets: ProductFacetsDto): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(facets), 'EX', this.ttlSeconds);
    } catch (error) {
      this.fail(error);
    }
  }

  private fail(error: unknown): void {
    this.failing = true;
    this.retryAt = Date.now() + FACETS_CACHE_RETRY_AFTER_MS;
    if (Date.now() - this.warnedAt >= WARN_INTERVAL_MS) {
      this.warnedAt = Date.now();
      // The error only: the key would carry the search.
      this.logger.warn(
        `Redis unavailable, filter counts computed without the cache: ${String(error)}`,
      );
    }
  }
}

// `facets:v1:<sha256 of the normalized filter>`: the same filters in any order or letter case of an
// id share a key. `q` goes in as sent (O58): it alone makes the search's words and the article test
// (`lower(q)` in the database, whose lower case differs from JavaScript's for "Σ" or "İ"), so two
// `q` never share an answer they would not compute alike. Every field of the query is named here, so a new filter fails typecheck until it is. Both
// copies of a blue-green deploy share the caches' Redis: `v1` goes up with any change to the answer's shape or
// to how the counts are made (countFacets, toProductSql, searchSql).
export function facetsCacheKey(query: ProductFilterQueryDto): string {
  const normalized = {
    categoryId: sortedIds(query.categoryId),
    brandId: sortedIds(query.brandId),
    size: sorted(query.size),
    attributeValueId: sortedIds(query.attributeValueId),
    q: query.q ?? null,
    minPrice: query.minPrice ?? null,
    maxPrice: query.maxPrice ?? null,
    hasDiscount: query.hasDiscount ?? null,
  } satisfies Record<keyof ProductFilterQueryDto, unknown>;
  const hash = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  return `facets:v1:${hash}`;
}

function sortedIds(values: string[] | undefined): string[] | null {
  return sorted(values?.map((value) => value.toLowerCase()));
}

function sorted(values: string[] | undefined): string[] | null {
  return values === undefined ? null : [...new Set(values)].sort();
}
