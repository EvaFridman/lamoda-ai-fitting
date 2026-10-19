import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../prisma/prisma.service.js';
import { ProductListQueryDto } from '../dto/product-list-query.dto.js';
import {
  attributeGroupSql,
  joinOrNull,
  loadValueAttributes,
  searchSql,
  searchTokens,
  toProductFilter,
  toProductSql,
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
      '50:*',
      '50%',
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

describe('searchTokens', () => {
  it('lower-cases Cyrillic and Latin words', () => {
    expect(searchTokens('Платье RED Dress')).toEqual(['платье', 'red', 'dress']);
  });

  it('keeps digits, alone or inside a word', () => {
    expect(searchTokens('50 jeans501 A4')).toEqual(['50', 'jeans501', 'a4']);
  });

  it('splits on any other character, a run of them counting once', () => {
    expect(searchTokens('red,  dress/blue-green_a%b\\c')).toEqual([
      'red',
      'dress',
      'blue',
      'green',
      'a',
      'b',
      'c',
    ]);
  });

  it('keeps a letter typed as a base and a combining mark as one letter (NFC)', () => {
    const breve = String.fromCodePoint(0x306);
    const diaeresis = String.fromCodePoint(0x308);

    expect(searchTokens(`маи${breve}ка`)).toEqual(['майка']);
    expect(searchTokens(`Е${diaeresis}ЖИК`)).toEqual(['ёжик']);
    expect(searchTokens(`и${breve}`)).toEqual(['й']);
  });

  it('is empty for a text with no letter or digit', () => {
    expect(searchTokens('%%')).toEqual([]);
    expect(searchTokens("--- _ \\ &|!():*<>'")).toEqual([]);
    expect(searchTokens('')).toEqual([]);
  });
});

describe('searchSql', () => {
  it('is FALSE, with no parameters, when q has no word', () => {
    for (const q of ['%%', '---', "'"]) {
      const sql = searchSql(q);

      expect(sql.sql, q).toBe('FALSE');
      expect(sql.values, q).toEqual([]);
    }
  });

  it('binds the tsquery with the last word as a beginning, and the raw q for the article', () => {
    const sql = searchSql('Красное Плат');

    expect(sql.values).toEqual(['красное & плат:*', 'Красное Плат']);
    expect(sql.sql).toContain("to_tsquery('russian', ?)");
    expect(sql.sql).toContain('p.search_vector @@');
    expect(sql.sql).toContain('lower(p.article) = lower(?)');
    expect(sql.sql).not.toContain('Плат');
  });

  it('lets no tsquery syntax character into the tsquery parameter', () => {
    const q = "a&b|c!d(e)f:g*h<i>j'k";

    const sql = searchSql(q);

    expect(sql.values).toEqual(['a & b & c & d & e & f & g & h & i & j & k', q]);
    expect(sql.values[0]).toMatch(/^[\p{L}\p{N} &:*]+$/u);
  });

  // O53: a last word shorter than MIN_PREFIX_LENGTH is an exact lexeme.
  it.each([
    ['плат', 'плат:*'],
    ['пл', 'пл:*'],
    ['платье м', 'платье & м'],
    ['м', 'м'],
    ['5', '5'],
    ['платье 5', 'платье & 5'],
    ['52', '52:*'],
  ])('writes q=%s as the tsquery %s (O53)', (q, tsquery) => {
    expect(searchSql(q).values[0]).toBe(tsquery);
  });

  it('counts a letter outside the basic plane as one character', () => {
    const astral = String.fromCodePoint(0x1d4d0);

    expect(astral).toHaveLength(2);
    expect(searchSql(astral).values[0]).toBe(astral);
    expect(searchSql(`${astral}${astral}`).values[0]).toBe(`${astral}${astral}:*`);
  });

  it('keeps q out of the text of the query', () => {
    const sql = searchSql("x'; DROP TABLE products; --");

    expect(sql.sql).not.toContain('DROP');
    expect(sql.sql).not.toContain("x'");
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
