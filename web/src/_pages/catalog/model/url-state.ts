import { z } from 'zod';

import {
  PRODUCT_FILTER_MAX_VALUES,
  PRODUCT_MAX_PRICE,
  PRODUCT_SEARCH_MAX_LENGTH,
  PRODUCT_SIZE_MAX_LENGTH,
  PRODUCT_SORTS,
  type ProductBatchQuery,
  type ProductSort,
} from '@/entities/product';

// What the address sets (plan §3.2): the category comes from the path, the batch size is the api's.
export type CatalogQuery = Omit<ProductBatchQuery, 'categoryId' | 'limit'>;

export interface CatalogUrlState {
  query: CatalogQuery;
  // The batch to start from (`?cursor=`, O29; a refused one shows the first, O72).
  cursor?: string;
}

// A page's `searchParams` as Next passes them, or the browser's.
export type CatalogSearchParams = Record<string, string | string[] | undefined> | URLSearchParams;

// The api's default order: left out of the address.
const DEFAULT_SORT: ProductSort = 'new';

const NUL = String.fromCodePoint(0);
const PRICE = /^\d+(?:\.\d{1,2})?$/;
const uuid = z.uuid();

function valuesOf(params: CatalogSearchParams, key: string): string[] {
  if (params instanceof URLSearchParams) return params.getAll(key);
  const value = params[key];
  return value === undefined ? [] : typeof value === 'string' ? [value] : value;
}

// A parameter given twice counts once, by its first value.
function firstOf(params: CatalogSearchParams, key: string): string | undefined {
  return valuesOf(params, key)[0];
}

function characters(value: string): number {
  return [...value].length;
}

// The search, trimmed and cut to the api's 100 characters (O14); one the api would refuse (NUL) is
// dropped.
function search(value: string | undefined): string | undefined {
  if (value === undefined || value.includes(NUL)) return undefined;
  const cut = [...value.trim()].slice(0, PRODUCT_SEARCH_MAX_LENGTH).join('').trim();
  return cut || undefined;
}

function isSize(value: string): boolean {
  return value !== '' && !value.includes(NUL) && characters(value) <= PRODUCT_SIZE_MAX_LENGTH;
}

function isUuid(value: string): boolean {
  return uuid.safeParse(value).success;
}

// A comma list, repeated keys too: the valid items, each once, at most the api's 50.
function list(
  params: CatalogSearchParams,
  key: string,
  valid: (value: string) => boolean,
): string[] | undefined {
  const items = valuesOf(params, key)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(valid);
  const unique = [...new Set(items)].slice(0, PRODUCT_FILTER_MAX_VALUES);
  return unique.length > 0 ? unique : undefined;
}

// Rubles with at most 2 decimals, from 0 to the api's maximum.
function price(value: string | undefined): number | undefined {
  if (value === undefined || !PRICE.test(value)) return undefined;
  const number = Number(value);
  return number <= PRODUCT_MAX_PRICE ? number : undefined;
}

// Only `true`: the page has no "without a discount" choice, so `false` would narrow the list with no
// chip showing it (O85).
function flag(value: string | undefined): true | undefined {
  return value === 'true' ? true : undefined;
}

function sort(value: string | undefined): ProductSort | undefined {
  const known = PRODUCT_SORTS.find((item) => item === value);
  return known === DEFAULT_SORT ? undefined : known;
}

// The address → the catalog's state. Unknown and invalid parameters are left out of the state, never
// out of the address: the page does not rewrite it, so the sign-in's `error` stays for the login
// modal (0013 N54). Every value kept is one the api accepts, so the page never asks it for a 400.
export function parseCatalogUrl(params: CatalogSearchParams): CatalogUrlState {
  const minPrice = price(firstOf(params, 'minPrice'));
  const maxPrice = price(firstOf(params, 'maxPrice'));
  const query: CatalogQuery = {
    q: search(firstOf(params, 'q')),
    sort: sort(firstOf(params, 'sort')),
    brandId: list(params, 'brandId', isUuid),
    size: list(params, 'size', isSize),
    attributeValueId: list(params, 'attributeValueId', isUuid),
    minPrice,
    // The api refuses a maximum below the minimum.
    maxPrice:
      maxPrice !== undefined && minPrice !== undefined && maxPrice < minPrice
        ? undefined
        : maxPrice,
    hasDiscount: flag(firstOf(params, 'hasDiscount')),
  };
  const cursor = firstOf(params, 'cursor') || undefined;
  return cursor === undefined ? { query } : { query, cursor };
}

function joined(values: readonly string[] | undefined): string | undefined {
  return values !== undefined && values.length > 0
    ? values.map((value) => encodeURIComponent(value)).join(',')
    : undefined;
}

function encoded(value: string | number | boolean | undefined): string | undefined {
  return value === undefined ? undefined : encodeURIComponent(String(value));
}

// The catalog's state → its query string ('' or `?…`), in one order, lists as comma lists, the
// default sort left out.
export function catalogSearch({ query, cursor }: CatalogUrlState): string {
  const pairs: [string, string | undefined][] = [
    ['q', encoded(search(query.q))],
    ['sort', encoded(query.sort === DEFAULT_SORT ? undefined : query.sort)],
    ['brandId', joined(query.brandId)],
    ['size', joined(query.size)],
    ['attributeValueId', joined(query.attributeValueId)],
    ['minPrice', encoded(query.minPrice)],
    ['maxPrice', encoded(query.maxPrice)],
    // Only `true`, as it is read (O85).
    ['hasDiscount', encoded(query.hasDiscount === true ? true : undefined)],
    ['cursor', encoded(cursor || undefined)],
  ];
  const parts = pairs.flatMap(([key, value]) => (value === undefined ? [] : [`${key}=${value}`]));
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}
