import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fittingKeys } from './keys';
import { setUnseenCount, useMarkAllFittingsSeen, useMarkFittingSeen, useUnseenCount } from './seen';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

const ID_A = '00000000-0000-4000-8000-0000000000a1';
const ID_B = '00000000-0000-4000-8000-0000000000a2';
const fetchMock = vi.fn();

function quotaBody(unseen: number) {
  return {
    limit: 20,
    used: 3,
    left: 17,
    renewsAt: '2026-10-31T21:00:00.000Z',
    unseen,
  };
}

function answer(status: number) {
  return Promise.resolve(
    status === 204
      ? new Response(null, { status })
      : new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'm', details: [] } }), {
          status,
        }),
  );
}

function seenCalls() {
  return fetchMock.mock.calls
    .map(([url, init]) => ({ path: new URL(String(url)).pathname, init: init as RequestInit }))
    .filter(({ path }) => path.endsWith('/seen'));
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function cacheQuota(unseen: number) {
  queryClient.setQueryData(fittingKeys.quota, quotaBody(unseen));
}

function cached(): number | undefined {
  return queryClient.getQueryData<{ unseen: number }>(fittingKeys.quota)?.unseen;
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => answer(204));
  vi.stubGlobal('fetch', fetchMock);
});

describe('useUnseenCount', () => {
  it('reads the quota’s unseen', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(quotaBody(4)), {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const { result } = renderHook(() => useUnseenCount(), { wrapper });

    expect(result.current).toBe(0);
    await vi.waitFor(() => expect(result.current).toBe(4));
  });

  it('is 0 and reads nothing while disabled', async () => {
    const { result } = renderHook(() => useUnseenCount(false), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is 0 when the read fails', async () => {
    fetchMock.mockImplementation(() => answer(404));

    const { result } = renderHook(() => useUnseenCount(), { wrapper });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe(0);
  });
});

describe('setUnseenCount', () => {
  it('changes the cached count by the function', () => {
    cacheQuota(2);

    setUnseenCount(queryClient, (unseen) => unseen + 1);

    expect(cached()).toBe(3);
    expect(queryClient.getQueryData<{ left: number }>(fittingKeys.quota)?.left).toBe(17);
  });

  it('never goes below 0', () => {
    cacheQuota(1);

    setUnseenCount(queryClient, (unseen) => unseen - 5);

    expect(cached()).toBe(0);
  });

  it('does nothing without a cached quota', () => {
    setUnseenCount(queryClient, (unseen) => unseen + 1);

    expect(queryClient.getQueryData(fittingKeys.quota)).toBeUndefined();
  });
});

describe('useMarkFittingSeen', () => {
  it('sends POST /fittings/:id/seen once, then reads the quota again while it counts any', async () => {
    cacheQuota(2);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    const { rerender } = renderHook(({ id }) => useMarkFittingSeen(id), {
      wrapper,
      initialProps: { id: ID_A as string | null },
    });
    rerender({ id: ID_A });

    await vi.waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: fittingKeys.quota }),
    );
    expect(seenCalls()).toHaveLength(1);
    expect(seenCalls()[0]?.path).toBe(`/api/fittings/${ID_A}/seen`);
    expect(seenCalls()[0]?.init.method).toBe('POST');
  });

  it.each([
    ['the cached count is 0', 0],
    ['no quota is cached', null],
  ])('does not read the quota again when %s', async (_name, unseen) => {
    if (unseen !== null) cacheQuota(unseen);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    renderHook(() => useMarkFittingSeen(ID_A), { wrapper });

    await vi.waitFor(() => expect(seenCalls()).toHaveLength(1));
    await act(async () => {
      await Promise.resolve();
    });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('reads the quota again at count 0 when a read counted before the write is in flight', async () => {
    cacheQuota(0);
    void queryClient.fetchQuery({
      queryKey: fittingKeys.quota,
      queryFn: () => new Promise<never>(() => undefined),
      staleTime: 0,
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    renderHook(() => useMarkFittingSeen(ID_A), { wrapper });

    await vi.waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: fittingKeys.quota }),
    );
  });

  it('sends nothing for null', async () => {
    renderHook(() => useMarkFittingSeen(null), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends again for another id', async () => {
    const { rerender } = renderHook(({ id }) => useMarkFittingSeen(id), {
      wrapper,
      initialProps: { id: ID_A as string | null },
    });
    await vi.waitFor(() => expect(seenCalls()).toHaveLength(1));

    rerender({ id: ID_B });

    await vi.waitFor(() => expect(seenCalls()).toHaveLength(2));
    expect(seenCalls().map(({ path }) => path)).toEqual([
      `/api/fittings/${ID_A}/seen`,
      `/api/fittings/${ID_B}/seen`,
    ]);
  });

  it('does not send an id again after another one', async () => {
    const { rerender } = renderHook(({ id }) => useMarkFittingSeen(id), {
      wrapper,
      initialProps: { id: ID_A as string | null },
    });
    await vi.waitFor(() => expect(seenCalls()).toHaveLength(1));
    rerender({ id: ID_B });
    await vi.waitFor(() => expect(seenCalls()).toHaveLength(2));

    rerender({ id: ID_A });
    await act(async () => {
      await Promise.resolve();
    });

    expect(seenCalls()).toHaveLength(2);
  });

  it('shows nothing and keeps the count when the write fails, and does not retry', async () => {
    fetchMock.mockImplementation(() => answer(404));
    cacheQuota(2);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    renderHook(() => useMarkFittingSeen(ID_A), { wrapper });

    await vi.waitFor(() => expect(seenCalls()).toHaveLength(1));
    await act(async () => {
      await Promise.resolve();
    });
    expect(invalidate).not.toHaveBeenCalled();
    expect(cached()).toBe(2);
    expect(seenCalls()).toHaveLength(1);
  });
});

