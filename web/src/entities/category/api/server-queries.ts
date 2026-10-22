import 'server-only';

import { queryOptions } from '@tanstack/react-query';
import { cache } from 'react';

import { ApiError, buildPath } from '@/shared/api';
import {
  apiFetch,
  cachedApiFetch,
  cachedData,
  type CachedRead,
  pageCacheOpen,
} from '@/shared/api/server';

import {
  categoryListSchema,
  categorySchema,
  type Category,
  type CategoryList,
} from '../model/schemas';
import { CATEGORY_LIST_MAX, categoryKeys, categoryListQuery, type CategoryListQuery } from './keys';

// The page cache's reads (spec 0018 plan §3): public catalog data, keyed by their arguments only.
async function cachedCategoryList(
  query: ReturnType<typeof categoryListQuery>,
): Promise<CachedRead<CategoryList>> {
  'use cache: remote';
  return cachedApiFetch(buildPath('/categories', {}, query), categoryListSchema);
}

// GET /categories. A first page is cached (the header, the sitemap, the catalog's slugs: constant
// queries, so a handful of keys, V15); a later one, or any while the page cache is skipped (V24),
// goes on the visitor's behalf.
export async function getCategories(query: CategoryListQuery = {}): Promise<CategoryList> {
  const normalized = categoryListQuery(query);
  if (normalized.offset === undefined && pageCacheOpen()) {
    return cachedData(await cachedCategoryList(normalized));
  }
  return apiFetch(buildPath('/categories', {}, normalized), categoryListSchema);
}

const ACTIVE_CATEGORIES: CategoryListQuery = { isActive: true, limit: CATEGORY_LIST_MAX };

// Every active category (the api's page maximum), once per render: the header and a category
// page's lookup share it, and one cached entry.
export const getActiveCategories = cache((): Promise<CategoryList> =>
  getCategories(ACTIVE_CATEGORIES),
);

// The same list straight from the api, past the page cache, for a list that must be current: the
// deploy's warm-up (spec 0018 V7), where a copy rolled back to may hold an entry up to an hour old.
export async function readActiveCategories(): Promise<CategoryList> {
  return apiFetch(
    buildPath('/categories', {}, categoryListQuery(ACTIVE_CATEGORIES)),
    categoryListSchema,
  );
}

// GET /categories/:id.
export async function getCategory(id: string): Promise<Category> {
  return apiFetch(buildPath('/categories/:id', { id }), categorySchema);
}

// A slug no category can have: refused before the request (empty, `.`, `..`) or by the api's slug
// rule (400), or one that names none (404).
function isNoSuchSlug(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.kind === 'path' ||
      (error.kind === 'http' && (error.status === 400 || error.status === 404)))
  );
}

// GET /categories/by-slug/:slug; `null` when there is no such category. Inactive ones come back too,
// the page decides (O4). `incoming`: the request's headers, for `proxy.ts` (O65).
export async function findCategoryBySlug(
  slug: string,
  incoming?: Headers,
): Promise<Category | null> {
  try {
    return await apiFetch(
      buildPath('/categories/by-slug/:slug', { slug }),
      categorySchema,
      undefined,
      incoming,
    );
  } catch (error) {
    if (isNoSuchSlug(error)) return null;
    throw error;
  }
}

// The same for a page, once per render (`generateMetadata` and the page both ask): an active
// category from the cached list of active ones, anything else (inactive, unknown, created since the
// list was read, or a failed list) read on the visitor's behalf, as `proxy.ts` does (V24). So a
// slug of the visitor's choosing is never a key and never spends web's own quota.
export const getCategoryBySlug = cache(async (slug: string): Promise<Category | null> => {
  const listed = await getActiveCategories().then(
    ({ items }) => items.find((category) => category.slug === slug),
    () => undefined,
  );
  return listed ?? findCategoryBySlug(slug);
});

export function categoryListOptions(query: CategoryListQuery = {}) {
  return queryOptions({ queryKey: categoryKeys.list(query), queryFn: () => getCategories(query) });
}

export function categoryOptions(id: string) {
  return queryOptions({ queryKey: categoryKeys.detail(id), queryFn: () => getCategory(id) });
}
