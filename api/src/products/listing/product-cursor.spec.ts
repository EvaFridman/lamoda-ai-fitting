import { describe, expect, it } from 'vitest';

import { Prisma } from '../../generated/prisma/client.js';
import {
  afterCursorSql,
  decodeProductCursor,
  encodeProductCursor,
  type ProductKeyRow,
} from './product-cursor.js';
import { PRODUCT_SORTS, type ProductSort } from './product-sort.js';

const ID = '0199aaaa-0000-7000-8000-000000000001';

const row: ProductKeyRow = {
  id: ID,
  createdAt: new Date('2026-03-04T05:06:07.089Z'),
  price: new Prisma.Decimal('1000.5'),
  discount: 35,
  rating: new Prisma.Decimal('4.5'),
};

const b64 = (value: unknown): string =>
  Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

function payload(value: string): unknown {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

describe('encodeProductCursor', () => {
  it.each([
    ['new', { s: 'new', k: '2026-03-04T05:06:07.089Z', id: ID }],
    ['price_asc', { s: 'price_asc', k: '1000.50', id: ID }],
    ['price_desc', { s: 'price_desc', k: '1000.50', id: ID }],
    ['discount', { s: 'discount', k: 35, id: ID }],
    ['rating', { s: 'rating', k: '4.5', id: ID }],
  ] as const)(
    'puts the sort, its key and the id of the %s sort in the cursor',
    (sort, expected) => {
      const cursor = encodeProductCursor(sort, row);

      expect(payload(cursor)).toEqual(expected);
      expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    },
  );

  it('formats a price with two decimals and a rating with one', () => {
    const whole = { ...row, price: new Prisma.Decimal(99), rating: new Prisma.Decimal(4) };

    expect(payload(encodeProductCursor('price_asc', whole))).toMatchObject({ k: '99.00' });
    expect(payload(encodeProductCursor('rating', whole))).toMatchObject({ k: '4.0' });
  });

  it('keeps a missing rating as null', () => {
    expect(payload(encodeProductCursor('rating', { ...row, rating: null }))).toEqual({
      s: 'rating',
      k: null,
      id: ID,
    });
  });

  it('stays far below the length the decoder accepts', () => {
    for (const sort of PRODUCT_SORTS) {
      expect(encodeProductCursor(sort, row).length, sort).toBeLessThan(200);
    }
  });
});

describe('decodeProductCursor', () => {
  it.each(PRODUCT_SORTS)('reads back what it made for the %s sort', (sort) => {
    const cursor = encodeProductCursor(sort, row);

    expect(decodeProductCursor(cursor, sort)).toEqual(payload(cursor));
  });

  it('reads back a null rating', () => {
    const cursor = encodeProductCursor('rating', { ...row, rating: null });

    expect(decodeProductCursor(cursor, 'rating')).toEqual({ s: 'rating', k: null, id: ID });
  });

  it('reads back a price of eight digits and a rating of 0 and 5', () => {
    const big = { ...row, price: new Prisma.Decimal('99999999.99') };

    expect(decodeProductCursor(encodeProductCursor('price_desc', big), 'price_desc')).toMatchObject(
      { k: '99999999.99' },
    );
    for (const rating of ['0', '5']) {
      const cursor = encodeProductCursor('rating', { ...row, rating: new Prisma.Decimal(rating) });

      expect(decodeProductCursor(cursor, 'rating')).toMatchObject({ k: `${rating}.0` });
    }
  });

  it.each(PRODUCT_SORTS)('refuses a cursor of another sort than %s', (sort) => {
    for (const other of PRODUCT_SORTS.filter((candidate) => candidate !== sort)) {
      expect(decodeProductCursor(encodeProductCursor(other, row), sort), other).toBeNull();
    }
  });

  it.each([
    ['not a string', 42],
    ['undefined', undefined],
    ['an empty string', ''],
    ['characters outside base64url', 'abc+/=='],
    ['a space', 'abc def'],
    ['not JSON', b64('not json')],
    ['JSON null', b64('null')],
    ['a JSON array', b64('[]')],
    ['a JSON string', b64('"new"')],
    ['an unknown sort', b64({ s: 'cheap', k: 1, id: ID })],
    ['a missing id', b64({ s: 'discount', k: 1 })],
    ['a missing key', b64({ s: 'discount', id: ID })],
    ['an id that is not a uuid', b64({ s: 'discount', k: 1, id: 'abc' })],
    ['an extra key', b64({ s: 'discount', k: 1, id: ID, extra: true })],
    ['a discount above 100', b64({ s: 'discount', k: 101, id: ID })],
    ['a negative discount', b64({ s: 'discount', k: -1, id: ID })],
    ['a fractional discount', b64({ s: 'discount', k: 1.5, id: ID })],
    ['a discount as text', b64({ s: 'discount', k: '10', id: ID })],
    ['a price as a number', b64({ s: 'price_asc', k: 10, id: ID })],
    ['a price with three decimals', b64({ s: 'price_asc', k: '1.234', id: ID })],
    ['a price with an exponent', b64({ s: 'price_desc', k: '1e2', id: ID })],
    ['a negative price', b64({ s: 'price_desc', k: '-1.00', id: ID })],
    ['a price of nine digits', b64({ s: 'price_desc', k: '123456789.00', id: ID })],
    ['a null price', b64({ s: 'price_asc', k: null, id: ID })],
    ['a null discount', b64({ s: 'discount', k: null, id: ID })],
    ['a null date', b64({ s: 'new', k: null, id: ID })],
    ['a date that is not ISO', b64({ s: 'new', k: 'yesterday', id: ID })],
    ['a date without milliseconds', b64({ s: 'new', k: '2026-03-04T05:06:07Z', id: ID })],
    ['a rating above 5', b64({ s: 'rating', k: '6.0', id: ID })],
    ['a rating with two decimals', b64({ s: 'rating', k: '4.55', id: ID })],
    ['a rating as a number', b64({ s: 'rating', k: 4.5, id: ID })],
  ])('refuses %s', (_name, value) => {
    expect(decodeProductCursor(value, 'discount')).toBeNull();
    for (const sort of PRODUCT_SORTS) {
      expect(decodeProductCursor(value, sort), sort).toBeNull();
    }
  });

  it('refuses a cursor over 256 characters, even one that is otherwise valid', () => {
    const padded = b64({ s: 'discount', k: 1, id: ID, pad: 'x'.repeat(300) });
    const valid = encodeProductCursor('discount', row);

    expect(padded.length).toBeGreaterThan(256);
    expect(decodeProductCursor(padded, 'discount')).toBeNull();
    expect(decodeProductCursor(`${valid}${'A'.repeat(257 - valid.length)}`, 'discount')).toBeNull();
    expect(decodeProductCursor(valid, 'discount')).not.toBeNull();
  });
});

describe('decodeProductCursor: key boundaries', () => {
  const DATE_ID = '01a13c9c-e97f-7b92-ad24-eadcc24d8aa5';

  it('refuses a date in year 0000, which PostgreSQL does not have', () => {
    const cursor = b64({ s: 'new', k: '0000-01-01T00:00:00.000Z', id: DATE_ID });

    expect(decodeProductCursor(cursor, 'new')).toBeNull();
  });

  it.each(['0001-01-01T00:00:00.000Z', '9999-12-31T23:59:59.999Z'])(
    'reads back the date %s',
    (key) => {
      expect(decodeProductCursor(b64({ s: 'new', k: key, id: DATE_ID }), 'new')).toEqual({
        s: 'new',
        k: key,
        id: DATE_ID,
      });
    },
  );

  it.each(['5.0', '5', '0', '0.0', '4.9'])('reads back the rating %s', (key) => {
    expect(decodeProductCursor(b64({ s: 'rating', k: key, id: ID }), 'rating')).toMatchObject({
      k: key,
    });
  });

  it.each(['5.1', '5.9', '6', '-0.1', '4.', '.5'])('refuses the rating %s', (key) => {
    expect(decodeProductCursor(b64({ s: 'rating', k: key, id: ID }), 'rating')).toBeNull();
  });

  it.each(['99999999.99', '1290', '1290.5', '0', '0.01'])('reads back the price %s', (key) => {
    for (const sort of ['price_asc', 'price_desc'] as const) {
      expect(decodeProductCursor(b64({ s: sort, k: key, id: ID }), sort), sort).toMatchObject({
        k: key,
      });
    }
  });

  it.each(['100000000.00', '1290.555', '1290.', '.5', ''])('refuses the price "%s"', (key) => {
    for (const sort of ['price_asc', 'price_desc'] as const) {
      expect(decodeProductCursor(b64({ s: sort, k: key, id: ID }), sort), sort).toBeNull();
    }
  });

  it('reads an uppercase uuid', () => {
    const upper = ID.toUpperCase();

    expect(decodeProductCursor(b64({ s: 'discount', k: 1, id: upper }), 'discount')).toMatchObject({
      id: upper,
    });
  });

  it.each([
    ['without hyphens', ID.replaceAll('-', '')],
    ['in braces', `{${ID}}`],
    ['in a urn', `urn:uuid:${ID}`],
  ])('refuses a uuid %s', (_name, id) => {
    expect(decodeProductCursor(b64({ s: 'discount', k: 1, id }), 'discount')).toBeNull();
  });

  it('refuses a cursor of 5000 characters', () => {
    expect(decodeProductCursor('A'.repeat(5000), 'new')).toBeNull();
  });
});

describe('afterCursorSql', () => {
  const make = (sort: ProductSort, key: string | number | null) =>
    afterCursorSql({ s: sort, k: key, id: ID } as Parameters<typeof afterCursorSql>[0]);
  const text = (sql: Prisma.Sql) => sql.sql.replaceAll(/\s+/g, ' ');

  it('continues the new sort before the date and id, with typed values', () => {
    const [sql, ...rest] = make('new', '2026-03-04T05:06:07.089Z');

    expect(rest).toEqual([]);
    expect(text(sql!)).toBe('(p.created_at, p.id) < (?::timestamptz, ?::uuid)');
    expect(sql!.values).toEqual(['2026-03-04T05:06:07.089Z', ID]);
  });

  it('continues price_asc upwards in price and downwards in id, as numbers', () => {
    const [sql, ...rest] = make('price_asc', '99.00');

    expect(rest).toEqual([]);
    expect(text(sql!)).toBe('p.price >= ?::numeric AND (p.price > ?::numeric OR p.id < ?::uuid)');
    expect(sql!.values).toEqual(['99.00', '99.00', ID]);
  });

  it('continues price_desc downwards, as numbers', () => {
    const [sql, ...rest] = make('price_desc', '1000.50');

    expect(rest).toEqual([]);
    expect(text(sql!)).toBe('(p.price, p.id) < (?::numeric, ?::uuid)');
    expect(sql!.values).toEqual(['1000.50', ID]);
  });

  it('continues discount downwards, as an integer', () => {
    const [sql, ...rest] = make('discount', 35);

    expect(rest).toEqual([]);
    expect(text(sql!)).toBe('(p.discount, p.id) < (?::int, ?::uuid)');
    expect(sql!.values).toEqual([35, ID]);
  });

  it('continues a rated rating in two conditions: the rated rest, then the unrated', () => {
    const conditions = make('rating', '4.5');

    expect(conditions).toHaveLength(2);
    expect(text(conditions[0]!)).toBe(
      'p.rating <= ?::numeric AND (p.rating < ?::numeric OR p.id < ?::uuid)',
    );
    expect(conditions[0]!.values).toEqual(['4.5', '4.5', ID]);
    expect(text(conditions[1]!)).toBe('p.rating IS NULL');
    expect(conditions[1]!.values).toEqual([]);
  });

  it('continues an unrated rating among the unrated only, by id', () => {
    const [sql, ...rest] = make('rating', null);

    expect(rest).toEqual([]);
    expect(text(sql!)).toBe('p.rating IS NULL AND p.id < ?::uuid');
    expect(sql!.values).toEqual([ID]);
  });

  it('never writes a value into the statement', () => {
    const cases: [ProductSort, string | number | null][] = [
      ['new', '2026-03-04T05:06:07.089Z'],
      ['price_asc', '123456.78'],
      ['price_desc', '123456.78'],
      ['discount', 77],
      ['rating', '3.7'],
    ];
    for (const [sort, key] of cases) {
      for (const sql of make(sort, key)) {
        expect(sql.sql, sort).not.toContain(ID);
        expect(sql.sql, sort).not.toContain(String(key));
      }
    }
  });
});
