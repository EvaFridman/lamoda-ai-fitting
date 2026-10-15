import type { PageQuery } from '@/shared/api';

import {
  productFilters,
  productListQuery,
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
  facets: (filters: ProductFilters = {}) =>
    [...productKeys.all, 'facets', productFilters(filters)] as const,
  detail: (id: string) => [...productKeys.all, 'detail', id] as const,
  images: (id: string, query: PageQuery = {}) =>
    [...productKeys.detail(id), 'images', productPageQuery(query)] as const,
  variations: (id: string, query: PageQuery = {}) =>
    [...productKeys.detail(id), 'variations', productPageQuery(query)] as const,
  attributeValues: (id: string, query: PageQuery = {}) =>
    [...productKeys.detail(id), 'attribute-values', productPageQuery(query)] as const,
};
