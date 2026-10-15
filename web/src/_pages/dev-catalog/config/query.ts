import type { ProductListQuery } from '@/entities/product';

export const PAGE_SIZE = 12;

// The product list the page shows: the server prefetches page 1 with no brand and the browser starts
// from the same query, so both build the same key (plan §4).
export function productPageQuery(brandIds: readonly string[], page: number): ProductListQuery {
  return { brandId: brandIds, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE };
}

// Error cases on demand (plan §9): an id no product has (404 `NOT_FOUND`) and a price range the api
// refuses (400 `VALIDATION_FAILED`, `maxPrice` below `minPrice`).
export const UNKNOWN_PRODUCT_ID = '00000000-0000-4000-8000-000000000000';
export const INVALID_PRICE_QUERY: ProductListQuery = { minPrice: 5000, maxPrice: 1000, limit: 1 };
