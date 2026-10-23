import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CONSENT_KEY_PREFIX, consentKey } from './consent';

const ANNA = 'user-anna';
const BORIS = 'user-boris';

// The module keeps "given in this tab" between calls, so each test loads its own copy.
async function load() {
  vi.resetModules();
  return import('./consent');
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('photo consent', () => {
  it('keys the consent by the user', () => {
    expect(CONSENT_KEY_PREFIX).toBe('fitting-photo-consent:');
    expect(consentKey(ANNA)).toBe('fitting-photo-consent:user-anna');
  });

  it('is not given at first', async () => {
    const { usePhotoConsent } = await load();
    expect(renderHook(() => usePhotoConsent(ANNA)).result.current).toBe(false);
  });

  it('is read from localStorage for that user', async () => {
    window.localStorage.setItem(consentKey(ANNA), '1');
    const { usePhotoConsent } = await load();
    expect(renderHook(() => usePhotoConsent(ANNA)).result.current).toBe(true);
  });

  it("does not count another user's consent", async () => {
    window.localStorage.setItem(consentKey(ANNA), '1');
    const { usePhotoConsent } = await load();
    expect(renderHook(() => usePhotoConsent(BORIS)).result.current).toBe(false);
  });

  it('is not given with no user, even when some consent is stored', async () => {
    window.localStorage.setItem(consentKey(ANNA), '1');
    const { usePhotoConsent } = await load();
    expect(renderHook(() => usePhotoConsent(undefined)).result.current).toBe(false);
  });

  it('ignores any other stored value', async () => {
    window.localStorage.setItem(consentKey(ANNA), 'yes');
    const { usePhotoConsent } = await load();
    expect(renderHook(() => usePhotoConsent(ANNA)).result.current).toBe(false);
  });

  it('stores the consent under the user key only and updates a mounted reader', async () => {
    const { givePhotoConsent, usePhotoConsent } = await load();
    const anna = renderHook(() => usePhotoConsent(ANNA));
    const boris = renderHook(() => usePhotoConsent(BORIS));
    act(() => givePhotoConsent(ANNA));
    expect(anna.result.current).toBe(true);
    expect(boris.result.current).toBe(false);
    expect(window.localStorage.getItem(consentKey(ANNA))).toBe('1');
    expect(window.localStorage).toHaveLength(1);
  });

  it('counts for the tab and for that user only when the storage throws', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const { givePhotoConsent, usePhotoConsent } = await load();
    const anna = renderHook(() => usePhotoConsent(ANNA));
    const boris = renderHook(() => usePhotoConsent(BORIS));
    act(() => givePhotoConsent(ANNA));
    expect(anna.result.current).toBe(true);
    expect(boris.result.current).toBe(false);
    expect(window.localStorage.getItem(consentKey(ANNA))).toBeNull();
  });

  it('is not given when reading the storage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const { usePhotoConsent } = await load();
    expect(renderHook(() => usePhotoConsent(ANNA)).result.current).toBe(false);
  });

  it("follows another tab's consent of the user's key", async () => {
    const { usePhotoConsent } = await load();
    const { result } = renderHook(() => usePhotoConsent(ANNA));
    act(() => {
      window.localStorage.setItem(consentKey(ANNA), '1');
      window.dispatchEvent(new StorageEvent('storage', { key: consentKey(ANNA) }));
    });
    expect(result.current).toBe(true);
  });

  it('re-reads when the whole storage is cleared (key null)', async () => {
    window.localStorage.setItem(consentKey(ANNA), '1');
    const { usePhotoConsent } = await load();
    const { result } = renderHook(() => usePhotoConsent(ANNA));
    expect(result.current).toBe(true);
    act(() => {
      window.localStorage.clear();
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
    });
    expect(result.current).toBe(false);
  });

  it('does not count a stored consent of another user after a storage event', async () => {
    const { usePhotoConsent } = await load();
    const { result } = renderHook(() => usePhotoConsent(BORIS));
    act(() => {
      window.localStorage.setItem(consentKey(ANNA), '1');
      window.dispatchEvent(new StorageEvent('storage', { key: consentKey(ANNA) }));
    });
    expect(result.current).toBe(false);
  });
});
