import type { PageQuery } from '@/shared/api';

// The orders GET /products takes; `new` when left out. A copy of the api's, checked by the contract
// test (H20).
export const PRODUCT_SORTS = ['new', 'price_asc', 'price_desc', 'discount', 'rating'] as const;

export type ProductSort = (typeof PRODUCT_SORTS)[number];

// The filters GET /products and GET /products/facets share. Arrays go out as repeated keys.
export interface ProductFilters {
  categoryId?: readonly string[];
  brandId?: readonly string[];
  size?: readonly string[];
  attributeValueId?: readonly string[];
  q?: string;
  minPrice?: number;
  maxPrice?: number;
  hasDiscount?: boolean;
}

// GET /products: the filters plus a page and an order.
export interface ProductListQuery extends ProductFilters, PageQuery {
  sort?: ProductSort;
}

// Trimmed, and an empty search or list is no filter: the api refuses `q=`, `size=` and untrimmed
// text (400), and `['']` or `[]` must share `{}`'s key.
function text(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function list(values: readonly string[] | undefined): string[] | undefined {
  const items = (values ?? []).map((value) => value.trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
}

// Only the known keys, in one order: a wider object neither reaches the api (an unknown parameter,
// or `sort` on the facets, is 400) nor splits the cache.
export function productFilters({
  categoryId,
  brandId,
  size,
  attributeValueId,
  q,
  minPrice,
  maxPrice,
  hasDiscount,
}: ProductFilters = {}) {
  return {
    categoryId: list(categoryId),
    brandId: list(brandId),
    size: list(size),
    attributeValueId: list(attributeValueId),
    q: text(q),
    minPrice,
    maxPrice,
    hasDiscount,
  };
}

export function productListQuery(query: ProductListQuery = {}) {
  const { limit, offset, sort } = query;
  return { ...productFilters(query), limit, offset, sort };
}
