import 'server-only';

import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { setTimeout as sleep } from 'node:timers/promises';
import { cache } from 'react';

import { ApiError, type ApiPath, buildPath, type PageQuery } from '@/shared/api';
import {
  apiFetch,
  cachedApiFetch,
  cachedData,
  type CachedRead,
  pageCacheOpen,
} from '@/shared/api/server';

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
  type ProductAttributeValueList,
  type ProductDetail,
  type ProductFacets,
  type ProductImageList,
  type ProductList,
  type ProductListItem,
  type ProductVariationList,
  type RelatedProducts,
} from '../model/schemas';
import { productKeys, productPageQuery } from './keys';

// GET /products.
export async function getProducts(query: ProductListQuery = {}): Promise<ProductList> {
  return apiFetch(buildPath('/products', {}, productListQuery(query)), productListSchema);
}

type FilterValues = ReturnType<typeof productFilters>;

// The page cache takes only a catalog's or a category's own reads (spec 0018 V15): no filter but
// one category, the default order and size, no cursor. Anything else is keyed by what the visitor
// typed, so it goes on their behalf, as before; so does every read while the cache is skipped (V24).
function isCacheable({
  categoryId,
  ...rest
}: FilterValues & Partial<ReturnType<typeof productBatchQuery>>): boolean {
  return (
    (categoryId?.length ?? 0) <= 1 &&
    Object.values(rest).every((v) => v === undefined) &&
    pageCacheOpen()
  );
}

// The page cache's reads (spec 0018 plan §3): public catalog data, keyed by their arguments only.
async function cachedProductBatch(query: FilterValues): Promise<CachedRead<ProductList>> {
  'use cache: remote';
  return cachedApiFetch(buildPath('/products', {}, query), productListSchema);
}

async function cachedProductFacets(filters: FilterValues): Promise<CachedRead<ProductFacets>> {
  'use cache: remote';
  return cachedApiFetch(buildPath('/products/facets', {}, filters), productFacetsSchema);
}

// GET /products, one batch of the infinite list: the first with no cursor.
export async function getProductBatch(
  query: ProductBatchQuery = {},
  cursor: string | null = null,
): Promise<ProductList> {
  const params = productBatchQuery(query, cursor);
  if (isCacheable(params)) return cachedData(await cachedProductBatch(productFilters(params)));
  return apiFetch(buildPath('/products', {}, params), productListSchema);
}

// One request per path within a server render: the catalog's metadata and its page ask for the
// same counts (spec 0014 O107). Keyed by the path's string, since `cache` compares its arguments
// by reference and two filter objects never meet.
const facetsRequests = cache(() => new Map<string, Promise<ProductFacets>>());

// GET /products/facets: the filter counts for the same filters, without the page and the order.
export async function getProductFacets(filters: ProductFilters = {}): Promise<ProductFacets> {
  const params = productFilters(filters);
  const path = buildPath('/products/facets', {}, params);
  const requests = facetsRequests();
  let request = requests.get(path.path);
  if (request === undefined) {
    request = isCacheable(params)
      ? cachedProductFacets(params).then(cachedData)
      : apiFetch(path, productFacetsSchema);
    requests.set(path.path, request);
  }
  return request;
}

// GET /products/:id.
export async function getProduct(id: string): Promise<ProductDetail> {
  return apiFetch(buildPath('/products/:id', { id }), productDetailSchema);
}

// An id no product can have: refused before the request (empty, `.`, `..`) or by the api's uuid
// rule (400), or one that names none (404).
function isNoSuchProduct(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.kind === 'path' ||
      (error.kind === 'http' && (error.status === 400 || error.status === 404)))
  );
}

// GET /products/:id on the visitor's behalf; `null` when there is no such product. A product of an
// inactive category comes back too, the caller decides (spec 0019 A80). `incoming`: the request's
// headers, for `proxy.ts`.
export async function findProduct(id: string, incoming?: Headers): Promise<ProductDetail | null> {
  try {
    return await apiFetch(
      buildPath('/products/:id', { id }),
      productDetailSchema,
      undefined,
      incoming,
    );
  } catch (error) {
    if (isNoSuchProduct(error)) return null;
    throw error;
  }
}

// The same for a page, once per render (`generateMetadata` and the page both ask). Never through
// the page cache: the id is the visitor's, and this read is the check that lets the product's
// cached reads run (A80, A81).
export const getProductById = cache((id: string) => findProduct(id));

async function cachedRelatedProducts(path: ApiPath): Promise<CachedRead<RelatedProducts>> {
  'use cache: remote';
  return cachedApiFetch(path, relatedProductsSchema);
}

// GET /products/:id/related (A36). Through the page cache only for a product the caller has read
// on the visitor's behalf and found in an active category (A80): so its id is a real product's, not
// one a visitor typed, and keys stay one per product. While the cache is skipped, as the visitor.
export async function getRelatedProducts(checked: Pick<ProductDetail, 'id'>) {
  const path = buildPath('/products/:id/related', { id: checked.id });
  if (pageCacheOpen()) return cachedData(await cachedRelatedProducts(path));
  return apiFetch(path, relatedProductsSchema);
}

// The sitemap's page size, the api's maximum.
const SITEMAP_BATCH = 100;

// Between two batches: a stale entry answers at once and refreshes in the background, so without a
// pause the ten refreshes would take web's whole second of `GET /products` (10) at once.
export const SITEMAP_BATCH_INTERVAL_MS = 200;

async function cachedSitemapBatch(cursor: string | null): Promise<CachedRead<ProductList>> {
  'use cache: remote';
  return cachedApiFetch(
    buildPath('/products', {}, { limit: SITEMAP_BATCH, cursor }),
    productListSchema,
  );
}

// The newest products, up to `max`, batch by batch, for the sitemap (A81). Through the page cache
// although a cursor is in the key, an exception to 0018 V15: the cursors are the ones the api
// answered, never the visitor's, so there are at most `max / 100` keys per state of the catalog (a
// changed catalog's older keys expire within the hour). A product added between two
// batches' refreshes may show twice or be missing until the next one. While the cache is skipped,
// as the visitor. A failed batch throws. At most 5 batches a second.
export async function getSitemapProducts(max: number): Promise<ProductListItem[]> {
  const items: ProductListItem[] = [];
  let cursor: string | null = null;
  do {
    if (cursor !== null) await sleep(SITEMAP_BATCH_INTERVAL_MS);
    const batch: ProductList = pageCacheOpen()
      ? cachedData(await cachedSitemapBatch(cursor))
      : await apiFetch(
          buildPath('/products', {}, { limit: SITEMAP_BATCH, cursor }),
          productListSchema,
        );
    items.push(...batch.items);
    cursor = batch.nextCursor;
  } while (cursor !== null && items.length < max);
  return items.slice(0, max);
}

// A category's newest product straight from the api, past the page cache, for the deploy's warm-up
// (A81, 0018 V7); `undefined` when it has none.
export async function readFirstProduct(categoryId: string): Promise<ProductListItem | undefined> {
  const { items } = await apiFetch(
    buildPath('/products', {}, { categoryId, limit: 1 }),
    productListSchema,
  );
  return items[0];
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

// Only for a product read as the visitor and found active (`getRelatedProducts`).
export function relatedProductsOptions(checked: Pick<ProductDetail, 'id'>) {
  return queryOptions({
    queryKey: productKeys.related(checked.id),
    queryFn: () => getRelatedProducts(checked),
  });
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
