import { queryOptions, useQuery } from '@tanstack/react-query';

import { buildPath, clientFetch, type PageQuery } from '@/shared/api';

import { brandListSchema, brandSchema } from '../model/schemas';
import { brandKeys, brandListQuery } from './keys';

// The browser's options: the same keys as the server's (`server-queries.ts`), so data the server
// prefetched is already in the cache (plan §4). `signal` is TanStack Query's: a query nobody waits
// for any more stops its request.

export function brandListOptions(query: PageQuery = {}) {
  return queryOptions({
    queryKey: brandKeys.list(query),
    queryFn: ({ signal }) =>
      clientFetch(buildPath('/brands', {}, brandListQuery(query)), brandListSchema, { signal }),
  });
}

export function brandOptions(id: string) {
  return queryOptions({
    queryKey: brandKeys.detail(id),
    queryFn: ({ signal }) => clientFetch(buildPath('/brands/:id', { id }), brandSchema, { signal }),
  });
}

export function useBrands(query: PageQuery = {}) {
  return useQuery(brandListOptions(query));
}

export function useBrand(id: string) {
  return useQuery(brandOptions(id));
}
