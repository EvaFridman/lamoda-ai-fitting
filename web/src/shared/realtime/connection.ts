import type { Socket } from 'socket.io-client';

import { reportFailure } from '@/shared/api';

// A server push a slice listens for: the socket event's name, how its payload is read (null drops
// it: a newer shape, a value web does not know), and, for an event the server may send twice, the
// key that makes a delivery once per connection. A push only carries ids and a status; what to show
// is read again through the api.
export interface RealtimeEvent<Value> {
  name: string;
  parse: (payload: unknown) => Value | null;
  key?: (value: Value) => string;
}

interface Subscription {
  event: RealtimeEvent<unknown>;
  listener: (value: unknown) => void;
}

interface Connection {
  userId: string;
  socket: Socket | null;
}

// One connection per tab (spec 0019 plan §6), for one signed-in user: the api joins a socket to
// its user's room at the handshake and keeps it there until it closes (A35), so another user's
// session needs a new connection.
let connection: Connection | null = null;
const subscriptions = new Set<Subscription>();

// The keys already delivered on this connection, as `<event> <key>`. Bounded; the oldest go first.
const SEEN_MAX = 200;
const seen = new Set<string>();

function dispatch(name: string, payload: unknown): void {
  // Every listener of a push gets it; the key is marked seen after all of them.
  const delivered = new Set<string>();
  for (const { event, listener } of subscriptions) {
    if (event.name !== name) continue;
    const value = event.parse(payload);
    if (value === null) continue;
    const key = event.key === undefined ? undefined : `${name} ${event.key(value)}`;
    if (key !== undefined && seen.has(key)) continue;
    if (key !== undefined) delivered.add(key);
    // A listener that throws neither keeps the push from the others nor lets it come again.
    try {
      listener(value);
    } catch (error) {
      reportFailure(error);
    }
  }
  for (const key of delivered) {
    seen.add(key);
    if (seen.size > SEEN_MAX) seen.delete(seen.values().next().value as string);
  }
}

// The client loads with the first connection, so a visitor who never signs in never downloads it.
// One load per tab, shared by the connections that wait for it. A failed load leaves this
// connection without pushes, which cost nothing (spec 0019 A44): not reported, and the next
// connection loads it again.
let client: Promise<typeof import('socket.io-client')> | null = null;

async function open(target: Connection): Promise<void> {
  client ??= import('socket.io-client');
  let io: typeof import('socket.io-client').io;
  try {
    ({ io } = await client);
  } catch {
    client = null;
    return;
  }
  if (connection !== target) return;
  const development = process.env.NODE_ENV === 'development';
  // The site's own origin (the CSP's `connect-src 'self'`); the session cookie goes with it.
  // Long-polling first, then WebSocket, which nginx upgrades in production. `next dev`'s rewrite
  // carries long-polling only and cannot keep the trailing slash of `/socket.io/` (Next redirects
  // it away), so there the client stays on polling and asks for `/socket.io`.
  const socket = io({
    path: '/socket.io',
    withCredentials: true,
    transports: ['polling', 'websocket'],
    upgrade: !development,
    addTrailingSlash: !development,
    reconnection: true,
  });
  socket.onAny((name: string, payload: unknown) => dispatch(name, payload));
  target.socket = socket;
}

// Opens the connection of this user, closing another user's first. The same user's open
// connection stays as it is.
export function connectRealtime(userId: string): void {
  if (connection?.userId === userId) return;
  disconnectRealtime();
  seen.clear();
  connection = { userId, socket: null };
  void open(connection);
}

export function disconnectRealtime(): void {
  connection?.socket?.disconnect();
  connection = null;
}

// Calls `listener` with each push of `event` the connected user gets, once per key when the event
// has one. Returns the unsubscribe. Subscriptions stay across connections.
export function onRealtimeEvent<Value>(
  event: RealtimeEvent<Value>,
  listener: (value: Value) => void,
): () => void {
  const subscription: Subscription = {
    event: event as RealtimeEvent<unknown>,
    listener: listener as (value: unknown) => void,
  };
  subscriptions.add(subscription);
  return () => {
    subscriptions.delete(subscription);
  };
}
