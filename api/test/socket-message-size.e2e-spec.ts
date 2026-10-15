import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Server, ServerOptions } from 'socket.io';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { createHttpApp } from '../src/common/http/http-app.js';
import { SocketIoAdapter } from '../src/realtime/socket-io.adapter.js';

const LIMIT = 1024;

// Sees every packet that reaches a socket after socket.io parsed it, i.e. before the gateway.
// (A spy on the gateway method does not work: Nest reads the handler's metadata off the function.)
const delivered = vi.fn();

class ObservingAdapter extends SocketIoAdapter {
  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options);
    server.on('connection', (socket) => {
      socket.onAny((event: string) => delivered(event));
    });
    return server;
  }
}

// Spec 0006 F8, AC12: a message over SOCKET_MAX_MESSAGE_BYTES closes the connection before the
// gateway sees it.
describe('socket message size limit (e2e)', () => {
  let app: INestApplication;
  let url: string;
  const sockets: Socket[] = [];

  async function connect(): Promise<Socket> {
    const socket = io(url, { transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return socket;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await createHttpApp(
      (adapter, options) =>
        moduleRef.createNestApplication<NestExpressApplication>(adapter, options),
      { logger: false },
    );
    app.useWebSocketAdapter(new ObservingAdapter(app, 'http://localhost:3001', LIMIT));
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });

  afterAll(async () => {
    for (const socket of sockets) socket.close();
    await app.close();
  });

  it('answers pong to a message under the limit', async () => {
    delivered.mockClear();
    const socket = await connect();

    await expect(socket.timeout(2000).emitWithAck('ping', 'x'.repeat(100))).resolves.toBe('pong');
    // proves the observer sees real packets, so "not called" below means something
    expect(delivered).toHaveBeenCalledWith('ping');
  });

  it('closes the socket on a message over the limit and never calls the gateway', async () => {
    delivered.mockClear();
    const socket = await connect();
    const closed = new Promise<string>((resolve) => socket.once('disconnect', resolve));

    socket.emit('ping', 'x'.repeat(LIMIT * 2));

    await expect(closed).resolves.toBeTypeOf('string');
    expect(socket.connected).toBe(false);
    expect(delivered).not.toHaveBeenCalled();
  });

  it('still answers pong on a new connection after an oversize close', async () => {
    const first = await connect();
    const closed = new Promise<string>((resolve) => first.once('disconnect', resolve));
    first.emit('ping', 'x'.repeat(LIMIT * 2));
    await closed;

    const second = await connect();

    await expect(second.timeout(2000).emitWithAck('ping')).resolves.toBe('pong');
  });

  // Binary attachments are refused (spec 0006 F31), even a small one under the limit.
  it('closes the socket on a binary attachment and never calls the gateway', async () => {
    delivered.mockClear();
    const socket = await connect();
    const closed = new Promise<string>((resolve) => socket.once('disconnect', resolve));

    socket.emit('ping', Buffer.alloc(10));

    await expect(closed).resolves.toBeTypeOf('string');
    expect(delivered).not.toHaveBeenCalled();

    const next = await connect();
    await expect(next.timeout(2000).emitWithAck('ping')).resolves.toBe('pong');
  });

  // The first acknowledged emit of a socket has id 0, so the frame is `4` (engine.io message) +
  // `2` (event) + `0` + `["ping","<s>"]`: 14 characters plus s.
  describe('boundary', () => {
    const OVERHEAD = 14;

    it('accepts a packet of exactly the limit', async () => {
      const socket = await connect();

      await expect(
        socket.timeout(2000).emitWithAck('ping', 'x'.repeat(LIMIT - OVERHEAD)),
      ).resolves.toBe('pong');
    });

    it('closes on a packet one byte over the limit', async () => {
      delivered.mockClear();
      const socket = await connect();
      const closed = new Promise<string>((resolve) => socket.once('disconnect', resolve));

      socket.timeout(2000).emit('ping', 'x'.repeat(LIMIT - OVERHEAD + 1), () => undefined);

      await expect(closed).resolves.toBeTypeOf('string');
      expect(delivered).not.toHaveBeenCalled();
    });
  });

  // Raw long-polling session: engine.io handshake, then the socket.io CONNECT packet (`40`) so a
  // socket exists in `/` and the observer can see what reaches it.
  async function pollingSession(): Promise<{
    post: (body: string) => Promise<Response>;
    get: () => Promise<string>;
    sid: string;
  }> {
    const base = `${url}/socket.io/?EIO=4&transport=polling`;
    const handshake = await (await fetch(base)).text();
    const sid = (JSON.parse(handshake.slice(1)) as { sid: string }).sid;
    const target = `${base}&sid=${sid}`;
    const post = (body: string) =>
      fetch(target, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body });
    const get = async () => (await fetch(target)).text();

    expect((await post('40')).status).toBe(200);
    expect(await get()).toMatch(/^40\{"sid":/);
    return { post, get, sid };
  }

  it('answers 413 to an over-limit long-polling message and never calls the gateway', async () => {
    delivered.mockClear();
    const { post } = await pollingSession();

    expect((await post('42["ping"]')).status).toBe(200);
    await vi.waitFor(() => expect(delivered).toHaveBeenCalledWith('ping'));
    delivered.mockClear();

    const response = await post(`42["ping","${'x'.repeat(LIMIT * 2)}"]`);

    expect(response.status).toBe(413);
    expect(delivered).not.toHaveBeenCalled();
  });

  describe('binary headers that announce attachments which never arrive', () => {
    function rawWebSocket(): Promise<WebSocket> {
      const ws = new WebSocket(`${url.replace('http', 'ws')}/socket.io/?EIO=4&transport=websocket`);
      return new Promise((resolve, reject) => {
        ws.addEventListener('message', () => resolve(ws), { once: true });
        ws.addEventListener('error', () => reject(new Error('websocket failed')), { once: true });
      });
    }

    it.each([
      ['one attachment', '451-["ping",{"_placeholder":true,"num":0}]'],
      [
        'ten attachments',
        `4510-["ping",${Array.from({ length: 10 }, (_, num) => `{"_placeholder":true,"num":${num}}`).join(',')}]`,
      ],
    ])('closes a raw websocket on a header with %s', async (_name, header) => {
      delivered.mockClear();
      const ws = await rawWebSocket();
      const closed = new Promise<void>((resolve) =>
        ws.addEventListener('close', () => resolve(), { once: true }),
      );

      ws.send('40');
      ws.send(header);

      await closed;
      expect(delivered).not.toHaveBeenCalled();
    });

    it('ends a long-polling session on such a header', async () => {
      delivered.mockClear();
      const { post, get, sid } = await pollingSession();

      await post('451-["ping",{"_placeholder":true,"num":0}]');

      // engine.io may put a noop (6) ahead of the close packet (1) in the same payload
      expect((await get()).split('\x1e')).toContain('1');
      const later = await fetch(`${url}/socket.io/?EIO=4&transport=polling&sid=${sid}`);
      expect(later.status).toBe(400);
      expect(delivered).not.toHaveBeenCalled();
    });
  });

  it('answers pong to 200 small pings on one connection', async () => {
    const socket = await connect();

    const replies = await Promise.all(
      Array.from({ length: 200 }, () => socket.timeout(5000).emitWithAck('ping')),
    );

    expect(replies).toEqual(Array.from({ length: 200 }, () => 'pong'));
  });
});
