import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { markSignInStarted, SIGN_IN_FLAG_MS, takeSignInStarted } from './sign-in-flag';

describe('sign-in flag', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it('is false until a sign-in is marked', () => {
    expect(takeSignInStarted()).toBe(false);
  });

  it('is true once after a mark, and gone after being taken', () => {
    markSignInStarted();
    expect(takeSignInStarted()).toBe(true);
    expect(takeSignInStarted()).toBe(false);
  });

  it('uses a key the analytics client does not clear', () => {
    markSignInStarted();
    expect(window.sessionStorage.length).toBe(1);
    const key = window.sessionStorage.key(0) ?? '';
    expect(key).not.toBe('');
    expect(key.startsWith('mp_')).toBe(false);
    expect(key.startsWith('__mp')).toBe(false);
  });

  describe('age of the flag', () => {
    const KEY = 'sign-in-started';
    const NOW = new Date('2026-01-01T12:00:00Z');

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('stores the current time', () => {
      markSignInStarted();
      expect(window.sessionStorage.getItem(KEY)).toBe(String(NOW.getTime()));
    });

    it('is true at exactly 10 minutes', () => {
      markSignInStarted();
      vi.setSystemTime(NOW.getTime() + SIGN_IN_FLAG_MS);
      expect(takeSignInStarted()).toBe(true);
    });

    it('is false and removed at 10 minutes and 1 ms', () => {
      markSignInStarted();
      vi.setSystemTime(NOW.getTime() + SIGN_IN_FLAG_MS + 1);
      expect(takeSignInStarted()).toBe(false);
      expect(window.sessionStorage.getItem(KEY)).toBeNull();
    });

    it('is false and removed for a time in the future', () => {
      window.sessionStorage.setItem(KEY, String(NOW.getTime() + 1000));
      expect(takeSignInStarted()).toBe(false);
      expect(window.sessionStorage.getItem(KEY)).toBeNull();
    });

    it('is false and removed for a value that is not a number', () => {
      window.sessionStorage.setItem(KEY, 'yesterday');
      expect(takeSignInStarted()).toBe(false);
      expect(window.sessionStorage.getItem(KEY)).toBeNull();
    });
  });

  it('is false and does not throw when the storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => markSignInStarted()).not.toThrow();
    expect(takeSignInStarted()).toBe(false);
  });
});
