import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeSocket {
  onAny: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({
  sockets: [] as unknown[],
  io: vi.fn(),
}));

vi.mock('socket.io-client', () => ({ io: mocks.io }));

import {
  connectRealtime,
  disconnectRealtime,
  onRealtimeEvent,
  type RealtimeEvent,
} from './connection';

function sockets(): FakeSocket[] {
  return mocks.sockets as FakeSocket[];
}

// Sends a push as the socket would: through the handler given to `onAny`.
function emit(socket: FakeSocket, name: string, payload: unknown): void {
  expect(socket.onAny).toHaveBeenCalledTimes(1);
  (socket.onAny.mock.calls[0]![0] as (name: string, payload: unknown) => void)(name, payload);
}

async function connected(userId: string): Promise<FakeSocket> {
  const before = sockets().length;
  connectRealtime(userId);
  await vi.waitFor(() => expect(sockets()).toHaveLength(before + 1));
  return sockets()[before]!;
}

interface Ping {
  id: string;
}

// A test event of the transport's own: shared code knows no slice's push.
const ping: RealtimeEvent<Ping> = {
  name: 'test:ping',
  parse: (payload) =>
    typeof payload === 'object' &&
    payload !== null &&
    'id' in payload &&
    typeof payload.id === 'string'
      ? { id: payload.id }
      : null,
  key: (value) => value.id,
};

// The same name, with no key: every push is delivered.
const loud: RealtimeEvent<Ping> = { name: 'test:ping', parse: ping.parse };

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
  vi.unstubAllEnvs();
});

describe('connectRealtime', () => {
  it('opens one socket on the site origin with the session cookie', async () => {
    await connected('u1');
    expect(mocks.io).toHaveBeenCalledTimes(1);
    expect(mocks.io).toHaveBeenCalledWith({
      path: '/socket.io',
      withCredentials: true,
      transports: ['polling', 'websocket'],
      upgrade: true,
      addTrailingSlash: true,
      reconnection: true,
    });
  });

  it('stays on polling without the trailing slash under next dev', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    await connected('u1');
    expect(mocks.io).toHaveBeenCalledWith(
      expect.objectContaining({ upgrade: false, addTrailingSlash: false }),
    );
  });

  it('opens nothing new for the same user', async () => {
    await connected('u1');
    connectRealtime('u1');
    await vi.dynamicImportSettled();
    expect(mocks.io).toHaveBeenCalledTimes(1);
    expect(sockets()[0]!.disconnect).not.toHaveBeenCalled();
  });

  it('closes the first socket and opens a second for another user', async () => {
    const first = await connected('u1');
    const second = await connected('u2');
    expect(first.disconnect).toHaveBeenCalledTimes(1);
    expect(second.disconnect).not.toHaveBeenCalled();
    expect(mocks.io).toHaveBeenCalledTimes(2);
  });

  it('opens a socket again after a disconnect', async () => {
    await connected('u1');
    disconnectRealtime();
    await connected('u1');
    expect(mocks.io).toHaveBeenCalledTimes(2);
  });

  it('opens nothing when it is closed before the client has loaded', async () => {
    connectRealtime('u1');
    disconnectRealtime();
    await vi.dynamicImportSettled();
    expect(mocks.io).not.toHaveBeenCalled();
  });
});

describe('disconnectRealtime', () => {
  it('disconnects the open socket', async () => {
    const socket = await connected('u1');
    disconnectRealtime();
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
  });

  it('does nothing with no connection', () => {
    expect(() => disconnectRealtime()).not.toThrow();
  });
});

describe('onRealtimeEvent', () => {
  it('delivers the parsed value of its event name', async () => {
    const listener = vi.fn();
    const off = onRealtimeEvent(ping, listener);
    emit(await connected('u1'), 'test:ping', { id: 'a', extra: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ id: 'a' });
    off();
  });

  it('never delivers an event of another name', async () => {
    const listener = vi.fn();
    const off = onRealtimeEvent(ping, listener);
    emit(await connected('u1'), 'test:other', { id: 'a' });
    expect(listener).not.toHaveBeenCalled();
    off();
  });

  it.each([
    ['null', null],
    ['a string payload', '{"id":"a"}'],
    ['a payload the parser refuses', { id: 1 }],
  ])('drops %s', async (_name, raw) => {
    const listener = vi.fn();
    const off = onRealtimeEvent(ping, listener);
    emit(await connected('u1'), 'test:ping', raw);
    expect(listener).not.toHaveBeenCalled();
    off();
  });

  it('delivers a keyed value once per connection, another key again', async () => {
    const listener = vi.fn();
    const off = onRealtimeEvent(ping, listener);
    const socket = await connected('u1');
    emit(socket, 'test:ping', { id: 'a' });
    emit(socket, 'test:ping', { id: 'a' });
    expect(listener).toHaveBeenCalledTimes(1);
    emit(socket, 'test:ping', { id: 'b' });
    expect(listener).toHaveBeenCalledTimes(2);
    off();
  });

  it('delivers every push of an event with no key', async () => {
    const listener = vi.fn();
    const off = onRealtimeEvent(loud, listener);
    const socket = await connected('u1');
    emit(socket, 'test:ping', { id: 'a' });
    emit(socket, 'test:ping', { id: 'a' });
    expect(listener).toHaveBeenCalledTimes(2);
    off();
  });

  it('gives a push to every listener of it, then marks it seen', async () => {
    const one = vi.fn();
    const two = vi.fn();
    const offOne = onRealtimeEvent(ping, one);
    const offTwo = onRealtimeEvent(ping, two);
    const socket = await connected('u1');
    emit(socket, 'test:ping', { id: 'a' });
    expect(one).toHaveBeenCalledTimes(1);
    expect(two).toHaveBeenCalledTimes(1);
    emit(socket, 'test:ping', { id: 'a' });
    expect(one).toHaveBeenCalledTimes(1);
    expect(two).toHaveBeenCalledTimes(1);
    offOne();
    offTwo();
  });

  it('delivers a key again after the user changed', async () => {
    const listener = vi.fn();
    const off = onRealtimeEvent(ping, listener);
    emit(await connected('u1'), 'test:ping', { id: 'a' });
    emit(await connected('u2'), 'test:ping', { id: 'a' });
    expect(listener).toHaveBeenCalledTimes(2);
    off();
  });

  it('forgets the oldest key past 200', async () => {
    const listener = vi.fn();
    const off = onRealtimeEvent(ping, listener);
    const socket = await connected('u1');
    for (let i = 0; i <= 200; i += 1) emit(socket, 'test:ping', { id: `k${i}` });
    expect(listener).toHaveBeenCalledTimes(201);
    emit(socket, 'test:ping', { id: 'k200' });
    expect(listener).toHaveBeenCalledTimes(201);
    emit(socket, 'test:ping', { id: 'k0' });
    expect(listener).toHaveBeenCalledTimes(202);
    off();
  });

  it('keeps its subscriptions across connections', async () => {
    const listener = vi.fn();
    const off = onRealtimeEvent(ping, listener);
    await connected('u1');
    disconnectRealtime();
    emit(await connected('u2'), 'test:ping', { id: 'a' });
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });

  it('stops delivering after the unsubscribe', async () => {
    const listener = vi.fn();
    const off = onRealtimeEvent(ping, listener);
    const socket = await connected('u1');
    off();
    emit(socket, 'test:ping', { id: 'a' });
    expect(listener).not.toHaveBeenCalled();
  });
});
