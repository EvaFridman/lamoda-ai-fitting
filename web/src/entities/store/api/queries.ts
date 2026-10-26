import { queryOptions, useQuery } from '@tanstack/react-query';

import { buildPath, clientFetch } from '@/shared/api';

import { storeListSchema } from '../model/schemas';
import { storeKeys } from './keys';

// The browser's options: the same key as the server's (`server-queries.ts`), so the list the page
// prefetched is already in the cache.
export function storeListOptions() {
  return queryOptions({
    queryKey: storeKeys.list(),
    queryFn: ({ signal }) => clientFetch(buildPath('/stores'), storeListSchema, { signal }),
  });
}

export function useStores() {
  return useQuery(storeListOptions());
}
