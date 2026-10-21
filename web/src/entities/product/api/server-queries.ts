import 'server-only';

import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { cache } from 'react';

import { buildPath, type PageQuery } from '@/shared/api';
import { apiFetch } from '@/shared/api/server';

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
  type ProductAttributeValueList,
  type ProductDetail,
  type ProductFacets,
  type ProductImageList,
  type ProductList,
  type ProductVariationList,
} from '../model/schemas';
import { productKeys, productPageQuery } from './keys';

// GET /products.
export async function getProducts(query: ProductListQuery = {}): Promise<ProductList> {
  return apiFetch(buildPath('/products', {}, productListQuery(query)), productListSchema);
}

// GET /products, one batch of the infinite list: the first with no cursor.
export async function getProductBatch(
  query: ProductBatchQuery = {},
  cursor: string | null = null,
): Promise<ProductList> {
  return apiFetch(buildPath('/products', {}, productBatchQuery(query, cursor)), productListSchema);
}

// One request per path within a server render: the catalog's metadata and its page ask for the
// same counts (spec 0014 O107). Keyed by the path's string, since `cache` compares its arguments
// by reference and two filter objects never meet.
const facetsRequests = cache(() => new Map<string, Promise<ProductFacets>>());

// GET /products/facets: the filter counts for the same filters, without the page and the order.
export async function getProductFacets(filters: ProductFilters = {}): Promise<ProductFacets> {
  const path = buildPath('/products/facets', {}, productFilters(filters));
  const requests = facetsRequests();
  let request = requests.get(path.path);
  if (request === undefined) {
    request = apiFetch(path, productFacetsSchema);
    requests.set(path.path, request);
  }
  return request;
}

// GET /products/:id.
export async function getProduct(id: string): Promise<ProductDetail> {
  return apiFetch(buildPath('/products/:id', { id }), productDetailSchema);
}

// GET /products/:id/images.
export async function getProductImages(
  id: string,
  query: PageQuery = {},
): Promise<ProductImageList> {
  return apiFetch(
    buildPath('/products/:id/images', { id }, productPageQuery(query)),
    productImageListSchema,
  );
}

// GET /products/:id/variations.
export async function getProductVariations(
  id: string,
  query: PageQuery = {},
): Promise<ProductVariationList> {
  return apiFetch(
    buildPath('/products/:id/variations', { id }, productPageQuery(query)),
    productVariationListSchema,
  );
}

// GET /products/:id/attribute-values.
export async function getProductAttributeValues(
  id: string,
  query: PageQuery = {},
): Promise<ProductAttributeValueList> {
  return apiFetch(
    buildPath('/products/:id/attribute-values', { id }, productPageQuery(query)),
    productAttributeValueListSchema,
  );
}

export function productListOptions(query: ProductListQuery = {}) {
  return queryOptions({ queryKey: productKeys.list(query), queryFn: () => getProducts(query) });
}

// The browser's `productInfiniteOptions` with the same key and page params, for `prefetchInfinite`.
export function productInfiniteOptions(query: ProductBatchQuery = {}, start: string | null = null) {
  return infiniteQueryOptions({
    queryKey: productKeys.infinite(query, start),
    queryFn: ({ pageParam }) => getProductBatch(query, pageParam),
    initialPageParam: start,
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function productFacetsOptions(filters: ProductFilters = {}) {
  return queryOptions({
    queryKey: productKeys.facets(filters),
    queryFn: () => getProductFacets(filters),
  });
}

export function productOptions(id: string) {
  return queryOptions({ queryKey: productKeys.detail(id), queryFn: () => getProduct(id) });
}

export function productImageListOptions(id: string, query: PageQuery = {}) {
  return queryOptions({
    queryKey: productKeys.images(id, query),
    queryFn: () => getProductImages(id, query),
  });
}

export function productVariationListOptions(id: string, query: PageQuery = {}) {
  return queryOptions({
    queryKey: productKeys.variations(id, query),
    queryFn: () => getProductVariations(id, query),
  });
}

export function productAttributeValueListOptions(id: string, query: PageQuery = {}) {
  return queryOptions({
    queryKey: productKeys.attributeValues(id, query),
    queryFn: () => getProductAttributeValues(id, query),
  });
}
