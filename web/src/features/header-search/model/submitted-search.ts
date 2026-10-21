'use client';

import { useSyncExternalStore } from 'react';

// The last query submitted in the header, numbered, so the catalog sends `Catalog Searched` for an
// act of searching, the same query again included (spec 0014 O105). Per tab, in memory: the
// header's search opens the catalog by a client-side navigation.
export interface SubmittedSearch {
  q: string;
  id: number;
  // `Date.now()` of the submit: one whose page never loaded does not count for a later visit.
  at: number;
}

// A submit counts this long for its page's first batch: the browser's timeout and retries of one
// request stay well within it.
export const SUBMITTED_SEARCH_TTL_MS = 60_000;

let current: SubmittedSearch | null = null;
const listeners = new Set<() => void>();

export function markSearchSubmitted(q: string): void {
  current = { q, id: (current?.id ?? 0) + 1, at: Date.now() };
  for (const listener of listeners) listener();
}

/** Whether a submit is still waiting for its page, not one left from long ago. */
export function isSubmitFresh(submitted: SubmittedSearch, now = Date.now()): boolean {
  return now - submitted.at <= SUBMITTED_SEARCH_TTL_MS;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The last query submitted in the header, or null; a new submit renders its readers again. */
export function useSubmittedSearch(): SubmittedSearch | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
