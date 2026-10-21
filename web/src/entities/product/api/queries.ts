import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query';

import { buildPath, clientFetch, type PageQuery } from '@/shared/api';

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

// The catalog's infinite list (plan §3.3): the first batch, then each after the last one's cursor.
export function productInfiniteOptions(query: ProductBatchQuery = {}) {
  return infiniteQueryOptions({
    queryKey: productKeys.infinite(query),
    queryFn: ({ pageParam, signal }) =>
      clientFetch(
        buildPath('/products', {}, productBatchQuery(query, pageParam)),
        productListSchema,
        {
          signal,
        },
      ),
    initialPageParam: null as string | null,
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

export function useProductBatches(query: ProductBatchQuery = {}) {
  return useInfiniteQuery(productInfiniteOptions(query));
}

export function useProductFacets(filters: ProductFilters = {}) {
  return useQuery(productFacetsOptions(filters));
}

export function useProduct(id: string) {
  return useQuery(productOptions(id));
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
