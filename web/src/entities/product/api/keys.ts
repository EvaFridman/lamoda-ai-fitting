import type { PageQuery } from '@/shared/api';

import {
  productFilters,
  productListQuery,
  type ProductBatchQuery,
  type ProductFilters,
  type ProductListQuery,
} from '../model/filters';

// Only the known keys, so a wider object neither reaches the api nor splits the cache.
export function productPageQuery({ limit, offset }: PageQuery = {}) {
  return { limit, offset };
}

// Query keys shared by the server options and the browser's (`queries.ts`, plan §4).
export const productKeys = {
  all: ['products'] as const,
  list: (query: ProductListQuery = {}) =>
    [...productKeys.all, 'list', productListQuery(query)] as const,
  // Every batch loaded so far is one cache entry; each next cursor is its page param, not in the
  // key. The batch it starts from (`?cursor=`, O29) is: a list from another start is another list.
  infinite: (query: ProductBatchQuery = {}, start: string | null = null) =>
    [...productKeys.all, 'infinite', productListQuery(query), start] as const,
  facets: (filters: ProductFilters = {}) =>
    [...productKeys.all, 'facets', productFilters(filters)] as const,
  detail: (id: string) => [...productKeys.all, 'detail', id] as const,
  images: (id: string, query: PageQuery = {}) =>
    [...productKeys.detail(id), 'images', productPageQuery(query)] as const,
  variations: (id: string, query: PageQuery = {}) =>
    [...productKeys.detail(id), 'variations', productPageQuery(query)] as const,
  attributeValues: (id: string, query: PageQuery = {}) =>
    [...productKeys.detail(id), 'attribute-values', productPageQuery(query)] as const,
  related: (id: string) => [...productKeys.detail(id), 'related'] as const,
};
