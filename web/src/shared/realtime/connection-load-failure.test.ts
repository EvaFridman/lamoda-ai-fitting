import { describe, expect, it, vi } from 'vitest';

vi.mock('socket.io-client', () => {
  throw new Error('chunk failed to load');
});

import { connectRealtime, disconnectRealtime } from './connection';

describe('connectRealtime when the client fails to load', () => {
  it('opens nothing and throws nothing', async () => {
    expect(() => connectRealtime('u1')).not.toThrow();
    await vi.dynamicImportSettled();
    expect(() => disconnectRealtime()).not.toThrow();
  });
});
