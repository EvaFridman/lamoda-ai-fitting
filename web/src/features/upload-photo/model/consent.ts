import { useSyncExternalStore } from 'react';

// The two consents of the first upload (spec 0019 AC2, A46), kept in `localStorage` (plan §7) per
// user, `fitting-photo-consent:<userId>`: once given, the same user's later uploads in this browser
// skip the screen, and another person signed in on the same device gives their own (A60). Not an
// `mp_`/`__mp` key, which the analytics' clearing removes.
export const CONSENT_KEY_PREFIX = 'fitting-photo-consent:';
const GIVEN = '1';

export function consentKey(userId: string): string {
  return `${CONSENT_KEY_PREFIX}${userId}`;
}

const listeners = new Set<() => void>();
// A consent the browser would not store counts for this tab until it reloads, as a cookie answer
// does (spec 0008).
const givenInTab = new Set<string>();

function read(userId: string | undefined): boolean {
  if (!userId) return false;
  if (givenInTab.has(userId)) return true;
  try {
    return window.localStorage.getItem(consentKey(userId)) === GIVEN;
  } catch {
    return false;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab's consent counts here too.
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(CONSENT_KEY_PREFIX)) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Records both consents of this user: the first upload's screen does not show them again here. */
export function givePhotoConsent(userId: string): void {
  givenInTab.add(userId);
  try {
    window.localStorage.setItem(consentKey(userId), GIVEN);
  } catch {
    // Kept for the tab only.
  }
  for (const listener of listeners) listener();
}

/** Whether this user gave both consents in this browser; `false` with no user and on the server. */
export function usePhotoConsent(userId: string | undefined): boolean {
  return useSyncExternalStore(
    subscribe,
    () => read(userId),
    () => false,
  );
}
