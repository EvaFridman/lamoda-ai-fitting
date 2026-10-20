import { z } from 'zod';

import { Prisma } from '../../generated/prisma/client.js';
import type { ProductSort } from './product-sort.js';

// The keyset cursor of the product list (spec 0014 plan §2.3): base64url of JSON `{ s, k, id }`,
// the sort, its key and the id of the last product of a batch. Not signed: it only says where to
// continue, and any value that parses is a place in the list.

// A whole cursor is about 100 characters; a longer one is refused before it is decoded.
const MAX_CURSOR_LENGTH = 256;

const DECIMAL = /^\d{1,8}(?:\.\d{1,2})?$/;
const RATING = /^(?:[0-4](?:\.\d)?|5(?:\.0)?)$/;
// PostgreSQL has no year 0: such a key would fail in the query as a 500, not 400.
const FIRST_YEAR = /^(?!0000)/;

const id = z.uuid();
const price = z.string().regex(DECIMAL);

const CURSOR_SCHEMA = z.discriminatedUnion('s', [
  z.strictObject({
    s: z.literal('new'),
    k: z.iso.datetime({ precision: 3 }).regex(FIRST_YEAR),
    id,
  }),
  z.strictObject({ s: z.literal('price_asc'), k: price, id }),
  z.strictObject({ s: z.literal('price_desc'), k: price, id }),
  z.strictObject({ s: z.literal('discount'), k: z.int().min(0).max(100), id }),
  z.strictObject({ s: z.literal('rating'), k: z.string().regex(RATING).nullable(), id }),
]);

export type ProductCursor = z.infer<typeof CURSOR_SCHEMA>;

// The sort keys of a row as the page query selects them (`productPageSql`).
export interface ProductKeyRow {
  id: string;
  createdAt: Date;
  price: Prisma.Decimal;
  discount: number;
  rating: Prisma.Decimal | null;
}

export function encodeProductCursor(sort: ProductSort, row: ProductKeyRow): string {
  return Buffer.from(JSON.stringify(cursorOf(sort, row))).toString('base64url');
}

function cursorOf(sort: ProductSort, row: ProductKeyRow): ProductCursor {
  switch (sort) {
    case 'new':
      return { s: sort, k: row.createdAt.toISOString(), id: row.id };
    case 'price_asc':
    case 'price_desc':
      return { s: sort, k: row.price.toFixed(2), id: row.id };
    case 'discount':
      return { s: sort, k: row.discount, id: row.id };
    case 'rating':
      return { s: sort, k: row.rating === null ? null : row.rating.toFixed(1), id: row.id };
  }
}

// The cursor, or null when it is not one of `sort` (malformed, or made for another sort).
export function decodeProductCursor(value: unknown, sort: ProductSort): ProductCursor | null {
  if (typeof value !== 'string' || value.length > MAX_CURSOR_LENGTH) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const parsed = CURSOR_SCHEMA.safeParse(json);
  return parsed.success && parsed.data.s === sort ? parsed.data : null;
}

// The conditions that continue the list after the cursor, run in turn until a batch is full.
// Each is an `Index Cond` on its sort's index (AC14); rows equal on the key go on by `id desc`.
// The key is bound with its column's type: compared as text, `100` would come before `99`.
export function afterCursorSql(cursor: ProductCursor): Prisma.Sql[] {
  const id = Prisma.sql`${cursor.id}::uuid`;
  switch (cursor.s) {
    case 'new':
      return [Prisma.sql`(p.created_at, p.id) < (${cursor.k}::timestamptz, ${id})`];
    case 'price_asc': {
      // The key goes up and the id down, so not a row comparison; `p.price >= k` starts the scan.
      const k = Prisma.sql`${cursor.k}::numeric`;
      return [Prisma.sql`p.price >= ${k} AND (p.price > ${k} OR p.id < ${id})`];
    }
    case 'price_desc':
      return [Prisma.sql`(p.price, p.id) < (${cursor.k}::numeric, ${id})`];
    case 'discount':
      return [Prisma.sql`(p.discount, p.id) < (${cursor.k}::int, ${id})`];
    case 'rating': {
      if (cursor.k === null) return [Prisma.sql`p.rating IS NULL AND p.id < ${id}`];
      // An OR with IS NULL would give the scan no start: the rated rest, then the unrated from
      // their beginning, which all come after every rated row.
      const k = Prisma.sql`${cursor.k}::numeric`;
      return [
        Prisma.sql`p.rating <= ${k} AND (p.rating < ${k} OR p.id < ${id})`,
        Prisma.sql`p.rating IS NULL`,
      ];
    }
  }
}
