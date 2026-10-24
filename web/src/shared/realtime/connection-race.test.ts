import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ io: vi.fn() }));

vi.mock('socket.io-client', () => ({ io: mocks.io }));

import { connectRealtime, disconnectRealtime } from './connection';

describe('connectRealtime while the client is still loading', () => {
  it('opens only the last user when another one signs in before it loaded', async () => {
    const socket = { onAny: vi.fn(), disconnect: vi.fn() };
    mocks.io.mockImplementation(() => socket);

    connectRealtime('u1');
    connectRealtime('u2');
    await vi.waitFor(() => expect(mocks.io).toHaveBeenCalled());
    await vi.dynamicImportSettled();

    expect(mocks.io).toHaveBeenCalledTimes(1);
    // The connection is u2's: the same user opens nothing new.
    connectRealtime('u2');
    await vi.dynamicImportSettled();
    expect(mocks.io).toHaveBeenCalledTimes(1);
    disconnectRealtime();
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
  });
});
