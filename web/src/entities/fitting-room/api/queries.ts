import { queryOptions, useQuery } from '@tanstack/react-query';

import { buildPath, clientFetch } from '@/shared/api';

import { fittingRoomSchema } from '../model/schemas';
import { fittingRoomKeys } from './keys';

// GET /me/fitting-room, read only in the browser (spec 0017 U11). One room per account (A12): a
// change on another device shows when the tab comes back to the page.
export function fittingRoomQueryOptions() {
  return queryOptions({
    queryKey: fittingRoomKeys.all,
    queryFn: ({ signal }) =>
      clientFetch(buildPath('/me/fitting-room'), fittingRoomSchema, { signal }),
    refetchOnWindowFocus: true,
  });
}

// `enabled` false while nobody is signed in: the room is a user's.
export function useFittingRoom(enabled = true) {
  return useQuery({ ...fittingRoomQueryOptions(), enabled });
}
