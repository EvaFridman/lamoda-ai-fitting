import type { Server } from 'node:http';

// Node's own timeouts (spec 0006 plan §4), set by server.ts after listen(). nginx keeps idle
// upstream sockets for 60 s (`keepalive 16`), so Node keeps them longer and nginx never reuses a
// socket Node has just closed (Node's 5 s default allows that race).
export const SERVER_TIMEOUTS = {
  keepAliveTimeout: 65_000,
  // The whole request (headers and body) must arrive within it; the handler's own time is limited
  // by REQUEST_TIMEOUT_MS (TimeoutInterceptor). Node checks both every 30 s
  // (connectionsCheckingInterval), so a stalled request is closed with 408 some time after.
  requestTimeout: 30_000,
  // Node requires it to be at most requestTimeout (createServer() throws otherwise).
  headersTimeout: 30_000,
} as const;

export function setServerTimeouts(server: Server): void {
  server.keepAliveTimeout = SERVER_TIMEOUTS.keepAliveTimeout;
  server.headersTimeout = SERVER_TIMEOUTS.headersTimeout;
  server.requestTimeout = SERVER_TIMEOUTS.requestTimeout;
}
