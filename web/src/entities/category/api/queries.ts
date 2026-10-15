import { queryOptions, useQuery } from '@tanstack/react-query';

import { buildPath, clientFetch } from '@/shared/api';

import { categoryListSchema, categorySchema } from '../model/schemas';
import { categoryKeys, categoryListQuery, type CategoryListQuery } from './keys';

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

export function useCategory(id: string) {
  return useQuery(categoryOptions(id));
}
