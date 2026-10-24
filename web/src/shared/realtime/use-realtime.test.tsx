import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeSocket {
  onAny: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({ sockets: [] as unknown[], io: vi.fn() }));

vi.mock('socket.io-client', () => ({ io: mocks.io }));

import { disconnectRealtime, type RealtimeEvent } from './connection';
import { useRealtimeConnection, useRealtimeEvent } from './use-realtime';

function sockets(): FakeSocket[] {
  return mocks.sockets as FakeSocket[];
}

function emit(socket: FakeSocket, name: string, payload: unknown): void {
  (socket.onAny.mock.calls[0]![0] as (name: string, payload: unknown) => void)(name, payload);
}

const parse = (payload: unknown): { id: string } | null =>
  typeof payload === 'object' &&
  payload !== null &&
  'id' in payload &&
  typeof payload.id === 'string'
    ? { id: payload.id }
    : null;

const ping: RealtimeEvent<{ id: string }> = { name: 'test:ping', parse };
const pong: RealtimeEvent<{ id: string }> = { name: 'test:pong', parse };

beforeEach(() => {
  mocks.sockets.length = 0;
  mocks.io.mockReset();
  mocks.io.mockImplementation(() => {
    const socket: FakeSocket = { onAny: vi.fn(), disconnect: vi.fn() };
    mocks.sockets.push(socket);
    return socket;
  });
});

afterEach(() => {
  disconnectRealtime();
});

describe('useRealtimeConnection', () => {
  it('opens a connection for a user id', async () => {
    renderHook(() => useRealtimeConnection('u1'));
    await vi.waitFor(() => expect(sockets()).toHaveLength(1));
  });

  it('opens again for another user id, closing the first', async () => {
    const { rerender } = renderHook(({ id }) => useRealtimeConnection(id), {
      initialProps: { id: 'u1' as string | null | undefined },
    });
    await vi.waitFor(() => expect(sockets()).toHaveLength(1));
    rerender({ id: 'u2' });
    await vi.waitFor(() => expect(sockets()).toHaveLength(2));
    expect(sockets()[0]!.disconnect).toHaveBeenCalledTimes(1);
    expect(sockets()[1]!.disconnect).not.toHaveBeenCalled();
  });

  it('closes on null', async () => {
    const { rerender } = renderHook(({ id }) => useRealtimeConnection(id), {
      initialProps: { id: 'u1' as string | null | undefined },
    });
    await vi.waitFor(() => expect(sockets()).toHaveLength(1));
    rerender({ id: null });
    expect(sockets()[0]!.disconnect).toHaveBeenCalledTimes(1);
  });

  it('leaves an open connection as it is on undefined', async () => {
    const { rerender } = renderHook(({ id }) => useRealtimeConnection(id), {
      initialProps: { id: 'u1' as string | null | undefined },
    });
    await vi.waitFor(() => expect(sockets()).toHaveLength(1));
    rerender({ id: undefined });
    await vi.dynamicImportSettled();
    expect(sockets()[0]!.disconnect).not.toHaveBeenCalled();
    expect(sockets()).toHaveLength(1);
  });

  it('opens nothing while the id is undefined', async () => {
    renderHook(() => useRealtimeConnection(undefined));
    await vi.dynamicImportSettled();
    expect(mocks.io).not.toHaveBeenCalled();
  });

  it('closes on unmount', async () => {
    const { unmount } = renderHook(() => useRealtimeConnection('u1'));
    await vi.waitFor(() => expect(sockets()).toHaveLength(1));
    unmount();
    expect(sockets()[0]!.disconnect).toHaveBeenCalledTimes(1);
  });
});

describe('useRealtimeEvent', () => {
  it('calls the latest listener with a push', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ listener }) => {
        useRealtimeConnection('u1');
        useRealtimeEvent(ping, listener);
      },
      { initialProps: { listener: first } },
    );
    await vi.waitFor(() => expect(sockets()).toHaveLength(1));
    rerender({ listener: second });
    emit(sockets()[0]!, 'test:ping', { id: 'a' });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ id: 'a' });
  });

  it('stops on unmount', async () => {
    const listener = vi.fn();
    const connection = renderHook(() => useRealtimeConnection('u1'));
    const { unmount } = renderHook(() => useRealtimeEvent(ping, listener));
    await vi.waitFor(() => expect(sockets()).toHaveLength(1));
    unmount();
    emit(sockets()[0]!, 'test:ping', { id: 'a' });
    expect(listener).not.toHaveBeenCalled();
    connection.unmount();
  });

  it('follows the event when it changes', async () => {
    const listener = vi.fn();
    const connection = renderHook(() => useRealtimeConnection('u1'));
    const { rerender } = renderHook(({ event }) => useRealtimeEvent(event, listener), {
      initialProps: { event: ping },
    });
    await vi.waitFor(() => expect(sockets()).toHaveLength(1));
    rerender({ event: pong });
    emit(sockets()[0]!, 'test:ping', { id: 'a' });
    expect(listener).not.toHaveBeenCalled();
    emit(sockets()[0]!, 'test:pong', { id: 'b' });
    expect(listener).toHaveBeenCalledWith({ id: 'b' });
    connection.unmount();
  });
});
