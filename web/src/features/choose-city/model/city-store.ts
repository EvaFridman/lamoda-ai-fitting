'use client';

import { useSyncExternalStore } from 'react';

import type { City } from '@/entities/store';

// The visitor's city (spec 0026 plan §3.1), one per browser and shared by its tabs (C0, C9): a
// name of the stores' cities in `localStorage`, never on the server. Neither key is an `mp_`/`__mp`
// one, which the analytics clearing removes (C9, C14).

export const CITY_KEY = 'city';
// Set once the stores page has asked for the position by itself, or a city was chosen (C6, C14).
export const CITY_ASKED_KEY = 'city-asked';
const MAX_NAME_LENGTH = 100;

const listeners = new Set<() => void>();
// What the browser refused to store (storage blocked): kept in memory until the tab reloads (C9).
let unstoredCity: string | undefined;
let unstoredAsked = false;
// Counts the choices of this tab, so an ask that ends after a pick here does not replace it, even
// a pick of the stored name (C8).
let choices = 0;

function readItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // storage blocked
  }
}

function writeItem(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function readCity(): string | null {
  if (unstoredCity !== undefined) return unstoredCity;
  const raw = readItem(CITY_KEY);
  if (raw === null || raw.length === 0 || raw.length > MAX_NAME_LENGTH) return null;
  return raw;
}

function emit(): void {
  for (const listener of listeners) listener();
}

// A city chosen in another tab reaches this one; `key` is null when the storage is cleared.
function onStorage(event: StorageEvent): void {
  if (event.key !== CITY_KEY && event.key !== null) return;
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

/** Whether the stores page has asked by itself, or a city was ever chosen (C6, C14). */
export function wasAsked(): boolean {
  return unstoredAsked || readItem(CITY_ASKED_KEY) === '1';
}

export function markAsked(): void {
  if (!writeItem(CITY_ASKED_KEY, '1')) unstoredAsked = true;
}

/** Chooses the city, by a pick in the window or a found one (C8); the page then never asks (C14). */
export function chooseCity(name: string): void {
  if (writeItem(CITY_KEY, name)) {
    unstoredCity = undefined;
  } else {
    unstoredCity = name;
    // The earlier city must not come back after a reload or in another tab; removing needs no
    // quota.
    try {
      window.localStorage.removeItem(CITY_KEY);
    } catch {
      // storage blocked: nothing was stored either
    }
  }
  markAsked();
  choices += 1;
  emit();
}

/**
 * Taken before asking for the position: the returned check tells whether no city was chosen since,
 * in this tab or another one, so a found city does not replace a pick (C8).
 */
export function untouchedSince(): () => boolean {
  const choicesBefore = choices;
  const storedBefore = readCity();
  return () => choices === choicesBefore && readCity() === storedBefore;
}

/** The stored name; `undefined` on the server and while hydrating, so nothing acts on it. */
export function useStoredCity(): string | null | undefined {
  return useSyncExternalStore(subscribe, readCity, () => undefined);
}

/**
 * The stored name only while it is one of `cities` (C8: a city gone from the table is none);
 * `undefined` while hydrating or while the cities are not there.
 */
export function useCity(cities: readonly City[] | null | undefined): string | null | undefined {
  const stored = useStoredCity();
  if (stored === undefined || cities == null) return undefined;
  if (stored === null) return null;
  return cities.some((city) => city.name === stored) ? stored : null;
}