describe('useMarkAllFittingsSeen', () => {
  it('makes the cached count 0 at once, sends POST /fittings/seen, then reads the quota again', async () => {
    cacheQuota(4);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    renderHook(() => useMarkAllFittingsSeen(true), { wrapper });

    await vi.waitFor(() => expect(cached()).toBe(0));
    await vi.waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: fittingKeys.quota }),
    );
    expect(seenCalls().map(({ path, init }) => [path, init.method])).toEqual([
      ['/api/fittings/seen', 'POST'],
    ]);
  });

  it('does nothing while disabled, and acts once it is enabled', async () => {
    cacheQuota(4);
    const { rerender } = renderHook(({ enabled }) => useMarkAllFittingsSeen(enabled), {
      wrapper,
      initialProps: { enabled: false },
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cached()).toBe(4);

    rerender({ enabled: true });

    await vi.waitFor(() => expect(seenCalls()).toHaveLength(1));
    await vi.waitFor(() => expect(cached()).toBe(0));
  });

  it('marks again each time it mounts again (a page kept hidden and shown again)', async () => {
    cacheQuota(4);
    const first = renderHook(() => useMarkAllFittingsSeen(true), { wrapper });
    await vi.waitFor(() => expect(seenCalls()).toHaveLength(1));
    first.unmount();
    cacheQuota(2);

    renderHook(() => useMarkAllFittingsSeen(true), { wrapper });

    await vi.waitFor(() => expect(seenCalls()).toHaveLength(2));
    await vi.waitFor(() => expect(cached()).toBe(0));
  });

  it('does not let a quota read on its way bring the old count back', async () => {
    let answerOld: (response: Response) => void = () => undefined;
    let quotaReads = 0;
    const body = (unseen: number) =>
      new Response(JSON.stringify(quotaBody(unseen)), {
        headers: { 'Content-Type': 'application/json' },
      });
    fetchMock.mockImplementation((url: string) => {
      const { pathname } = new URL(String(url));
      if (pathname === '/api/fittings/seen') return answer(204);
      quotaReads += 1;
      return quotaReads === 1
        ? new Promise<Response>((resolve) => {
            answerOld = resolve;
          })
        : Promise.resolve(body(0));
    });

    const { result } = renderHook(
      () => {
        const unseen = useUnseenCount();
        useMarkAllFittingsSeen(true);
        return unseen;
      },
      { wrapper },
    );
    await vi.waitFor(() => expect(seenCalls()).toHaveLength(1));
    await vi.waitFor(() => expect(quotaReads).toBe(2));
    await act(async () => {
      answerOld(body(5));
      await Promise.resolve();
    });

    await vi.waitFor(() => expect(cached()).toBe(0));
    expect(result.current).toBe(0);
  });

  it('keeps the zero and reads the quota again when the write fails', async () => {
    fetchMock.mockImplementation(() => answer(404));
    cacheQuota(4);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    renderHook(() => useMarkAllFittingsSeen(true), { wrapper });

    await vi.waitFor(() => expect(seenCalls()).toHaveLength(1));
    await vi.waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: fittingKeys.quota }),
    );
    expect(cached()).toBe(0);
  });

  it('restarts the quota read it cancelled when the write fails', async () => {
    let quotaReads = 0;
    fetchMock.mockImplementation((url: string) => {
      const { pathname } = new URL(String(url));
      if (pathname === '/api/fittings/seen') return answer(404);
      quotaReads += 1;
      return quotaReads === 1
        ? new Promise<Response>(() => undefined)
        : Promise.resolve(
            new Response(JSON.stringify(quotaBody(2)), {
              headers: { 'Content-Type': 'application/json' },
            }),
          );
    });

    const { result } = renderHook(
      () => {
        const unseen = useUnseenCount();
        useMarkAllFittingsSeen(true);
        return unseen;
      },
      { wrapper },
    );

    await vi.waitFor(() => expect(quotaReads).toBe(2));
    await vi.waitFor(() => expect(result.current).toBe(2));
  });
});
