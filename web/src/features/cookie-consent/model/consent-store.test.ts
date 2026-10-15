import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  answerConsent,
  CONSENT_KEY,
  CONSENT_MAX_AGE_MS,
  parseConsent,
  reopenConsent,
  useConsent,
  useConsentAsking,
} from './consent-store';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-15T12:00:00.000Z');

function stored(value: string, ageMs: number) {
  return JSON.stringify({ value, at: new Date(NOW - ageMs).toISOString() });
}

describe('parseConsent', () => {
  it('reads a granted and a denied answer', () => {
    expect(parseConsent(stored('granted', DAY), NOW)).toBe('granted');
    expect(parseConsent(stored('denied', DAY), NOW)).toBe('denied');
  });

  it('is none when nothing is stored', () => {
    expect(parseConsent(null, NOW)).toBe('none');
  });

  it.each([
    ['invalid JSON', '{nope'],
    ['a non-object', '"granted"'],
    ['an unknown value', JSON.stringify({ value: 'maybe', at: new Date(NOW).toISOString() })],
    ['a missing date', JSON.stringify({ value: 'granted' })],
    ['a bad date', JSON.stringify({ value: 'granted', at: 'yesterday' })],
  ])('is none for %s', (_name, raw) => {
    expect(parseConsent(raw, NOW)).toBe('none');
  });

  it('keeps an answer 364 days old and drops one 366 days old', () => {
    expect(parseConsent(stored('granted', 364 * DAY), NOW)).toBe('granted');
    expect(parseConsent(stored('granted', 366 * DAY), NOW)).toBe('none');
    expect(CONSENT_MAX_AGE_MS).toBe(365 * DAY);
  });

  it('drops an answer dated more than a day ahead and keeps one a few hours ahead', () => {
    expect(parseConsent(stored('granted', -2 * DAY), NOW)).toBe('none');
    expect(parseConsent(stored('granted', -5 * 60 * 60 * 1000), NOW)).toBe('granted');
  });
});

// The store keeps module-level state; an answer given with a working storage clears it.
function resetStore() {
  answerConsent('denied');
  window.localStorage.clear();
}

describe('consent store hooks', () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    resetStore();
  });

  it('has no answer and asks at first', () => {
    const consent = renderHook(() => useConsent());
    const asking = renderHook(() => useConsentAsking());
    expect(consent.result.current).toBe('none');
    expect(asking.result.current).toBe(true);
  });

  it('stores a granted answer with the current time and stops asking', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const consent = renderHook(() => useConsent());
    const asking = renderHook(() => useConsentAsking());
    act(() => answerConsent('granted'));
    expect(JSON.parse(window.localStorage.getItem(CONSENT_KEY)!)).toEqual({
      value: 'granted',
      at: '2026-10-15T12:00:00.000Z',
    });
    expect(consent.result.current).toBe('granted');
    expect(asking.result.current).toBe(false);
  });

  it('stores a denied answer', () => {
    const consent = renderHook(() => useConsent());
    act(() => answerConsent('denied'));
    expect(consent.result.current).toBe('denied');
    expect(JSON.parse(window.localStorage.getItem(CONSENT_KEY)!).value).toBe('denied');
  });

  it('asks again for an answer 366 days old', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    window.localStorage.setItem(CONSENT_KEY, stored('granted', 366 * DAY));
    const consent = renderHook(() => useConsent());
    const asking = renderHook(() => useConsentAsking());
    expect(consent.result.current).toBe('none');
    expect(asking.result.current).toBe(true);
  });

  it('keeps the stored answer in effect while reopened, and a new answer replaces it', () => {
    act(() => answerConsent('granted'));
    const consent = renderHook(() => useConsent());
    const asking = renderHook(() => useConsentAsking());
    expect(asking.result.current).toBe(false);
    act(() => reopenConsent());
    expect(asking.result.current).toBe(true);
    expect(consent.result.current).toBe('granted');
    act(() => answerConsent('denied'));
    expect(asking.result.current).toBe(false);
    expect(consent.result.current).toBe('denied');
  });

  it('counts as denied and stops asking when storage refuses the answer, without throwing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const consent = renderHook(() => useConsent());
    const asking = renderHook(() => useConsentAsking());
    expect(consent.result.current).toBe('none');
    expect(asking.result.current).toBe(true);
    expect(() => act(() => answerConsent('granted'))).not.toThrow();
    expect(consent.result.current).toBe('denied');
    expect(asking.result.current).toBe(false);
  });

  it('re-reads on a storage event for its key or a cleared storage', () => {
    const consent = renderHook(() => useConsent());
    window.localStorage.setItem(CONSENT_KEY, stored('granted', 0));
    expect(consent.result.current).toBe('none');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: CONSENT_KEY }));
    });
    expect(consent.result.current).toBe('granted');
    window.localStorage.clear();
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
    });
    expect(consent.result.current).toBe('none');
  });

  it('removes an earlier granted answer when a decline cannot be stored', () => {
    act(() => answerConsent('granted'));
    const consent = renderHook(() => useConsent());
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    act(() => answerConsent('denied'));
    expect(window.localStorage.getItem(CONSENT_KEY)).toBeNull();
    expect(consent.result.current).toBe('denied');
    vi.restoreAllMocks();
    // A reload reads the storage alone.
    expect(parseConsent(window.localStorage.getItem(CONSENT_KEY), Date.now())).toBe('none');
  });

  it.each([CONSENT_KEY, null])(
    'closes a reopened banner and takes the stored answer on a storage event for key %s',
    (key) => {
      act(() => answerConsent('denied'));
      const consent = renderHook(() => useConsent());
      const asking = renderHook(() => useConsentAsking());
      act(() => reopenConsent());
      expect(asking.result.current).toBe(true);
      window.localStorage.setItem(CONSENT_KEY, stored('granted', 0));
      act(() => {
        window.dispatchEvent(new StorageEvent('storage', { key }));
      });
      expect(asking.result.current).toBe(false);
      expect(consent.result.current).toBe('granted');
    },
  );

  it('stops listening to storage events after the last unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useConsent());
    unmount();
    expect(remove).toHaveBeenCalledWith('storage', expect.any(Function));
  });
});
