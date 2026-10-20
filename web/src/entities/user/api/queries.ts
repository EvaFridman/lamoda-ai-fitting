import { queryOptions, useQuery } from '@tanstack/react-query';

import { buildPath, clientFetch } from '@/shared/api';

import { userSchema } from '../model/schemas';
import { userKeys } from './keys';

// GET /me, read only in the browser: no page reads user data on the server (spec 0017 U11).
export function meQueryOptions() {
  return queryOptions({
    queryKey: userKeys.me,
    queryFn: ({ signal }) => clientFetch(buildPath('/me'), userSchema, { signal }),
  });
}

export function useMe() {
  return useQuery(meQueryOptions());
}
