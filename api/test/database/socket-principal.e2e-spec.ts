import { type INestApplication, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Server, ServerOptions } from 'socket.io';
import { io, type ManagerOptions, type Socket, type SocketOptions } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Auth } from '../../src/auth/auth.js';
import { AUTH, SESSION_READER } from '../../src/auth/auth.module.js';
import { sessionReader } from '../../src/auth/session-reader.js';
import { SessionUnavailableError } from '../../src/common/errors/app.exception.js';
import type { SessionReader } from '../../src/common/http/request-context.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { SocketIoAdapter } from '../../src/realtime/socket-io.adapter.js';
import { signIn } from '../support/sign-in.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

// The ESM namespace cannot be spied on, so the module is mocked, keeping the rest of Sentry.
vi.mock('@sentry/nestjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/nestjs')>()),
  captureException: vi.fn(),
}));

let ioServer: Server | undefined;

class CapturingAdapter extends SocketIoAdapter {
  override createIOServer(port: number, options?: ServerOptions): Server {
    ioServer = super.createIOServer(port, options);
    return ioServer;
  }
}

// Spec 0013 AC10, plan §7: the socket gateway recognises a signed-in user from the session cookie.
describe('socket principal (database e2e)', () => {
  let testApp: TestApp;
  let app: INestApplication;
  let prisma: PrismaClient;
  let url: string;
  let failWith: Error | undefined;
  // The HTTP request context's reads, and the sockets' (the adapter's share of the same reader).
  const reader = vi.fn<SessionReader>();
  const socketReader = vi.fn<SessionReader>();
  const hungCookies = new Set<string>();
  const hung: (() => void)[] = [];
  const sockets: Socket[] = [];

  async function connect(
    options: Partial<ManagerOptions & SocketOptions> = {},
    path = '',
  ): Promise<Socket> {
    const socket = io(`${url}${path}`, { reconnection: false, forceNew: true, ...options });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return socket;
  }

  async function principalOf(
    socket: Socket,
    namespace: () => { fetchSockets: () => Promise<{ id?: string; data: unknown }[]> },
  ): Promise<unknown> {
    const found = (await namespace().fetchSockets()).find((s) => s.id === socket.id);
    return found?.data;
  }

  const main = () => {
    if (ioServer === undefined) throw new Error('no server');
    return ioServer;
  };

  beforeAll(async () => {
    testApp = await createTestApp({
      override: (builder) =>
        builder.overrideProvider(SESSION_READER).useFactory({
          inject: [AUTH],
          factory: (auth: Auth): SessionReader => {
            // Reads of a cookie in `hungCookies` stay pending until `releaseHung()`.
            const slow = {
              ...auth,
              api: {
                ...auth.api,
                getSession: (options: { headers: Headers }) =>
                  hungCookies.has(options.headers.get('cookie') ?? '')
                    ? new Promise((resolve) => {
                        hung.push(() => {
                          resolve(null);
                        });
                      })
                    : (auth.api.getSession as (o: unknown) => Promise<unknown>)(options),
              },
            } as unknown as Auth;
            const real = sessionReader(slow);
            const guarded =
              (read: SessionReader): SessionReader =>
              (req) =>
                failWith === undefined ? read(req) : Promise.reject(failWith);
            reader.mockImplementation(guarded(real));
            // The adapter reads through a share (N42); the spy sees its reads.
            return Object.assign(reader, {
              share: (maxReads: number): SessionReader => {
                socketReader.mockImplementation(guarded(real.share(maxReads)));
                return socketReader;
              },
            });
          },
        }),
      socketAdapter: (created) => new CapturingAdapter(created, 'http://localhost:3001', 65_536),
    });
    ({ app, prisma } = testApp);
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  }, 60_000);

  afterAll(async () => {
    for (const socket of sockets) socket.close();
    await testApp.close();
  });

  it('gives a socket with a valid session cookie its user', async () => {
    const user = await signIn(app);
    const socket = await connect({
      transports: ['websocket'],
      extraHeaders: { cookie: user.cookie },
    });

    expect(await principalOf(socket, main)).toEqual({
      principal: { kind: 'user', userId: user.userId, sessionId: user.sessionId },
    });
    await expect(socket.timeout(2000).emitWithAck('ping')).resolves.toBe('pong');
  });

  it('gives a long-polling socket with the cookie its user', async () => {
    const user = await signIn(app);
    const socket = await connect({
      transports: ['polling'],
      extraHeaders: { cookie: user.cookie },
    });

    expect(await principalOf(socket, main)).toEqual({
      principal: { kind: 'user', userId: user.userId, sessionId: user.sessionId },
    });
  });

  it('connects a socket without a cookie as anonymous', async () => {
    const socket = await connect({ transports: ['websocket'] });

    expect(await principalOf(socket, main)).toEqual({ principal: { kind: 'anonymous' } });
    await expect(socket.timeout(2000).emitWithAck('ping')).resolves.toBe('pong');
  });

  it('connects a socket with a badly signed cookie as anonymous', async () => {
    const user = await signIn(app);
    const [name, value] = user.cookie.split('=');
    const forged = `${name}=${value?.slice(0, -6)}AAAAAA`;
    const socket = await connect({ transports: ['websocket'], extraHeaders: { cookie: forged } });

    expect(await principalOf(socket, main)).toEqual({ principal: { kind: 'anonymous' } });
  });

  it('connects a socket whose session no longer exists as anonymous', async () => {
    const user = await signIn(app);
    await prisma.session.delete({ where: { id: user.sessionId } });
    const socket = await connect({
      transports: ['websocket'],
      extraHeaders: { cookie: user.cookie },
    });

    expect(await principalOf(socket, main)).toEqual({ principal: { kind: 'anonymous' } });
  });

  it('connects anonymous and does not refuse when the session read fails', async () => {
    const user = await signIn(app);
    failWith = new Error('database is down');
    try {
      const socket = await connect({
        transports: ['websocket'],
        extraHeaders: { cookie: user.cookie },
      });

      expect(await principalOf(socket, main)).toEqual({ principal: { kind: 'anonymous' } });
      await expect(socket.timeout(2000).emitWithAck('ping')).resolves.toBe('pong');
    } finally {
      failWith = undefined;
    }
  });

  it('gives a namespace created after the server the same user', async () => {
    const user = await signIn(app);
    const other = main().of('/other');
    const socket = await connect(
      { transports: ['websocket'], extraHeaders: { cookie: user.cookie } },
      '/other',
    );

    expect(await principalOf(socket, () => other)).toEqual({
      principal: { kind: 'user', userId: user.userId, sessionId: user.sessionId },
    });
  });

  it('reads sockets through a share of the reader, HTTP through the reader itself', async () => {
    const user = await signIn(app);
    reader.mockClear();
    socketReader.mockClear();

    await request(app.getHttpServer()).get('/categories').set('Cookie', user.cookie).expect(200);
    expect(reader).toHaveBeenCalledTimes(1);
    expect(reader.mock.calls[0]?.[0].headers.cookie).toBe(user.cookie);
    expect(socketReader).not.toHaveBeenCalled();

    await connect({ transports: ['websocket'], extraHeaders: { cookie: user.cookie } });
    expect(reader).toHaveBeenCalledTimes(1);
    expect(socketReader).toHaveBeenCalledTimes(1);
    expect(socketReader.mock.calls[0]?.[0].headers.cookie).toBe(user.cookie);
    expect(socketReader.mock.calls[0]?.[0].path).toBe('/socket.io/');
  });

  // N42: sockets may hold 5 reads at once; the 6th socket is told at once, HTTP is not affected.
  it('connects a socket anonymous at once when the sockets share is full, HTTP still reads', async () => {
    const holders = await Promise.all(Array.from({ length: 5 }, () => signIn(app)));
    for (const holder of holders) hungCookies.add(holder.cookie);
    const pending = holders.map((holder) =>
      connect({ transports: ['websocket'], extraHeaders: { cookie: holder.cookie } }),
    );
    try {
      await vi.waitFor(() => {
        expect(hung).toHaveLength(5);
      });
      const sixth = await signIn(app);
      const webUser = await signIn(app);
      reader.mockClear();

      const socket = await connect({
        transports: ['websocket'],
        extraHeaders: { cookie: sixth.cookie },
      });
      expect(await principalOf(socket, main)).toEqual({ principal: { kind: 'anonymous' } });

      await request(app.getHttpServer())
        .get('/categories')
        .set('Cookie', webUser.cookie)
        .expect(200);
      expect(await reader.mock.results[0]?.value).toEqual({
        userId: webUser.userId,
        sessionId: webUser.sessionId,
      });
    } finally {
      for (const release of hung.splice(0)) release();
      hungCookies.clear();
    }
    const connected = await Promise.all(pending);
    // the held reads end with "no session" (see the override), and none of them was refused
    expect(connected).toHaveLength(5);
    expect(await principalOf(connected[0] as Socket, main)).toEqual({
      principal: { kind: 'anonymous' },
    });
  });

  it('reads the session once per connection, however many namespaces it joins', async () => {
    const user = await signIn(app);
    const other = main().of('/other');
    socketReader.mockClear();

    const first = await connect({
      transports: ['websocket'],
      extraHeaders: { cookie: user.cookie },
    });
    const second = first.io.socket('/other');
    sockets.push(second);
    await new Promise<void>((resolve, reject) => {
      second.once('connect', resolve);
      second.once('connect_error', reject);
    });

    expect(socketReader).toHaveBeenCalledTimes(1);
    const expected = {
      principal: { kind: 'user', userId: user.userId, sessionId: user.sessionId },
    };
    expect(await principalOf(first, main)).toEqual(expected);
    expect(await principalOf(second, () => other)).toEqual(expected);

    await connect({ transports: ['websocket'], extraHeaders: { cookie: user.cookie } });
    expect(socketReader).toHaveBeenCalledTimes(2);
  });

  describe('origin of a new connection (N40)', () => {
    it.each(['websocket', 'polling'])(
      'lets the web origin in over %s, as its user',
      async (transport) => {
        const user = await signIn(app);
        const socket = await connect({
          transports: [transport],
          extraHeaders: { cookie: user.cookie, origin: 'http://localhost:3001' },
        });

        expect(await principalOf(socket, main)).toEqual({
          principal: { kind: 'user', userId: user.userId, sessionId: user.sessionId },
        });
      },
    );

    it.each(['websocket', 'polling'])(
      'refuses another origin over %s before reading the session',
      async (transport) => {
        const user = await signIn(app);
        socketReader.mockClear();

        await expect(
          connect({
            transports: [transport],
            extraHeaders: { cookie: user.cookie, origin: 'https://evil.example' },
          }),
        ).rejects.toBeDefined();

        expect(socketReader).not.toHaveBeenCalled();
      },
    );

    it('answers 403 to a polling handshake from another origin and 200 from the web origin', async () => {
      const path = '/socket.io/?EIO=4&transport=polling';

      await request(app.getHttpServer())
        .get(path)
        .set('Origin', 'https://evil.example')
        .expect(403);
      await request(app.getHttpServer())
        .get(path)
        .set('Origin', 'http://localhost:3001')
        .expect(200);
      await request(app.getHttpServer()).get(path).expect(200);
    });
  });

  describe('a failed session read', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const capture = vi.mocked(Sentry.captureException);

    async function connectWithFailure(failure: Error): Promise<void> {
      const user = await signIn(app);
      warn.mockClear();
      error.mockClear();
      capture.mockClear();
      failWith = failure;
      try {
        const first = await connect({
          transports: ['websocket'],
          extraHeaders: { cookie: user.cookie },
        });
        const second = first.io.socket('/other');
        sockets.push(second);
        await new Promise<void>((resolve, reject) => {
          second.once('connect', resolve);
          second.once('connect_error', reject);
        });
        expect(await principalOf(first, main)).toEqual({ principal: { kind: 'anonymous' } });
      } finally {
        failWith = undefined;
      }
    }

    it('logs an error and reports to Sentry once per connection when the reader marks it', async () => {
      main().of('/other');
      const failure = new SessionUnavailableError('x', true);

      await connectWithFailure(failure);

      expect(capture).toHaveBeenCalledTimes(1);
      expect(capture).toHaveBeenCalledWith(failure, {
        tags: { 'error.code': 'SERVICE_UNAVAILABLE' },
      });
      expect(error).toHaveBeenCalledTimes(1);
      expect(warn).not.toHaveBeenCalled();
    });

    it('reports an error that is not a SessionUnavailableError', async () => {
      main().of('/other');
      const failure = new Error('boom');

      await connectWithFailure(failure);

      expect(capture).toHaveBeenCalledTimes(1);
      expect(capture).toHaveBeenCalledWith(failure, {
        tags: { 'error.code': 'SERVICE_UNAVAILABLE' },
      });
      expect(error).toHaveBeenCalledTimes(1);
    });

    // The adapter keeps the time of its last warning (N44), and earlier tests of this file warned:
    // the fake clock of this block (beforeAll, ahead of all its tests) starts at the real time once
    // they have run, and only moves forward, a minute and a bit at a time.
    let clock = 0;
    function passMinute(): void {
      clock += 61_000;
      vi.setSystemTime(clock);
    }

    beforeAll(() => {
      clock = Date.now();
      vi.useFakeTimers({ toFake: ['Date'] });
    });

    it('only warns, with no Sentry event, when the reader does not mark it', async () => {
      passMinute();
      main().of('/other');

      await connectWithFailure(new SessionUnavailableError('x', false));

      expect(capture).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(error).not.toHaveBeenCalled();
    });

    it('warns once per minute and counts the refusals it left out', async () => {
      main().of('/other');
      const refusal = new SessionUnavailableError('x', false);
      passMinute();

      await connectWithFailure(refusal);
      expect(warn).toHaveBeenCalledTimes(1);

      await connectWithFailure(refusal);
      await connectWithFailure(refusal);
      expect(warn).not.toHaveBeenCalled();

      passMinute();
      await connectWithFailure(refusal);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(expect.objectContaining({ alsoSinceLastLine: 2 }));
      expect(capture).not.toHaveBeenCalled();
    });

    afterAll(() => {
      vi.useRealTimers();
    });
  });
});
