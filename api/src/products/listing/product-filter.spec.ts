import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../prisma/prisma.service.js';
import { ProductListQueryDto } from '../dto/product-list-query.dto.js';
import {
  escapeLike,
  loadValueAttributes,
  toProductFilter,
  toProductWhere,
} from './product-filter.js';

function query(fields: Partial<ProductListQueryDto> = {}): ProductListQueryDto {
  return Object.assign(new ProductListQueryDto(), fields);
}

describe('toProductFilter: attribute groups', () => {
  const valueAttributes = new Map([
    ['v1', 'a1'],
    ['v2', 'a1'],
    ['v3', 'a2'],
  ]);

  it('puts the values of one attribute into one group', () => {
    const filter = toProductFilter(query({ attributeValueId: ['v1', 'v2'] }), valueAttributes);

    expect(filter.attributeGroups).toEqual([{ attributeId: 'a1', valueIds: ['v1', 'v2'] }]);
  });

  it('puts the values of two attributes into two groups', () => {
    const filter = toProductFilter(
      query({ attributeValueId: ['v1', 'v3', 'v2'] }),
      valueAttributes,
    );

    expect(filter.attributeGroups).toEqual([
      { attributeId: 'a1', valueIds: ['v1', 'v2'] },
      { attributeId: 'a2', valueIds: ['v3'] },
    ]);
  });

  it('gives an unknown value id a group of its own with attributeId null', () => {
    const filter = toProductFilter(query({ attributeValueId: ['v1', 'nope'] }), valueAttributes);

    expect(filter.attributeGroups).toEqual([
      { attributeId: 'a1', valueIds: ['v1'] },
      { attributeId: null, valueIds: ['nope'] },
    ]);
  });

  it('gives every unknown value id its own group', () => {
    const filter = toProductFilter(query({ attributeValueId: ['x', 'y'] }), valueAttributes);

    expect(filter.attributeGroups).toEqual([
      { attributeId: null, valueIds: ['x'] },
      { attributeId: null, valueIds: ['y'] },
    ]);
  });

  it('counts a duplicate once', () => {
    const filter = toProductFilter(
      query({ attributeValueId: ['v1', 'v1', 'x', 'x'] }),
      valueAttributes,
    );

    expect(filter.attributeGroups).toEqual([
      { attributeId: 'a1', valueIds: ['v1'] },
      { attributeId: null, valueIds: ['x'] },
    ]);
  });

  it('leaves the groups out without the parameter', () => {
    expect(toProductFilter(query(), valueAttributes).attributeGroups).toBeUndefined();
  });
});

describe('toProductFilter: other filters', () => {
  it('counts duplicates of the array filters once', () => {
    const filter = toProductFilter(
      query({ categoryId: ['c', 'c'], brandId: ['b', 'b', 'd'], size: ['M', 'M'] }),
      new Map(),
    );

    expect(filter).toMatchObject({
      categoryIds: ['c'],
      brandIds: ['b', 'd'],
      sizes: ['M'],
    });
  });

  it('copies the scalar filters', () => {
    const filter = toProductFilter(
      query({ q: 'dress', minPrice: 1, maxPrice: 2, hasDiscount: false }),
      new Map(),
    );

    expect(filter).toMatchObject({ q: 'dress', minPrice: 1, maxPrice: 2, hasDiscount: false });
  });
});

describe('loadValueAttributes', () => {
  it('does not query without values', async () => {
    const findMany = vi.fn();
    const prisma = { attributeValue: { findMany } } as unknown as PrismaService;

    expect((await loadValueAttributes(prisma, undefined)).size).toBe(0);
    expect((await loadValueAttributes(prisma, [])).size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('asks once for the distinct ids and maps value to attribute', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'v1', attributeId: 'a1' }]);
    const prisma = { attributeValue: { findMany } } as unknown as PrismaService;

    const result = await loadValueAttributes(prisma, ['v1', 'v1', 'x']);

    expect(findMany).toHaveBeenCalledOnce();
    expect(findMany).toHaveBeenCalledWith({
      where: { id: { in: ['v1', 'x'] } },
      select: { id: true, attributeId: true },
    });
    expect([...result]).toEqual([['v1', 'a1']]);
  });
});

describe('escapeLike', () => {
  it.each([
    ['dress', 'dress'],
    ['100%', '100\\%'],
    ['a_b', 'a\\_b'],
    ['a\\b', 'a\\\\b'],
    ['%_\\', '\\%\\_\\\\'],
    ['', ''],
  ])('turns %j into %j', (text, expected) => {
    expect(escapeLike(text)).toBe(expected);
  });
});

describe('toProductWhere', () => {
  it('does not filter without filters', () => {
    expect(toProductWhere({})).toEqual({ AND: [] });
  });

  it('filters by categories', () => {
    expect(toProductWhere({ categoryIds: ['c1', 'c2'] })).toEqual({
      AND: [{ categoryId: { in: ['c1', 'c2'] } }],
    });
  });

  it('filters by brands', () => {
    expect(toProductWhere({ brandIds: ['b1'] })).toEqual({ AND: [{ brandId: { in: ['b1'] } }] });
  });

  it('filters by sizes in stock', () => {
    expect(toProductWhere({ sizes: ['M', 'L'] })).toEqual({
      AND: [{ variations: { some: { size: { in: ['M', 'L'] }, stock: { gt: 0 } } } }],
    });
  });

  it('makes one condition per attribute group', () => {
    expect(
      toProductWhere({
        attributeGroups: [
          { attributeId: 'a1', valueIds: ['v1', 'v2'] },
          { attributeId: null, valueIds: ['x'] },
        ],
      }),
    ).toEqual({
      AND: [
        { attributeValues: { some: { attributeValueId: { in: ['v1', 'v2'] } } } },
        { attributeValues: { some: { attributeValueId: { in: ['x'] } } } },
      ],
    });
  });

  it('searches the name case-insensitively with the text escaped', () => {
    expect(toProductWhere({ q: '50%_off' })).toEqual({
      AND: [{ name: { contains: '50\\%\\_off', mode: 'insensitive' } }],
    });
  });

  it('filters by the price range, each bound alone and 0 included', () => {
    expect(toProductWhere({ minPrice: 0 })).toEqual({ AND: [{ price: { gte: 0 } }] });
    expect(toProductWhere({ maxPrice: 100 })).toEqual({ AND: [{ price: { lte: 100 } }] });
    expect(toProductWhere({ minPrice: 10, maxPrice: 20 })).toEqual({
      AND: [{ price: { gte: 10 } }, { price: { lte: 20 } }],
    });
  });

  it('keeps discounted products for hasDiscount true', () => {
    expect(toProductWhere({ hasDiscount: true })).toEqual({ AND: [{ discount: { gt: 0 } }] });
  });

  it('keeps products without a discount for hasDiscount false', () => {
    expect(toProductWhere({ hasDiscount: false })).toEqual({ AND: [{ discount: { equals: 0 } }] });
  });

  it('skips a filter that is undefined', () => {
    expect(
      toProductWhere({ categoryIds: undefined, q: undefined, hasDiscount: undefined }),
    ).toEqual({ AND: [] });
  });
});
