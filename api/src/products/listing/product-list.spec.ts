import { describe, expect, it } from 'vitest';

import { Prisma } from '../../generated/prisma/client.js';
import { inIdOrder, productCountSql, productPageSql } from './product-list.js';
import { PRODUCT_SORTS } from './product-sort.js';

const where = Prisma.sql`p.brand_id = ${'b1'}`;

describe('productPageSql', () => {
  it('binds the filter values, then the limit and the offset', () => {
    const sql = productPageSql({ where, sort: 'new', limit: 20, offset: 40 });

    expect(sql.values).toEqual(['b1', 20, 40]);
    expect(sql.sql).toContain('LIMIT ? OFFSET ?');
    expect(sql.sql).not.toContain('20');
    expect(sql.sql).not.toContain('40');
  });

  it('starts at the first row and offset 0 without an after condition or an offset', () => {
    const sql = productPageSql({ where, sort: 'new', limit: 5 });

    expect(sql.values).toEqual(['b1', 5, 0]);
    expect(sql.sql.replaceAll(/\s+/g, ' ')).toContain('AND TRUE ORDER BY');
  });

  it('binds the after condition between the filter values and the limit', () => {
    const after = Prisma.sql`p.discount < ${7}`;
    const sql = productPageSql({ where, after, sort: 'discount', limit: 5 });

    expect(sql.values).toEqual(['b1', 7, 5, 0]);
    expect(sql.sql).toContain('p.discount < ?');
  });

  it('selects the id and every sort key, for the next cursor', () => {
    const sql = productPageSql({ where, sort: 'new', limit: 1 }).sql.replaceAll(/\s+/g, ' ');

    expect(sql).toContain(
      'SELECT p.id, p.created_at AS "createdAt", p.price, p.discount, p.rating FROM products p',
    );
  });

  it.each([
    ['new', 'p.created_at DESC, p.id DESC'],
    ['price_asc', 'p.price ASC, p.id DESC'],
    ['price_desc', 'p.price DESC, p.id DESC'],
    ['discount', 'p.discount DESC, p.id DESC'],
    ['rating', 'p.rating DESC NULLS LAST, p.id DESC'],
  ] as const)('orders the sort %s by %s', (sort, order) => {
    const sql = productPageSql({ where, sort, limit: 1, offset: 0 });

    expect(sql.sql.replaceAll(/\s+/g, ' ')).toContain(`ORDER BY ${order} LIMIT`);
  });

  it('ends every sort with the id, so ties page in one fixed order', () => {
    for (const sort of PRODUCT_SORTS) {
      const sql = productPageSql({ where, sort, limit: 1, offset: 0 });

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
