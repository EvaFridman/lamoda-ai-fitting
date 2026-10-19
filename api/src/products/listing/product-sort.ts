import { Prisma } from '../../generated/prisma/client.js';

export const PRODUCT_SORTS = ['new', 'price_asc', 'price_desc', 'discount', 'rating'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

// The sorts of the product list on `products p` (spec 0004 E14, E45), with no sort by relevance
// (0014 O14). Price is the price before the discount (E15). Each ends with id desc, so products
// with equal values page in one fixed order; each matches one of the sort indexes (0014 plan §2.1).
export const PRODUCT_ORDER_SQL: Record<ProductSort, Prisma.Sql> = {
  new: Prisma.sql`p.created_at DESC, p.id DESC`,
  price_asc: Prisma.sql`p.price ASC, p.id DESC`,
  price_desc: Prisma.sql`p.price DESC, p.id DESC`,
  discount: Prisma.sql`p.discount DESC, p.id DESC`,
  rating: Prisma.sql`p.rating DESC NULLS LAST, p.id DESC`,
};
