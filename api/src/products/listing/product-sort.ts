import type { Prisma } from '../../generated/prisma/client.js';

export const PRODUCT_SORTS = ['new', 'price_asc', 'price_desc', 'discount', 'rating'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

// The sorts of the product list (spec 0004 E14, E45). Price is the price before the discount
// (E15). Each ends with id desc, so products with equal values page in one fixed order.
export const PRODUCT_ORDER: Record<ProductSort, Prisma.ProductOrderByWithRelationInput[]> = {
  new: [{ createdAt: 'desc' }, { id: 'desc' }],
  price_asc: [{ price: 'asc' }, { id: 'desc' }],
  price_desc: [{ price: 'desc' }, { id: 'desc' }],
  discount: [{ discount: 'desc' }, { id: 'desc' }],
  rating: [{ rating: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
};
