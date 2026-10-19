import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionState } from '@/entities/session';

import { markSignInStarted } from '../lib/sign-in-flag';

import { useSignInAnalytics } from './use-sign-in-analytics';

const mocks = vi.hoisted(() => ({ identify: vi.fn(), reset: vi.fn() }));

vi.mock('@/shared/analytics', () => ({ identify: mocks.identify, reset: mocks.reset }));

function signedIn(id: string): SessionState {
  return { status: 'signed-in', user: { id, email: 'a@example.com', name: 'Анна' } };
}

describe('useSignInAnalytics', () => {
  beforeEach(() => {
    mocks.identify.mockReset();
    mocks.reset.mockReset();
    window.sessionStorage.clear();
  });
  afterEach(() => window.sessionStorage.clear());

  it('identifies by the id with signedIn when this tab started a sign-in, and takes the flag', () => {
    markSignInStarted();
    renderHook(() => useSignInAnalytics(signedIn('u1')));
    expect(mocks.identify).toHaveBeenCalledExactlyOnceWith('u1', { signedIn: true });
    expect(window.sessionStorage.length).toBe(0);
  });

  it('identifies without signedIn when no sign-in was started here', () => {
    renderHook(() => useSignInAnalytics(signedIn('u1')));
    expect(mocks.identify).toHaveBeenCalledExactlyOnceWith('u1', { signedIn: false });
  });

  it('does nothing while pending', () => {
    markSignInStarted();
    renderHook(() => useSignInAnalytics({ status: 'pending' }));
    expect(mocks.identify).not.toHaveBeenCalled();
    expect(mocks.reset).not.toHaveBeenCalled();
  });

  it('resets once and does not identify when signed out, leaving the sign-in flag', () => {
    markSignInStarted();
    const { rerender } = renderHook(({ s }) => useSignInAnalytics(s), {
      initialProps: { s: { status: 'signed-out', failed: false } as SessionState },
    });
    rerender({ s: { status: 'signed-out', failed: false } });
    expect(mocks.reset).toHaveBeenCalledTimes(1);
    expect(mocks.identify).not.toHaveBeenCalled();
    expect(window.sessionStorage.length).toBe(1);
  });

  it('neither resets nor identifies when the read failed', () => {
    renderHook(() => useSignInAnalytics({ status: 'signed-out', failed: true }));
    expect(mocks.reset).not.toHaveBeenCalled();
    expect(mocks.identify).not.toHaveBeenCalled();
  });

  it('resets when a failed read is followed by an answer of no session', () => {
    const { rerender } = renderHook(({ s }) => useSignInAnalytics(s), {
      initialProps: { s: { status: 'signed-out', failed: true } as SessionState },
    });
    rerender({ s: { status: 'signed-out', failed: false } });
    expect(mocks.reset).toHaveBeenCalledTimes(1);
  });

  it('does not reset when a signed-in user meets a failed read', () => {
    const { rerender } = renderHook(({ s }) => useSignInAnalytics(s), {
      initialProps: { s: signedIn('u1') as SessionState },
    });
    rerender({ s: { status: 'signed-out', failed: true } });
    expect(mocks.reset).not.toHaveBeenCalled();
  });

  it('does not reset while pending then signed in', () => {
    const { rerender } = renderHook(({ s }) => useSignInAnalytics(s), {
      initialProps: { s: { status: 'pending' } as SessionState },
    });
    rerender({ s: signedIn('u1') });
    expect(mocks.reset).not.toHaveBeenCalled();
    expect(mocks.identify).toHaveBeenCalledTimes(1);
  });

  it('identifies, then resets when the session turns signed out', () => {
    const { rerender } = renderHook(({ s }) => useSignInAnalytics(s), {
      initialProps: { s: signedIn('u1') as SessionState },
    });
    rerender({ s: { status: 'signed-out', failed: false } });
    expect(mocks.identify).toHaveBeenCalledTimes(1);
    expect(mocks.reset).toHaveBeenCalledTimes(1);
    expect(mocks.identify.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.reset.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('does not identify again on a re-render with the same id', () => {
    const { rerender } = renderHook(({ s }) => useSignInAnalytics(s), {
      initialProps: { s: signedIn('u1') },
    });
    rerender({ s: signedIn('u1') });
    expect(mocks.identify).toHaveBeenCalledTimes(1);
  });

  it('identifies a different user after the id changes', () => {
    const { rerender } = renderHook(({ s }) => useSignInAnalytics(s), {
      initialProps: { s: signedIn('u1') },
    });
    rerender({ s: signedIn('u2') });
    expect(mocks.identify).toHaveBeenLastCalledWith('u2', { signedIn: false });
  });
});
