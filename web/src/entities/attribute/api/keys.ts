import type { PageQuery } from '@/shared/api';

// Only the known keys, so a wider object neither reaches the api (an unknown parameter is 400) nor
// splits the cache.
export function attributePageQuery({ limit, offset }: PageQuery = {}) {
  return { limit, offset };
}

// Query keys shared by the server options and the browser's (`queries.ts`, plan §4).
export const attributeKeys = {
  all: ['attributes'] as const,
  list: (query: PageQuery = {}) =>
    [...attributeKeys.all, 'list', attributePageQuery(query)] as const,
  detail: (id: string) => [...attributeKeys.all, 'detail', id] as const,
  values: (attributeId: string, query: PageQuery = {}) =>
    [...attributeKeys.all, 'values', attributeId, attributePageQuery(query)] as const,
};
