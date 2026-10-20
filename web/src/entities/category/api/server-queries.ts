import 'server-only';

import { queryOptions } from '@tanstack/react-query';
import { cache } from 'react';

import { ApiError, buildPath } from '@/shared/api';
import { apiFetch } from '@/shared/api/server';

import {
  categoryListSchema,
  categorySchema,
  type Category,
  type CategoryList,
} from '../model/schemas';
import { categoryKeys, categoryListQuery, type CategoryListQuery } from './keys';

// GET /categories.
export async function getCategories(query: CategoryListQuery = {}): Promise<CategoryList> {
  return apiFetch(buildPath('/categories', {}, categoryListQuery(query)), categoryListSchema);
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

// The same, once per page render: `generateMetadata` and the page both ask.
export const getCategoryBySlug = cache((slug: string) => findCategoryBySlug(slug));

export function categoryListOptions(query: CategoryListQuery = {}) {
  return queryOptions({ queryKey: categoryKeys.list(query), queryFn: () => getCategories(query) });
}

export function categoryOptions(id: string) {
  return queryOptions({ queryKey: categoryKeys.detail(id), queryFn: () => getCategory(id) });
}
