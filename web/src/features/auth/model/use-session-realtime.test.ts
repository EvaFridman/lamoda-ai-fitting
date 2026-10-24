import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useRealtimeConnection = vi.hoisted(() => vi.fn());

vi.mock('@/shared/realtime', () => ({ useRealtimeConnection }));

import type { SessionState } from '@/entities/session';

import { useSessionRealtime } from './use-session-realtime';

const signedIn = (id: string): SessionState => ({
  status: 'signed-in',
  user: { id, email: `${id}@example.com`, name: null },
});

function lastArgument(): unknown {
  return useRealtimeConnection.mock.calls.at(-1)![0];
}

beforeEach(() => {
  useRealtimeConnection.mockReset();
});

describe('useSessionRealtime', () => {
  it('gives the user id of a signed-in session', () => {
    renderHook(() => useSessionRealtime(signedIn('u1')));
    expect(lastArgument()).toBe('u1');
  });

  it('gives null for a real sign-out', () => {
    renderHook(() => useSessionRealtime({ status: 'signed-out', failed: false }));
    expect(lastArgument()).toBeNull();
  });

  it('gives undefined for a failed read, which is not an end', () => {
    renderHook(() => useSessionRealtime({ status: 'signed-out', failed: true }));
    expect(lastArgument()).toBeUndefined();
  });

  it('gives undefined while the session loads', () => {
    renderHook(() => useSessionRealtime({ status: 'pending' }));
    expect(lastArgument()).toBeUndefined();
  });

  it('gives the new id when another user signs in with no sign-out between', () => {
    const { rerender } = renderHook(({ session }) => useSessionRealtime(session), {
      initialProps: { session: signedIn('u1') as SessionState },
    });
    rerender({ session: signedIn('u2') });
    expect(lastArgument()).toBe('u2');
  });
});
