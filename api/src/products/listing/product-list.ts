import { Prisma } from '../../generated/prisma/client.js';
import { PRODUCT_ORDER_SQL, type ProductSort } from './product-sort.js';

// The product list in two steps (spec 0014 plan §2.2): the ids of one batch in raw SQL, as the
// filter counts, then the rows by id. `where` comes from `toProductSql`; `after` is one condition
// of `afterCursorSql`, or TRUE for the first batch. The sort keys come along for the next cursor.
export interface ProductPageQuery {
  where: Prisma.Sql;
  after?: Prisma.Sql;
  sort: ProductSort;
  limit: number;
}

export function productPageSql({
  where,
  after = Prisma.sql`TRUE`,
  sort,
  limit,
}: ProductPageQuery): Prisma.Sql {
  return Prisma.sql`
    SELECT p.id, p.created_at AS "createdAt", p.price, p.discount, p.rating
    FROM products p WHERE ${where} AND ${after}
    ORDER BY ${PRODUCT_ORDER_SQL[sort]} LIMIT ${limit}`;
}

export function productCountSql(where: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`SELECT count(*)::int AS count FROM products p WHERE ${where}`;
}

// The rows in the order of their ids; a row deleted after its id was read is left out.
export function inIdOrder<T extends { id: string }>(ids: readonly string[], rows: T[]): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}
