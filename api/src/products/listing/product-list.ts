import { Prisma } from '../../generated/prisma/client.js';
import { PRODUCT_ORDER_SQL, type ProductSort } from './product-sort.js';

// The product list in two steps (spec 0014 plan §2.2): the ids of one page in raw SQL, as the
// filter counts, then the rows by id. `where` comes from `toProductSql`.
export interface ProductIdsQuery {
  where: Prisma.Sql;
  sort: ProductSort;
  limit: number;
  offset: number;
}

export function productIdsSql({ where, sort, limit, offset }: ProductIdsQuery): Prisma.Sql {
  return Prisma.sql`
    SELECT p.id FROM products p WHERE ${where}
    ORDER BY ${PRODUCT_ORDER_SQL[sort]} LIMIT ${limit} OFFSET ${offset}`;
}

export function productCountSql(where: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`SELECT count(*)::int AS count FROM products p WHERE ${where}`;
}

// The rows in the order of their ids; a row deleted after its id was read is left out.
export function inIdOrder<T extends { id: string }>(ids: readonly string[], rows: T[]): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}
