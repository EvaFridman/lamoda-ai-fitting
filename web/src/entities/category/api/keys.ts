import type { PageQuery } from '@/shared/api';

// The api's page maximum: every active category in one request (the header, the catalog's list).
export const CATEGORY_LIST_MAX = 100;

// GET /categories query: a page and `isActive`.
export interface CategoryListQuery extends PageQuery {
  isActive?: boolean;
}

// Only the known keys, so a wider object neither reaches the api (an unknown parameter is 400) nor
// splits the cache.
export function categoryListQuery({ limit, offset, isActive }: CategoryListQuery = {}) {
  return { limit, offset, isActive };
}

// Query keys shared by the server options and the browser's (`queries.ts`, plan §4): the same key on
// both sides is what makes the handoff hit.
export const categoryKeys = {
  all: ['categories'] as const,
  list: (query: CategoryListQuery = {}) =>
    [...categoryKeys.all, 'list', categoryListQuery(query)] as const,
  detail: (id: string) => [...categoryKeys.all, 'detail', id] as const,
};
