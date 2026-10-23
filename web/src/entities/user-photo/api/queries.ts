import { queryOptions, useQuery } from '@tanstack/react-query';

import { buildPath, clientFetch } from '@/shared/api';

import { userPhotoListSchema } from '../model/schemas';
import { userPhotoKeys } from './keys';

// GET /me/photos, read only in the browser: no page reads user data on the server (spec 0017 U11).
export function myPhotosQueryOptions() {
  return queryOptions({
    queryKey: userPhotoKeys.all,
    queryFn: ({ signal }) => clientFetch(buildPath('/me/photos'), userPhotoListSchema, { signal }),
  });
}

export function useMyPhotos() {
  return useQuery(myPhotosQueryOptions());
}
