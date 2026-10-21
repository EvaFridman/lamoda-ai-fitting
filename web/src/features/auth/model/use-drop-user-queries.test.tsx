import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { SessionState } from '@/entities/session';
import { userKeys } from '@/entities/user';

import { useDropUserQueries } from './use-drop-user-queries';

const signedIn = (id: string): SessionState => ({
  status: 'signed-in',
  user: { id, email: `${id}@example.com`, name: null },
});

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe('useDropUserQueries', () => {
  it('resets the own-data queries when another user is signed in with no sign-out between', () => {
    const { queryClient, wrapper } = setup();
    const { rerender } = renderHook(({ session }) => useDropUserQueries(session), {
      wrapper,
      initialProps: { session: signedIn('a') as SessionState },
    });
    queryClient.setQueryData(userKeys.me, { id: 'a' });
    rerender({ session: signedIn('b') });
    expect(queryClient.getQueryData(userKeys.me)).toBeUndefined();
  });

  it('reads an active query again after the reset', async () => {
    const { wrapper } = setup();
    const read = vi.fn(() => Promise.resolve({ id: 'b' }));
    const { rerender } = renderHook(
      ({ session }) => {
        useDropUserQueries(session);
        return useQuery({ queryKey: userKeys.me, queryFn: read });
      },
      { wrapper, initialProps: { session: signedIn('a') as SessionState } },
    );
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    rerender({ session: signedIn('b') });
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  });

  it('keeps them when the same user is signed in again', () => {
    const { queryClient, wrapper } = setup();
    const { rerender } = renderHook(({ session }) => useDropUserQueries(session), {
      wrapper,
      initialProps: { session: signedIn('a') as SessionState },
    });
    queryClient.setQueryData(userKeys.me, { id: 'a' });
    rerender({ session: signedIn('a') });
    expect(queryClient.getQueryData(userKeys.me)).toEqual({ id: 'a' });
  });

  it('does not reset on the first signed-in after pending', () => {
    const { queryClient, wrapper } = setup();
    queryClient.setQueryData(userKeys.me, { id: 'a' });
    const { rerender } = renderHook(({ session }) => useDropUserQueries(session), {
      wrapper,
      initialProps: { session: { status: 'pending' } as SessionState },
    });
    rerender({ session: signedIn('a') });
    expect(queryClient.getQueryData(userKeys.me)).toEqual({ id: 'a' });
  });

  it('removes them at a real sign-out, but not at a failed read', () => {
    const { queryClient, wrapper } = setup();
    const { rerender } = renderHook(({ session }) => useDropUserQueries(session), {
      wrapper,
      initialProps: { session: signedIn('a') as SessionState },
    });
    queryClient.setQueryData(userKeys.me, { id: 'a' });
    rerender({ session: { status: 'signed-out', failed: true } });
    expect(queryClient.getQueryData(userKeys.me)).toEqual({ id: 'a' });
    rerender({ session: { status: 'signed-out', failed: false } });
    expect(queryClient.getQueryData(userKeys.me)).toBeUndefined();
  });
});
