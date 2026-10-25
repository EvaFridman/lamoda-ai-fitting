import { queryOptions, useQuery } from '@tanstack/react-query';

import { buildPath, clientFetch } from '@/shared/api';

import {
  type Category,
  categoryListSchema,
  categorySchema,
  type OutfitSlot,
} from '../model/schemas';
import { CATEGORY_LIST_MAX, categoryKeys, categoryListQuery, type CategoryListQuery } from './keys';

// The browser's options: the same keys as the server's (`server-queries.ts`), so data the server
// prefetched is already in the cache (plan §4). `signal` is TanStack Query's: a query nobody waits
// for any more stops its request.

export function categoryListOptions(query: CategoryListQuery = {}) {
  return queryOptions({
    queryKey: categoryKeys.list(query),
    queryFn: ({ signal }) =>
      clientFetch(buildPath('/categories', {}, categoryListQuery(query)), categoryListSchema, {
        signal,
      }),
  });
}

export function categoryOptions(id: string) {
  return queryOptions({
    queryKey: categoryKeys.detail(id),
    queryFn: ({ signal }) =>
      clientFetch(buildPath('/categories/:id', { id }), categorySchema, { signal }),
  });
}

export function useCategories(query: CategoryListQuery = {}) {
  return useQuery(categoryListOptions(query));
}

// Every active category in one request, as the catalog reads them (the same key): the fitting
// room's slots of the cards, and its «Подобрать в каталоге» (spec 0019 A90.8).
export const ACTIVE_CATEGORIES_QUERY: CategoryListQuery = {
  isActive: true,
  limit: CATEGORY_LIST_MAX,
};

export function useActiveCategories() {
  return useCategories(ACTIVE_CATEGORIES_QUERY);
}

// The slot of each active category that has one, by its id (A18).
export function categorySlots(
  categories: readonly Category[] | undefined,
): Map<string, OutfitSlot> {
  const slots = new Map<string, OutfitSlot>();
  for (const category of categories ?? []) {
    if (category.slot !== null) slots.set(category.id, category.slot);
  }
  return slots;
}

export function useCategory(id: string) {
  return useQuery(categoryOptions(id));
}
