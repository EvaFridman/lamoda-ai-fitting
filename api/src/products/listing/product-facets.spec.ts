import type { ConfigService } from '@nestjs/config';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Env } from '../../config/env.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { FacetQuerySlots } from './facet-slots.js';
import { countFacets } from './product-facets.js';

function slotsOfSize1(): FacetQuerySlots {
  const values: Record<string, number> = {
    DATABASE_POOL_MAX: 2,
    DATABASE_CONNECTION_TIMEOUT_MS: 1000,
  };
  return new FacetQuerySlots({ get: (name: string) => values[name] } as unknown as ConfigService<
    Env,
    true
  >);
}

describe('countFacets', () => {
  const unhandled = vi.fn();

  beforeAll(() => {
    process.on('unhandledRejection', unhandled);
  });

  afterAll(() => {
    process.off('unhandledRejection', unhandled);
  });

  afterEach(() => {
    unhandled.mockClear();
  });

  it('drops the queries still waiting for a slot when the first one fails, and rejects with its error', async () => {
    const first = new Error('first query failed');
    const queryRaw = vi
      .fn()
      .mockRejectedValueOnce(first)
      .mockResolvedValue([{ count: 0 }]);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;

    await expect(countFacets(prisma, {}, slotsOfSize1())).rejects.toBe(first);

    // The abort comes before the failing query's slot is released: none of the six waiting runs.
    expect(queryRaw).toHaveBeenCalledTimes(1);
    // Let a rejection nobody handled reach the process.
    await new Promise((resolve) => setImmediate(resolve));
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('runs all 7 queries when none fails', async () => {
    const row = {
      count: 0,
      min: null,
      max: null,
      attributeId: 'a',
      attributeName: 'A',
      id: 'v',
      value: 'x',
      colorHex: null,
    };
    const queryRaw = vi.fn().mockResolvedValue([row]);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;

    await countFacets(prisma, {}, slotsOfSize1());

    expect(queryRaw).toHaveBeenCalledTimes(7);
  });

  // The sizes query joins the size list `s` to the variations again: a list with one row per
  // in-stock variation instead of one per size squares that join (50 000 products never finished).
  describe('the size list of the sizes count', () => {
    async function sizeListOf(filter: { sizes?: string[] }): Promise<string> {
      const sent: string[] = [];
      const queryRaw = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
        const { sql } = Prisma.sql(strings, ...values);
        sent.push(sql);
        const rows = sql.includes('FROM attribute_values')
          ? []
          : [{ count: 0, min: null, max: null }];
        return Promise.resolve(rows);
      });
      const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;

      await countFacets(prisma, filter, slotsOfSize1());

      const sizes = sent.filter((sql) => sql.includes(') s (size)'));
      expect(sizes).toHaveLength(1);
      const match = /FROM \((.*)\) s \(size\)/s.exec(sizes[0] ?? '');
      expect(match).not.toBeNull();
      return (match?.[1] ?? '').replaceAll(/\s+/g, ' ');
    }

    it('yields each size once when no size is chosen', async () => {
      const list = await sizeListOf({});

      expect(list).toMatch(/SELECT DISTINCT size FROM product_variations WHERE stock > 0/);
    });

    it('yields each size once when sizes are chosen', async () => {
      const list = await sizeListOf({ sizes: ['M', 'XL'] });

      expect(list).toMatch(/UNION VALUES/);
      expect(list).not.toMatch(/UNION ALL/);
    });
  });
});
