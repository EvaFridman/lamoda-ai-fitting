import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { userKeys, type User } from '@/entities/user';

import { PHOTO_CONSENT_VERSION, setPhotoConsent, usePhotoConsent } from './consent';

const fetchMock = vi.fn();

const USER: User = {
  id: '00000000-0000-4000-8000-000000000001',
  phone: null,
  email: 'anna@example.com',
  firstName: 'Анна',
  lastName: null,
  patronymic: null,
  dateOfBirth: null,
  gender: null,
  fittingProfileImageKey: null,
  fittingProfileImageUrl: null,
  photoConsentVersion: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
};

const meOf = (photoConsentVersion: number | null) => ({ ...USER, photoConsentVersion });

function answerMe(version: number | null) {
  fetchMock.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(meOf(version)), { status: 200 })),
  );
}

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('photo consent from /me', () => {
  it('is the version of the consents text the api takes', () => {
    expect(PHOTO_CONSENT_VERSION).toBe(1);
  });

  it('is unknown (undefined) while /me loads', () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    const { wrapper } = setup();
    expect(renderHook(() => usePhotoConsent(), { wrapper }).result.current).toBeUndefined();
  });

  it('is given for a user whose consents are of the current version', async () => {
    answerMe(1);
    const { wrapper } = setup();
    const { result } = renderHook(() => usePhotoConsent(), { wrapper });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('is not given when the user has none', async () => {
    answerMe(null);
    const { wrapper } = setup();
    const { result } = renderHook(() => usePhotoConsent(), { wrapper });
    await waitFor(() => expect(result.current).toBe(false));
  });

  it.each([[0], [2]])('is not given for the older or newer version %i', async (version) => {
    answerMe(version);
    const { wrapper } = setup();
    const { result } = renderHook(() => usePhotoConsent(), { wrapper });
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('is not given, but known, when /me failed', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'm', details: [] } }),
          { status: 503 },
        ),
      ),
    );
    const { wrapper } = setup();
    const { result } = renderHook(() => usePhotoConsent(), { wrapper });
    await waitFor(() => expect(result.current).toBe(false));
  });
});

describe('setPhotoConsent', () => {
  it('writes the version into the cached /me and a mounted reader follows', async () => {
    const { queryClient, wrapper } = setup();
    queryClient.setQueryData(userKeys.me, meOf(null));
    const { result } = renderHook(() => usePhotoConsent(), { wrapper });
    expect(result.current).toBe(false);

    act(() => setPhotoConsent(queryClient, true));

    expect(queryClient.getQueryData<User>(userKeys.me)?.photoConsentVersion).toBe(1);
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('clears it to null when the api asked for the consents again', async () => {
    const { queryClient, wrapper } = setup();
    queryClient.setQueryData(userKeys.me, meOf(1));
    const { result } = renderHook(() => usePhotoConsent(), { wrapper });
    expect(result.current).toBe(true);

    act(() => setPhotoConsent(queryClient, false));

    expect(queryClient.getQueryData<User>(userKeys.me)?.photoConsentVersion).toBeNull();
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('keeps the rest of the cached user', () => {
    const { queryClient } = setup();
    queryClient.setQueryData(userKeys.me, meOf(null));

    setPhotoConsent(queryClient, true);

    expect(queryClient.getQueryData<User>(userKeys.me)).toEqual(meOf(1));
  });

  it('invents no user when /me was never read', () => {
    const { queryClient } = setup();

    setPhotoConsent(queryClient, true);

    expect(queryClient.getQueryData(userKeys.me)).toBeUndefined();
  });
});

describe('the stale consent keys of spec 0019', () => {
  // The module removes them once per tab: each test loads its own copy.
  async function load() {
    vi.resetModules();
    return import('./consent');
  }

  it('are removed on the first mount, with every other key left', async () => {
    window.localStorage.setItem('fitting-photo-consent:user-anna', '1');
    window.localStorage.setItem('fitting-photo-consent:user-boris', '1');
    window.localStorage.setItem('cookie-consent', 'accepted');
    const { usePhotoConsent: fresh } = await load();
    const { wrapper } = setup();
    answerMe(null);

    renderHook(() => fresh(), { wrapper });

    expect(window.localStorage.getItem('fitting-photo-consent:user-anna')).toBeNull();
    expect(window.localStorage.getItem('fitting-photo-consent:user-boris')).toBeNull();
    expect(window.localStorage.getItem('cookie-consent')).toBe('accepted');
  });

  it('do not grant the consent', async () => {
    window.localStorage.setItem('fitting-photo-consent:user-anna', '1');
    const { usePhotoConsent: fresh } = await load();
    const { wrapper } = setup();
    answerMe(null);

    const { result } = renderHook(() => fresh(), { wrapper });

    await waitFor(() => expect(result.current).toBe(false));
  });

  it('are removed once per tab, not on every mount', async () => {
    const { usePhotoConsent: fresh } = await load();
    const { wrapper } = setup();
    answerMe(null);
    renderHook(() => fresh(), { wrapper });
    window.localStorage.setItem('fitting-photo-consent:late', '1');

    renderHook(() => fresh(), { wrapper });

    expect(window.localStorage.getItem('fitting-photo-consent:late')).toBe('1');
  });

  it('are left alone, with no failure, when the storage throws', async () => {
    vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
      throw new Error('denied');
    });
    window.localStorage.setItem('fitting-photo-consent:user-anna', '1');
    const { usePhotoConsent: fresh } = await load();
    const { wrapper } = setup();
    answerMe(1);

    const { result } = renderHook(() => fresh(), { wrapper });

    await waitFor(() => expect(result.current).toBe(true));
  });
});
