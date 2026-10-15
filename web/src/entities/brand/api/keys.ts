import type { PageQuery } from '@/shared/api';

// Only the known keys, so a wider object neither reaches the api (an unknown parameter is 400) nor
// splits the cache.
export function brandListQuery({ limit, offset }: PageQuery = {}) {
  return { limit, offset };
}

// Query keys shared by the server options and, later, the browser hooks (plan §4).
export const brandKeys = {
  all: ['brands'] as const,
  list: (query: PageQuery = {}) => [...brandKeys.all, 'list', brandListQuery(query)] as const,
  detail: (id: string) => [...brandKeys.all, 'detail', id] as const,
};
