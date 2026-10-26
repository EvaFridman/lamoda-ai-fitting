import 'server-only';

import { queryOptions } from '@tanstack/react-query';

import { buildPath } from '@/shared/api';
import {
  apiFetch,
  cachedApiFetch,
  cachedData,
  type CachedRead,
  pageCacheOpen,
} from '@/shared/api/server';

import { storeListSchema, type StoreList } from '../model/schemas';
import { storeKeys } from './keys';

// The page cache's read (spec 0018 plan §3): the same list for every visitor, one key.
async function cachedStoreList(): Promise<CachedRead<StoreList>> {
  'use cache: remote';
  return cachedApiFetch(buildPath('/stores'), storeListSchema);
}

// GET /stores, cached as `getCategories`' first page (spec 0022 plan §3.1); while the page cache
// is skipped (V24) it goes on the visitor's behalf.
export async function getStores(): Promise<StoreList> {
  if (pageCacheOpen()) return cachedData(await cachedStoreList());
  return apiFetch(buildPath('/stores'), storeListSchema);
}

export function storeListOptions() {
  return queryOptions({ queryKey: storeKeys.list(), queryFn: () => getStores() });
}
