import { createServer } from 'node:http';

import { describe, expect, it } from 'vitest';

import { SERVER_TIMEOUTS, setServerTimeouts } from './server-timeouts.js';

describe('setServerTimeouts', () => {
  it('sets the keep-alive, headers and request timeouts on the server', () => {
    const server = createServer();

    setServerTimeouts(server);

    expect(server.keepAliveTimeout).toBe(65_000);
    expect(server.headersTimeout).toBe(30_000);
    expect(server.requestTimeout).toBe(30_000);
    expect(SERVER_TIMEOUTS).toEqual({
      keepAliveTimeout: 65_000,
      headersTimeout: 30_000,
      requestTimeout: 30_000,
    });
  });

  it('keeps headersTimeout at most requestTimeout, as Node requires', () => {
    expect(SERVER_TIMEOUTS.headersTimeout).toBeLessThanOrEqual(SERVER_TIMEOUTS.requestTimeout);
  });

  it('keeps keepAliveTimeout above the 60 s nginx keeps idle upstream sockets', () => {
    expect(SERVER_TIMEOUTS.keepAliveTimeout).toBeGreaterThan(60_000);
  });

  it('is accepted by http.createServer, which validates the combination', () => {
    const { headersTimeout, requestTimeout, keepAliveTimeout } = SERVER_TIMEOUTS;

    const server = createServer({ headersTimeout, requestTimeout, keepAliveTimeout });

    expect(server.headersTimeout).toBe(headersTimeout);
    expect(server.requestTimeout).toBe(requestTimeout);
    expect(server.keepAliveTimeout).toBe(keepAliveTimeout);
  });
});
