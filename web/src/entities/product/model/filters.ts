import type { PageQuery } from '@/shared/api';

// The orders GET /products takes; `new` when left out. A copy of the api's, checked by the contract
// test (H20).
export const PRODUCT_SORTS = ['new', 'price_asc', 'price_desc', 'discount', 'rating'] as const;

export type ProductSort = (typeof PRODUCT_SORTS)[number];

// The api's limits on the filters (`SEARCH_MAX_LENGTH`, `SIZE_MAX_LENGTH`, `MAX_PRICE`,
// `MAX_QUERY_LIST_VALUES` of `common/validation/rules.ts`), in characters, not UTF-16 units.
export const PRODUCT_SEARCH_MAX_LENGTH = 100;
export const PRODUCT_SIZE_MAX_LENGTH = 20;
export const PRODUCT_MAX_PRICE = 99_999_999.99;
export const PRODUCT_FILTER_MAX_VALUES = 50;

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

// The infinite list: batches by cursor, never by offset (spec 0014 O11).
export type ProductBatchQuery = Omit<ProductListQuery, 'offset'>;

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

// One batch of the infinite list: the first with no cursor, the next after `cursor`.
export function productBatchQuery(query: ProductBatchQuery, cursor: string | null) {
  return { ...productListQuery({ ...query, offset: undefined }), cursor: cursor ?? undefined };
}
