import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fittingRoomKeys } from './keys';
import { useFittingRoom } from './queries';

const fetchMock = vi.fn();

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ items: [], count: 0, sum: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fittingRoomKeys', () => {
  it('starts with the user keys, so the end of a session drops the room (U22)', () => {
    expect(fittingRoomKeys.all.slice(0, 1)).toEqual(['users']);
  });
});

describe('useFittingRoom', () => {
  it('reads the room of the signed-in user', async () => {
    const { wrapper: Wrapper } = wrapper();

    const { result } = renderHook(() => useFittingRoom(true), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.data).toEqual({ items: [], count: 0, sum: 0 }));
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).pathname).toBe('/api/me/fitting-room');
  });

  it('reads nothing while nobody is signed in', () => {
    const { wrapper: Wrapper } = wrapper();

    const { result } = renderHook(() => useFittingRoom(false), { wrapper: Wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is the cache entry the writes fill', async () => {
    const { client, wrapper: Wrapper } = wrapper();
    client.setQueryData(fittingRoomKeys.all, { items: [], count: 0, sum: 7 });

    const { result } = renderHook(() => useFittingRoom(false), { wrapper: Wrapper });

    expect(result.current.data?.sum).toBe(7);
  });
});
