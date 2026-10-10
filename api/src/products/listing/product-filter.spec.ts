import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../prisma/prisma.service.js';
import { ProductListQueryDto } from '../dto/product-list-query.dto.js';
import {
  attributeGroupSql,
  escapeLike,
  joinOrNull,
  loadValueAttributes,
  toProductFilter,
  toProductSql,
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

  // The database ids are lower case; @IsUUID accepts any case, and a uuid is one value in either.
  it('groups an existing value given in upper case under its attribute', () => {
    const id = '0a1b2c3d-0000-4000-8000-00000000000a';
    const filter = toProductFilter(
      query({ attributeValueId: [id.toUpperCase()] }),
      new Map([[id, 'a1']]),
    );

    expect(filter.attributeGroups).toHaveLength(1);
    expect(filter.attributeGroups?.[0]?.attributeId).toBe('a1');
  });

  it('takes one value id in lower and upper case as one value', () => {
    const id = '0a1b2c3d-0000-4000-8000-00000000000a';
    const filter = toProductFilter(
      query({ attributeValueId: [id, id.toUpperCase()] }),
      new Map([[id, 'a1']]),
    );

    expect(filter.attributeGroups).toEqual([{ attributeId: 'a1', valueIds: [id] }]);
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

  it('takes a category or brand uuid in lower and upper case as one value', () => {
    const c = '0a1b2c3d-0000-4000-8000-00000000000c';
    const b = '0a1b2c3d-0000-4000-8000-00000000000b';
    const filter = toProductFilter(
      query({ categoryId: [c, c.toUpperCase()], brandId: [b.toUpperCase(), b] }),
      new Map(),
    );

    expect(filter.categoryIds).toHaveLength(1);
    expect(filter.brandIds).toHaveLength(1);
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

describe('joinOrNull', () => {
  it('is NULL for an empty list, which matches nothing in IN', () => {
    const sql = joinOrNull([]);

    expect(sql.sql).toBe('NULL');
    expect(sql.values).toEqual([]);
  });

  it('turns every value into a parameter', () => {
    const sql = joinOrNull(['a', 'b']);

    expect(sql.sql).toBe('?,?');
    expect(sql.values).toEqual(['a', 'b']);
  });
});

describe('toProductSql', () => {
  it('is TRUE without filters, also when every field is undefined', () => {
    expect(toProductSql({}).sql).toBe('TRUE');
    expect(toProductSql({ q: undefined, hasDiscount: undefined }).sql).toBe('TRUE');
  });

  it('keeps the values out of the text of the query', () => {
    const sql = toProductSql({
      categoryIds: ['c1'],
      brandIds: ['b1', 'b2'],
      sizes: ["M'; DROP TABLE products; --"],
      attributeGroups: [{ attributeId: 'a1', valueIds: ['v1'] }],
      q: '50%',
      minPrice: 10.5,
      maxPrice: 20,
    });

    expect(sql.values).toEqual([
      'c1',
      'b1',
      'b2',
      "M'; DROP TABLE products; --",
      'v1',
      '50\\%',
      '10.5',
      '20',
    ]);
    expect(sql.sql).not.toContain('DROP');
    expect(sql.sql).not.toContain('c1');
    expect(sql.sql).not.toContain('50');
  });

  it('matches nothing for an empty list, as Prisma does with in: []', () => {
    const sql = toProductSql({ categoryIds: [], sizes: [] });

    expect(sql.sql).toContain('IN (NULL)');
    expect(sql.values).toEqual([]);
  });

  it('writes a discount filter without a parameter', () => {
    expect(toProductSql({ hasDiscount: true }).sql).toBe('p.discount > 0');
    expect(toProductSql({ hasDiscount: false }).sql).toBe('p.discount = 0');
  });

  it('makes one condition per attribute group, ANDed', () => {
    const sql = toProductSql({
      attributeGroups: [
        { attributeId: 'a1', valueIds: ['v1', 'v2'] },
        { attributeId: null, valueIds: ['x'] },
      ],
    });

    expect(sql.values).toEqual(['v1', 'v2']);
    expect(sql.sql.match(/EXISTS/g)).toHaveLength(1);
    expect(sql.sql).toContain(' AND FALSE');
  });

  it('skips a filter that is undefined', () => {
    expect(toProductSql({ categoryIds: undefined, minPrice: undefined }).sql).toBe('TRUE');
  });
});

describe('attributeGroupSql', () => {
  it('passes the value ids as parameters', () => {
    const sql = attributeGroupSql({ attributeId: 'a1', valueIds: ['v1', 'v2'] });

    expect(sql.values).toEqual(['v1', 'v2']);
    expect(sql.sql).not.toContain('v1');
  });

  it('is FALSE without parameters for the group of an unknown value', () => {
    const sql = attributeGroupSql({ attributeId: null, valueIds: ['x'] });

    expect(sql.sql).toBe('FALSE');
    expect(sql.values).toEqual([]);
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
