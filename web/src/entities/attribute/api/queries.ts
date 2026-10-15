import { queryOptions, useQuery } from '@tanstack/react-query';

import { buildPath, clientFetch, type PageQuery } from '@/shared/api';

import { attributeListSchema, attributeSchema, attributeValueListSchema } from '../model/schemas';
import { attributeKeys, attributePageQuery } from './keys';

// The browser's options: the same keys as the server's (`server-queries.ts`), so data the server
// prefetched is already in the cache (plan §4). `signal` is TanStack Query's: a query nobody waits
// for any more stops its request.

export function attributeListOptions(query: PageQuery = {}) {
  return queryOptions({
    queryKey: attributeKeys.list(query),
    queryFn: ({ signal }) =>
      clientFetch(buildPath('/attributes', {}, attributePageQuery(query)), attributeListSchema, {
        signal,
      }),
  });
}

export function attributeOptions(id: string) {
  return queryOptions({
    queryKey: attributeKeys.detail(id),
    queryFn: ({ signal }) =>
      clientFetch(buildPath('/attributes/:id', { id }), attributeSchema, { signal }),
  });
}

export function attributeValueListOptions(attributeId: string, query: PageQuery = {}) {
  return queryOptions({
    queryKey: attributeKeys.values(attributeId, query),
    queryFn: ({ signal }) =>
      clientFetch(
        buildPath('/attributes/:id/values', { id: attributeId }, attributePageQuery(query)),
        attributeValueListSchema,
        { signal },
      ),
  });
}

export function useAttributes(query: PageQuery = {}) {
  return useQuery(attributeListOptions(query));
}

export function useAttribute(id: string) {
  return useQuery(attributeOptions(id));
}

export function useAttributeValues(attributeId: string, query: PageQuery = {}) {
  return useQuery(attributeValueListOptions(attributeId, query));
}
