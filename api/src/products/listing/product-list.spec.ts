import { describe, expect, it } from 'vitest';

import { Prisma } from '../../generated/prisma/client.js';
import { inIdOrder, productCountSql, productIdsSql } from './product-list.js';
import { PRODUCT_SORTS } from './product-sort.js';

const where = Prisma.sql`p.brand_id = ${'b1'}`;

describe('productIdsSql', () => {
  it('binds the filter values, then the limit and the offset', () => {
    const sql = productIdsSql({ where, sort: 'new', limit: 20, offset: 40 });

    expect(sql.values).toEqual(['b1', 20, 40]);
    expect(sql.sql).toContain('LIMIT ? OFFSET ?');
    expect(sql.sql).not.toContain('20');
    expect(sql.sql).not.toContain('40');
  });

  it.each([
    ['new', 'p.created_at DESC, p.id DESC'],
    ['price_asc', 'p.price ASC, p.id DESC'],
    ['price_desc', 'p.price DESC, p.id DESC'],
    ['discount', 'p.discount DESC, p.id DESC'],
    ['rating', 'p.rating DESC NULLS LAST, p.id DESC'],
  ] as const)('orders the sort %s by %s', (sort, order) => {
    const sql = productIdsSql({ where, sort, limit: 1, offset: 0 });

    expect(sql.sql.replaceAll(/\s+/g, ' ')).toContain(`ORDER BY ${order} LIMIT`);
  });

  it('ends every sort with the id, so ties page in one fixed order', () => {
    for (const sort of PRODUCT_SORTS) {
      const sql = productIdsSql({ where, sort, limit: 1, offset: 0 });

      expect(sql.sql, sort).toContain('p.id DESC LIMIT');
    }
  });
});

describe('productCountSql', () => {
  it('counts the products of the same condition', () => {
    const sql = productCountSql(where);

    expect(sql.sql).toContain('count(*)');
    expect(sql.sql).toContain('p.brand_id = ?');
    expect(sql.values).toEqual(['b1']);
  });
});

describe('inIdOrder', () => {
  it('returns the rows in the order of the ids', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

    expect(inIdOrder(['c', 'a', 'b'], rows)).toEqual([{ id: 'c' }, { id: 'a' }, { id: 'b' }]);
  });

  it('drops an id whose row is missing', () => {
    expect(inIdOrder(['a', 'gone', 'b'], [{ id: 'b' }, { id: 'a' }])).toEqual([
      { id: 'a' },
      { id: 'b' },
    ]);
  });

  it('drops a row that is not among the ids', () => {
    expect(inIdOrder(['a'], [{ id: 'b' }, { id: 'a' }])).toEqual([{ id: 'a' }]);
  });

  it('is empty without ids', () => {
    expect(inIdOrder([], [{ id: 'a' }])).toEqual([]);
  });
});
