import type { QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { type User, userKeys, useMe } from '@/entities/user';

// The version of the two consents' text the api takes (`PHOTO_CONSENT_VERSION` of
// `me/photos/consent.ts`): a new text raises both, and everyone gives the new one once.
export const PHOTO_CONSENT_VERSION = 1;

// Where spec 0019 kept the consents per user in this browser (A60). Spec 0023 Y1 keeps them on the
// server, so these keys are no longer read: a stale one is removed on sight.
export const STALE_CONSENT_PREFIX = 'fitting-photo-consent:';

let staleRemoved = false;

function removeStaleConsents(): void {
  if (staleRemoved) return;
  staleRemoved = true;
  try {
    const storage = window.localStorage;
    const stale: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(STALE_CONSENT_PREFIX)) stale.push(key);
    }
    for (const key of stale) storage.removeItem(key);
  } catch {
    // Storage the browser refuses holds none.
  }
}

/** Puts the consents' version into the cached `/me`: given after an upload that sent them, null
 * after the api asked for them (`CONSENT_REQUIRED`, a stale tab). */
export function setPhotoConsent(queryClient: QueryClient, given: boolean): void {
  queryClient.setQueryData<User>(
    userKeys.me,
    (user) => user && { ...user, photoConsentVersion: given ? PHOTO_CONSENT_VERSION : null },
  );
}

/** Reads `/me` again after a first upload that failed other than by a refusal or
 * `CONSENT_REQUIRED`: the api may have kept the consents (it writes them after sharp, before the
 * check), and the next upload then sends none. */
export function refreshPhotoConsent(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: userKeys.me });
}

/** Whether the signed-in user gave both consents of the current text (spec 0023 Y1), from
 * `GET /me`: `undefined` while it loads, `false` when it failed (the upload then sends them). */
export function usePhotoConsent(): boolean | undefined {
  const me = useMe();
  useEffect(removeStaleConsents, []);
  if (me.data) return me.data.photoConsentVersion === PHOTO_CONSENT_VERSION;
  return me.isError ? false : undefined;
}
