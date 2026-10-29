import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { City } from '@/entities/store';

const CITIES: City[] = [
  { name: 'Москва', points: [[37.62, 55.75]] },
  { name: 'Санкт-Петербург', points: [[30.31, 59.94]] },
];

// Each test gets the module afresh: its in-memory state (blocked storage, choices) is per load.
let loads = 0;
async function loadStore() {
  loads += 1;
  const path = `./city-store.ts?load=${loads}`;
  return (await import(/* @vite-ignore */ path)) as typeof import('./city-store');
}

const otherTab = (key: string | null) =>
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key }));
  });

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useCity', () => {
  it('is undefined while the cities are not there', async () => {
    const { useCity } = await loadStore();
    window.localStorage.setItem('city', 'Москва');
    expect(renderHook(() => useCity(undefined)).result.current).toBeUndefined();
    expect(renderHook(() => useCity(null)).result.current).toBeUndefined();
  });

  it('is null with nothing stored', async () => {
    const { useCity } = await loadStore();
    expect(renderHook(() => useCity(CITIES)).result.current).toBeNull();
  });

  it('is the stored name while it is one of the cities', async () => {
    const { useCity } = await loadStore();
    window.localStorage.setItem('city', 'Санкт-Петербург');
    expect(renderHook(() => useCity(CITIES)).result.current).toBe('Санкт-Петербург');
  });

  it('is null when the stored name left the table (AC8)', async () => {
    const { useCity, useStoredCity } = await loadStore();
    window.localStorage.setItem('city', 'Казань');
    expect(renderHook(() => useCity(CITIES)).result.current).toBeNull();
    expect(renderHook(() => useStoredCity()).result.current).toBe('Казань');
  });

  it.each([
    ['over 100 characters', 'я'.repeat(101)],
    ['empty', ''],
  ])('reads a name %s as none', async (_name, stored) => {
    const { useStoredCity } = await loadStore();
    window.localStorage.setItem('city', stored);
    expect(renderHook(() => useStoredCity()).result.current).toBeNull();
  });

  it('accepts a name of exactly 100 characters', async () => {
    const { useStoredCity } = await loadStore();
    const name = 'я'.repeat(100);
    window.localStorage.setItem('city', name);
    expect(renderHook(() => useStoredCity()).result.current).toBe(name);
  });
});

describe('chooseCity', () => {
  it('writes the city and the mark, and the hook follows', async () => {
    const { chooseCity, useCity, wasAsked } = await loadStore();
    const { result } = renderHook(() => useCity(CITIES));
    expect(wasAsked()).toBe(false);
    act(() => chooseCity('Москва'));
    expect(result.current).toBe('Москва');
    expect(window.localStorage.getItem('city')).toBe('Москва');
    expect(window.localStorage.getItem('city-asked')).toBe('1');
    expect(wasAsked()).toBe(true);
  });

  it('stores only the two keys, with no coordinates (AC5)', async () => {
    const { chooseCity } = await loadStore();
    chooseCity('Москва');
    expect(Object.keys(window.localStorage).sort()).toEqual(['city', 'city-asked']);
  });

  it('keeps the city in memory when the storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { chooseCity, useCity, wasAsked } = await loadStore();
    const { result } = renderHook(() => useCity(CITIES));
    expect(result.current).toBeNull();
    act(() => chooseCity('Москва'));
    expect(result.current).toBe('Москва');
    expect(wasAsked()).toBe(true);

    const reloaded = await loadStore();
    expect(reloaded.wasAsked()).toBe(false);
    expect(renderHook(() => reloaded.useCity(CITIES)).result.current).toBeNull();
  });
});

describe('chooseCity when the write fails', () => {
  it('removes an earlier stored city and keeps the new one in memory', async () => {
    window.localStorage.setItem('city', 'Москва');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const { chooseCity, useCity } = await loadStore();
    const { result } = renderHook(() => useCity(CITIES));
    expect(result.current).toBe('Москва');
    act(() => chooseCity('Санкт-Петербург'));
    expect(window.localStorage.getItem('city')).toBeNull();
    expect(result.current).toBe('Санкт-Петербург');
  });
});

describe('another tab', () => {
  it('shows the city chosen there', async () => {
    const { useCity } = await loadStore();
    const { result } = renderHook(() => useCity(CITIES));
    expect(result.current).toBeNull();
    window.localStorage.setItem('city', 'Санкт-Петербург');
    otherTab('city');
    expect(result.current).toBe('Санкт-Петербург');
  });

  it('shows no city when the storage is cleared there', async () => {
    const { useCity } = await loadStore();
    window.localStorage.setItem('city', 'Москва');
    const { result } = renderHook(() => useCity(CITIES));
    expect(result.current).toBe('Москва');
    window.localStorage.clear();
    otherTab(null);
    expect(result.current).toBeNull();
  });
});

describe('untouchedSince', () => {
  it('stays true while nothing is chosen', async () => {
    const { untouchedSince } = await loadStore();
    expect(untouchedSince()()).toBe(true);
  });

  it('turns false after a choice here, even of the stored name', async () => {
    const { chooseCity, untouchedSince } = await loadStore();
    chooseCity('Москва');
    const untouched = untouchedSince();
    expect(untouched()).toBe(true);
    chooseCity('Москва');
    expect(untouched()).toBe(false);
  });

  it('turns false after a change in another tab', async () => {
    const { untouchedSince } = await loadStore();
    const untouched = untouchedSince();
    window.localStorage.setItem('city', 'Санкт-Петербург');
    otherTab('city');
    expect(untouched()).toBe(false);
  });
});
