import { createServer, type Server, type Socket } from 'node:net';
import type { AddressInfo } from 'node:net';

import { Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { FallbackThrottlerStorage } from './fallback-throttler-storage.js';

// A real ioredis client over a local TCP server that answers the connection handshake and then
// goes silent: the Redis that "holds the connection but does not answer" of spec 0006 F28.
// No Docker: the server is a few lines of RESP.

// Reads RESP arrays of bulk strings ("*2\r\n$4\r\nINFO\r\n...") and returns the argument lists.
function parseCommands(buffer: string): { commands: string[][]; rest: string } {
  const commands: string[][] = [];
  let rest = buffer;
  for (;;) {
    const header = /^\*(\d+)\r\n/.exec(rest);
    if (!header) break;
    let pos = header[0].length;
    const args: string[] = [];
    let complete = true;
    for (let i = 0; i < Number(header[1]); i++) {
      const bulk = /^\$(\d+)\r\n/.exec(rest.slice(pos));
      if (!bulk) {
        complete = false;
        break;
      }
      const start = pos + bulk[0].length;
      const end = start + Number(bulk[1]);
      if (rest.length < end + 2) {
        complete = false;
        break;
      }
      args.push(rest.slice(start, end));
      pos = end + 2;
    }
    if (!complete) break;
    commands.push(args);
    rest = rest.slice(pos);
  }
  return { commands, rest };
}

describe('FallbackThrottlerStorage over a Redis that stops answering', () => {
  let server: Server;
  let redis: Redis;
  let storage: FallbackThrottlerStorage;
  const sockets = new Set<Socket>();
  const received: string[] = [];
  let silent = false;

  beforeAll(async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    server = createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.on('error', () => undefined);
      let pending = '';
      socket.on('data', (chunk) => {
        const parsed = parseCommands(pending + chunk.toString('latin1'));
        pending = parsed.rest;
        for (const args of parsed.commands) {
          received.push(args[0]?.toUpperCase() ?? '');
          if (silent) continue;
          // INFO is the ready check; the rest of the handshake (CLIENT SETINFO...) takes +OK.
          if (args[0]?.toUpperCase() === 'INFO') {
            socket.write('$11\r\nloading:0\r\n\r\n');
          } else {
            socket.write('+OK\r\n');
          }
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    // The options of RedisModule.
    redis = new Redis(`redis://127.0.0.1:${port}`, {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
      commandTimeout: 1000,
    });
    redis.on('error', () => undefined);
    await vi.waitFor(() => expect(redis.status).toBe('ready'), { timeout: 2000 });

    storage = new FallbackThrottlerStorage(redis);
  });

  afterAll(async () => {
    storage.onApplicationShutdown();
    redis.disconnect();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    vi.restoreAllMocks();
  });

  it('counts the first request in memory after the command timeout, then the following ones at once', async () => {
    silent = true;
    const before = received.length;

    const startedAt = performance.now();
    const first = await storage.increment('k', 60_000, 10, 0, 'read-minute');
    const firstTook = performance.now() - startedAt;

    expect(first.totalHits).toBe(1);
    expect(firstTook).toBeGreaterThanOrEqual(900);
    expect(firstTook).toBeLessThan(3000);
    const afterFirst = received.length;
    expect(afterFirst).toBeGreaterThan(before);

    const nextStartedAt = performance.now();
    const second = await storage.increment('k', 60_000, 10, 0, 'read-minute');
    const third = await storage.increment('k', 60_000, 10, 0, 'read-burst');
    const nextTook = performance.now() - nextStartedAt;

    expect([second.totalHits, third.totalHits]).toEqual([2, 1]);
    expect(nextTook).toBeLessThan(500);
    expect(received.length).toBe(afterFirst);
  });
});
