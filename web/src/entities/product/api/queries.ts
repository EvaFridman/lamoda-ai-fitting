import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useQueries,
  useQuery,
} from '@tanstack/react-query';

import { buildPath, clientFetch, type PageQuery } from '@/shared/api';

import { productColours } from '../lib/colours';
import {
  productBatchQuery,
  productFilters,
  productListQuery,
  type ProductBatchQuery,
  type ProductFilters,
  type ProductListQuery,
} from '../model/filters';
import {
  productAttributeValueListSchema,
  productDetailSchema,
  productFacetsSchema,
  productImageListSchema,
  productListSchema,
  productVariationListSchema,
  relatedProductsSchema,
} from '../model/schemas';
import { productKeys, productPageQuery } from './keys';

// The browser's options: the same keys as the server's (`server-queries.ts`), so data the server
// prefetched is already in the cache (plan §4). `signal` is TanStack Query's: a query nobody waits
// for any more stops its request.

export function productListOptions(query: ProductListQuery = {}) {
  return queryOptions({
    queryKey: productKeys.list(query),
    queryFn: ({ signal }) =>
      clientFetch(buildPath('/products', {}, productListQuery(query)), productListSchema, {
        signal,
      }),
  });
}

// The catalog's infinite list (plan §3.3): the first batch (after `start`, when given), then each
// after the last one's cursor.
export function productInfiniteOptions(query: ProductBatchQuery = {}, start: string | null = null) {
  return infiniteQueryOptions({
    queryKey: productKeys.infinite(query, start),
    queryFn: ({ pageParam, signal }) =>
      clientFetch(
        buildPath('/products', {}, productBatchQuery(query, pageParam)),
        productListSchema,
        {
          signal,
        },
      ),
    initialPageParam: start,
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function productFacetsOptions(filters: ProductFilters = {}) {
  return queryOptions({
    queryKey: productKeys.facets(filters),
    queryFn: ({ signal }) =>
      clientFetch(buildPath('/products/facets', {}, productFilters(filters)), productFacetsSchema, {
        signal,
      }),
  });
}

export function productOptions(id: string) {
  return queryOptions({
    queryKey: productKeys.detail(id),
    queryFn: ({ signal }) =>
      clientFetch(buildPath('/products/:id', { id }), productDetailSchema, { signal }),
  });
}

// «С этим товаром выбирают» (A36): the page prefetches it through the page cache; the browser asks
// as the visitor only when that failed.
export function relatedProductsOptions(id: string) {
  return queryOptions({
    queryKey: productKeys.related(id),
    queryFn: ({ signal }) =>
      clientFetch(buildPath('/products/:id/related', { id }), relatedProductsSchema, { signal }),
  });
}

export function productImageListOptions(id: string, query: PageQuery = {}) {
  return queryOptions({
    queryKey: productKeys.images(id, query),
    queryFn: ({ signal }) =>
      clientFetch(
        buildPath('/products/:id/images', { id }, productPageQuery(query)),
        productImageListSchema,
        { signal },
      ),
  });
}

export function productVariationListOptions(id: string, query: PageQuery = {}) {
  return queryOptions({
    queryKey: productKeys.variations(id, query),
    queryFn: ({ signal }) =>
      clientFetch(
        buildPath('/products/:id/variations', { id }, productPageQuery(query)),
        productVariationListSchema,
        { signal },
      ),
  });
}

export function productAttributeValueListOptions(id: string, query: PageQuery = {}) {
  return queryOptions({
    queryKey: productKeys.attributeValues(id, query),
    queryFn: ({ signal }) =>
      clientFetch(
        buildPath('/products/:id/attribute-values', { id }, productPageQuery(query)),
        productAttributeValueListSchema,
        { signal },
      ),
  });
}

export function useProducts(query: ProductListQuery = {}) {
  return useQuery(productListOptions(query));
}

export function useProductBatches(query: ProductBatchQuery = {}, start: string | null = null) {
  return useInfiniteQuery(productInfiniteOptions(query, start));
}

export function useProductFacets(filters: ProductFilters = {}) {
  return useQuery(productFacetsOptions(filters));
}

export function useProduct(id: string) {
  return useQuery(productOptions(id));
}

// Whether any of these products has another colour to choose (the look result's line «Смена
// цвета…», spec 0024 AC12): the same reads as `useProduct`'s, so the rows and the line agree.
export function useAnyColourChoice(ids: readonly string[]): boolean {
  return useQueries({
    queries: ids.map((id) => productOptions(id)),
    combine: (results) => results.some((result) => productColours(result.data).length > 1),
  });
}

export function useRelatedProducts(id: string) {
  return useQuery(relatedProductsOptions(id));
}

export function useProductImages(id: string, query: PageQuery = {}) {
  return useQuery(productImageListOptions(id, query));
}

export function useProductVariations(id: string, query: PageQuery = {}) {
  return useQuery(productVariationListOptions(id, query));
}

export function useProductAttributeValues(id: string, query: PageQuery = {}) {
  return useQuery(productAttributeValueListOptions(id, query));
}
