'use client';

import { useSyncExternalStore } from 'react';
import { z } from 'zod';

// The visitor's answer about analytics cookies (spec 0008 plan §4), kept in `localStorage`. It is
// the only source of truth: the SDK's own opt-out follows it (J26).

export type ConsentAnswer = 'granted' | 'denied';
/** `none`: no answer, or one that is unreadable, malformed or too old; it counts as "no" (J10). */
export type Consent = ConsentAnswer | 'none';

export const CONSENT_KEY = 'cookie-consent';
/** An answer is remembered for 365 days, then the banner asks again (J20). */
export const CONSENT_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

const storedSchema = z.object({
  value: z.enum(['granted', 'denied']),
  at: z.iso.datetime(),
});

const listeners = new Set<() => void>();
// "Настройки cookies" shows the banner again; the stored answer holds until a new one is given.
let reopened = false;
// A reopened banner takes the focus when it shows, and the answer gives it back to the element that
// reopened it, so a keyboard user does not lose their place.
let focusOnShow = false;
let returnFocus: HTMLElement | undefined;
// Counts reopenings, so a reopen while the banner is already shown moves the focus too.
let reopenings = 0;
// An answer the browser refused to store (storage blocked): the banner hides and nothing is sent,
// whatever was chosen, until the page reloads; the next load asks again (plan §4).
let unstored = false;

/** Reads a stored answer; anything but a valid one younger than 365 days is `none`. */
export function parseConsent(raw: string | null, now: number): Consent {
  if (raw === null) return 'none';
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return 'none';
  }
  const parsed = storedSchema.safeParse(data);
  if (!parsed.success) return 'none';
  const age = now - Date.parse(parsed.data.at);
  // A date more than a day ahead (a hand-edited value, not a clock off by hours) would never expire.
  if (age > CONSENT_MAX_AGE_MS || age < -CLOCK_SKEW_MS) return 'none';
  return parsed.data.value;
}

function readConsent(): Consent {
  if (unstored) return 'denied';
  try {
    return parseConsent(window.localStorage.getItem(CONSENT_KEY), Date.now());
  } catch {
    return 'none'; // storage blocked
  }
}

function isAsking(): boolean {
  return reopened || readConsent() === 'none';
}

function emit(): void {
  for (const listener of listeners) listener();
}

// An answer given in another tab reaches this one and closes a reopened banner too (J31); `key` is
// null when the storage is cleared.
function onStorage(event: StorageEvent): void {
  if (event.key !== CONSENT_KEY && event.key !== null) return;
  reopened = false;
  focusOnShow = false;
  returnFocus = undefined;
  emit();
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}

/** Stores the visitor's answer and hides the banner. */
export function answerConsent(value: ConsentAnswer): void {
  try {
    window.localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ value, at: new Date().toISOString() }),
    );
    unstored = false;
  } catch {
    unstored = true;
    // An earlier "granted" must not outlive a decline that could not be stored: without it the
    // next page has no answer, which counts as no (J10). Removing needs no quota.
    try {
      window.localStorage.removeItem(CONSENT_KEY);
    } catch {
      // storage blocked: nothing was stored either
    }
  }
  reopened = false;
  focusOnShow = false;
  const target = returnFocus;
  returnFocus = undefined;
  emit();
  if (target?.isConnected) target.focus();
}

/** Shows the banner again ("Настройки cookies", J16). */
export function reopenConsent(): void {
  reopened = true;
  focusOnShow = true;
  reopenings += 1;
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  emit();
}

/** Changes on every reopen; 0 on the server. */
export function useReopenings(): number {
  return useSyncExternalStore(
    subscribe,
    () => reopenings,
    () => 0,
  );
}

/** Whether the banner was just reopened and should take the focus; asked once per reopen. */
export function takeFocusOnShow(): boolean {
  const take = focusOnShow;
  focusOnShow = false;
  return take;
}

/** The answer in effect; `unknown` on the server and while hydrating, so nothing acts on it. */
export function useConsent(): Consent | 'unknown' {
  return useSyncExternalStore(subscribe, readConsent, () => 'unknown');
}

/** Whether the banner should ask; never on the server, so the static shell holds no banner. */
export function useConsentAsking(): boolean {
  return useSyncExternalStore(subscribe, isAsking, () => false);
}
