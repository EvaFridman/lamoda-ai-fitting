import { queryOptions, useQuery } from '@tanstack/react-query';

import { buildPath, clientFetch } from '@/shared/api';

import { userPhotoListSchema } from '../model/schemas';
import { userPhotoKeys } from './keys';

// The photos' links are signed for 15 minutes (S3_SIGNED_URL_TTL_SECONDS, spec 0011 M9): the list
// is read again before they expire, while the page is open and when the tab comes back to it.
const PHOTO_LINKS_FRESH_MS = 10 * 60_000;

// GET /me/photos, read only in the browser: no page reads user data on the server (spec 0017 U11).
export function myPhotosQueryOptions() {
  return queryOptions({
    queryKey: userPhotoKeys.all,
    queryFn: ({ signal }) => clientFetch(buildPath('/me/photos'), userPhotoListSchema, { signal }),
    staleTime: PHOTO_LINKS_FRESH_MS,
    refetchInterval: PHOTO_LINKS_FRESH_MS,
    refetchOnWindowFocus: true,
  });
}

export function useMyPhotos() {
  return useQuery(myPhotosQueryOptions());
}
