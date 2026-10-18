import 'reflect-metadata';

import { createServer, type IncomingMessage, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { Controller, Get, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import type { Principal } from '../auth/principal.js';
import {
  findRequestContext,
  type RequestContextOptions,
  requestContextMiddleware,
  requestContextOf,
} from './request-context.js';

const { setTag, setUser } = vi.hoisted(() => ({ setTag: vi.fn(), setUser: vi.fn() }));

vi.mock('@sentry/nestjs', () => ({
  getIsolationScope: () => ({ setTag, setUser }),
}));

const PROXY_SECRET = 'proxy-secret-0123456789abcdef-xyz';
const options: RequestContextOptions = { proxySecret: PROXY_SECRET };
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/;
const REQUEST_ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

// A bare server behind the middleware that answers the context it built.
function serverWith(opts: RequestContextOptions): Server {
  const app = express();
  app.use(requestContextMiddleware(opts));
  app.get('/', (req, res) => {
    res.json({ ...requestContextOf(req), socket: req.socket.remoteAddress });
  });
  return createServer(app);
}

interface Seen {
  clientAddress: string;
  requestId: string;
  principal: Principal;
  socket: string;
  header: string | undefined;
}

async function send(
  headers: Record<string, string>,
  opts: RequestContextOptions = options,
): Promise<Seen> {
  const response = await request(serverWith(opts)).get('/').set(headers);
  return { ...(response.body as Seen), header: response.headers['x-request-id'] };
}

describe('requestContextMiddleware: trust', () => {
  it.each([
    ['wrong', 'wrong-secret'],
    ['of another length', 'x'],
    ['longer', `${PROXY_SECRET}-and-more`],
    ['empty', ''],
  ])('does not trust a %s proxy secret', async (_name, secret) => {
    const seen = await send({
      'X-Proxy-Secret': secret,
      'X-Forwarded-For': '203.0.113.7',
      'X-Request-Id': REQUEST_ID,
    });

    expect(seen.clientAddress).toBe(seen.socket);
    expect(seen.requestId).toMatch(UUID);
  });

  it('does not trust a request without the proxy secret', async () => {
    const seen = await send({ 'X-Forwarded-For': '203.0.113.7', 'X-Request-Id': REQUEST_ID });

    expect(seen.clientAddress).toBe(seen.socket);
    expect(seen.requestId).toMatch(UUID);
  });

  it('trusts nothing when PROXY_SECRET is empty, even with an empty header', async () => {
    const empty = { proxySecret: '' };

    const seen = await send(
      { 'X-Proxy-Secret': '', 'X-Forwarded-For': '203.0.113.7', 'X-Request-Id': REQUEST_ID },
      empty,
    );

    expect(seen.clientAddress).toBe(seen.socket);
    expect(seen.requestId).toMatch(UUID);
  });

  it('trusts the right proxy secret', async () => {
    const seen = await send({
      'X-Proxy-Secret': PROXY_SECRET,
      'X-Forwarded-For': '203.0.113.7',
      'X-Request-Id': REQUEST_ID,
    });

    expect(seen.clientAddress).toBe('203.0.113.7');
    expect(seen.requestId).toBe(REQUEST_ID);
  });
});

describe('requestContextMiddleware: PROXY_SECRET_NEXT', () => {
  const NEXT = 'next-secret-0123456789abcdef-xyz';
  const both: RequestContextOptions = { ...options, proxySecretNext: NEXT };
  const forwarded = { 'X-Forwarded-For': '203.0.113.7', 'X-Request-Id': REQUEST_ID };

  it('trusts the next secret for X-Forwarded-For and X-Request-Id', async () => {
    const seen = await send({ 'X-Proxy-Secret': NEXT, ...forwarded }, both);

    expect(seen.clientAddress).toBe('203.0.113.7');
    expect(seen.requestId).toBe(REQUEST_ID);
    expect(seen.header).toBe(REQUEST_ID);
  });

  it('still trusts the old secret while the next one is set', async () => {
    const seen = await send({ 'X-Proxy-Secret': PROXY_SECRET, ...forwarded }, both);

    expect(seen.clientAddress).toBe('203.0.113.7');
    expect(seen.requestId).toBe(REQUEST_ID);
  });

  it.each([
    ['wrong', 'wrong-secret'],
    ['of another length', 'x'],
    ['the next one with more', `${NEXT}-and-more`],
    ['empty', ''],
  ])('does not trust a %s secret when both are set', async (_name, secret) => {
    const seen = await send({ 'X-Proxy-Secret': secret, ...forwarded }, both);

    expect(seen.clientAddress).toBe(seen.socket);
    expect(seen.requestId).toMatch(UUID);
  });

  it('does not trust a request without the header when both are set', async () => {
    const seen = await send(forwarded, both);

    expect(seen.clientAddress).toBe(seen.socket);
    expect(seen.requestId).toMatch(UUID);
  });

  it.each([
    ['an empty next secret', { ...options, proxySecretNext: '' }],
    ['an omitted next secret', options],
  ])('with %s trusts nothing more than the old secret', async (_name, opts) => {
    for (const secret of ['', NEXT, 'anything']) {
      const seen = await send({ 'X-Proxy-Secret': secret, ...forwarded }, opts);

      expect(seen.clientAddress).toBe(seen.socket);
      expect(seen.requestId).toMatch(UUID);
    }
    const missing = await send(forwarded, opts);
    expect(missing.clientAddress).toBe(missing.socket);

    const old = await send({ 'X-Proxy-Secret': PROXY_SECRET, ...forwarded }, opts);
    expect(old.clientAddress).toBe('203.0.113.7');
  });

  describe('with PROXY_SECRET empty', () => {
    const onlyNext: RequestContextOptions = { ...both, proxySecret: '' };

    it('trusts the next secret', async () => {
      const seen = await send({ 'X-Proxy-Secret': NEXT, ...forwarded }, onlyNext);

      expect(seen.clientAddress).toBe('203.0.113.7');
      expect(seen.requestId).toBe(REQUEST_ID);
    });

    it.each([
      ['empty', { 'X-Proxy-Secret': '' }],
      ['missing', {}],
      ['the old one', { 'X-Proxy-Secret': PROXY_SECRET }],
      ['wrong', { 'X-Proxy-Secret': 'wrong' }],
    ])('does not trust a %s secret', async (_name, headers) => {
      const seen = await send({ ...headers, ...forwarded }, onlyNext);

      expect(seen.clientAddress).toBe(seen.socket);
      expect(seen.requestId).toMatch(UUID);
    });
  });

  it('does not trust two X-Proxy-Secret headers, even both the next secret', async () => {
    const server = serverWith(both);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const seen = await new Promise<Seen>((resolve, reject) => {
        const req = httpRequest(
          {
            host: '127.0.0.1',
            port,
            path: '/',
            headers: { 'X-Proxy-Secret': [NEXT, NEXT], ...forwarded },
          },
          (res) => {
            let body = '';
            res.on('data', (chunk: Buffer) => (body += chunk.toString()));
            res.on('end', () => resolve(JSON.parse(body) as Seen));
          },
        );
        req.on('error', reject);
        req.end();
      });

      expect(seen.clientAddress).toBe(seen.socket);
    } finally {
      server.close();
    }
  });
});

describe('requestContextMiddleware: client address', () => {
  const trusted = { 'X-Proxy-Secret': PROXY_SECRET };

  it.each(['198.51.100.4', '2001:db8::1', '::1'])('takes the address %s', async (address) => {
    const seen = await send({ ...trusted, 'X-Forwarded-For': address });

    expect(seen.clientAddress).toBe(address);
  });

  it('trims the address', async () => {
    const seen = await send({ ...trusted, 'X-Forwarded-For': '  198.51.100.4  ' });

    expect(seen.clientAddress).toBe('198.51.100.4');
  });

  it.each([
    ['a list', '198.51.100.4, 203.0.113.9'],
    ['not an address', 'not-an-ip'],
    ['an address with a port', '198.51.100.4:8080'],
    ['empty', ''],
  ])('falls back to the socket address for %s', async (_name, value) => {
    const seen = await send({ ...trusted, 'X-Forwarded-For': value });

    expect(seen.clientAddress).toBe(seen.socket);
  });

  it('uses the socket address when X-Forwarded-For is missing', async () => {
    const seen = await send(trusted);

    expect(seen.clientAddress).toBe(seen.socket);
  });

  it('ignores X-Forwarded-For on an untrusted request', async () => {
    const seen = await send({ 'X-Forwarded-For': '198.51.100.4' });

    expect(seen.clientAddress).toBe(seen.socket);
  });
});

describe('requestContextMiddleware: request id', () => {
  const trusted = { 'X-Proxy-Secret': PROXY_SECRET };

  it('answers X-Request-Id equal to the context id', async () => {
    const generated = await send({});
    const sent = await send({ ...trusted, 'X-Request-Id': REQUEST_ID });

    expect(generated.header).toBe(generated.requestId);
    expect(sent.header).toBe(REQUEST_ID);
  });

  it('accepts an upper-case hex id', async () => {
    const id = REQUEST_ID.toUpperCase();

    expect((await send({ ...trusted, 'X-Request-Id': id })).requestId).toBe(id);
  });

  it.each([
    ['too short', REQUEST_ID.slice(1)],
    ['too long', `${REQUEST_ID}0`],
    ['not hex', 'z'.repeat(32)],
    ['with a dash', `${REQUEST_ID.slice(0, 31)}-`],
    ['empty', ''],
  ])('replaces a trusted id that is %s with a new uuid', async (_name, id) => {
    const seen = await send({ ...trusted, 'X-Request-Id': id });

    expect(seen.requestId).toMatch(UUID);
    expect(seen.header).toBe(seen.requestId);
  });

  it('generates a new uuid when the id is missing, a different one each time', async () => {
    const first = await send(trusted);
    const second = await send(trusted);

    expect(first.requestId).toMatch(UUID);
    expect(second.requestId).not.toBe(first.requestId);
  });
});

// Spec 0006 AC14: the id is on the Sentry event of a 5xx, through the isolation scope's tag.
describe('requestContextMiddleware: Sentry tag', () => {
  beforeEach(() => {
    setTag.mockClear();
  });

  it('tags the scope with the generated id, the same as the context and the header', async () => {
    const seen = await send({});

    expect(seen.requestId).toMatch(UUID);
    expect(setTag).toHaveBeenCalledOnce();
    expect(setTag).toHaveBeenCalledWith('request_id', seen.requestId);
    expect(seen.header).toBe(seen.requestId);
  });

  it('tags the scope with the id of a trusted proxy request', async () => {
    const seen = await send({ 'X-Proxy-Secret': PROXY_SECRET, 'X-Request-Id': REQUEST_ID });

    expect(setTag).toHaveBeenCalledOnce();
    expect(setTag).toHaveBeenCalledWith('request_id', REQUEST_ID);
    expect(seen.header).toBe(REQUEST_ID);
  });

  it.each([
    ['missing', {}],
    ['wrong', { 'X-Proxy-Secret': 'wrong-secret' }],
  ])('does not tag the client id when the proxy secret is %s', async (_name, secret) => {
    const seen = await send({ ...secret, 'X-Request-Id': REQUEST_ID });

    expect(seen.requestId).not.toBe(REQUEST_ID);
    expect(setTag).toHaveBeenCalledOnce();
    expect(setTag).toHaveBeenCalledWith('request_id', seen.requestId);
    expect(setTag).not.toHaveBeenCalledWith('request_id', REQUEST_ID);
  });
});

describe('requestContextMiddleware: principal', () => {
  const user = { userId: 'user-1', sessionId: 'session-1' };

  beforeEach(() => {
    setUser.mockClear();
  });

  it('is anonymous without a session reader, and sets no Sentry user', async () => {
    expect((await send({})).principal).toEqual({ kind: 'anonymous' });
    expect(setUser).not.toHaveBeenCalled();
  });

  it('is the user the session reader finds, and sets only the id on the Sentry scope', async () => {
    const readSession = vi.fn().mockResolvedValue(user);

    const seen = await send({}, { ...options, readSession });

    expect(seen.principal).toEqual({ kind: 'user', ...user });
    expect(setUser).toHaveBeenCalledExactlyOnceWith({ id: 'user-1' });
  });

  it('is anonymous when the session reader finds nobody', async () => {
    const readSession = vi.fn().mockResolvedValue(undefined);

    const seen = await send({}, { ...options, readSession });

    expect(readSession).toHaveBeenCalledOnce();
    expect(seen.principal).toEqual({ kind: 'anonymous' });
    expect(setUser).not.toHaveBeenCalled();
  });

  it('keeps the address and the request id of the context when it adds the user', async () => {
    const readSession = vi.fn().mockResolvedValue(user);

    const seen = await send(
      {
        'X-Proxy-Secret': PROXY_SECRET,
        'X-Forwarded-For': '203.0.113.7',
        'X-Request-Id': REQUEST_ID,
      },
      { ...options, readSession },
    );

    expect(seen.clientAddress).toBe('203.0.113.7');
    expect(seen.requestId).toBe(REQUEST_ID);
    expect(seen.principal.kind).toBe('user');
  });

  it('waits for the session reader before the next handler runs', async () => {
    let resolve!: (value: typeof user) => void;
    const readSession = vi.fn(
      () =>
        new Promise<typeof user>((done) => {
          resolve = done;
        }),
    );
    let reached = false;
    const app = express();
    app.use(requestContextMiddleware({ ...options, readSession }));
    app.get('/', (req, res) => {
      reached = true;
      res.json(requestContextOf(req).principal);
    });
    const pending = request(createServer(app))
      .get('/')
      .then((response) => response);
    await vi.waitFor(() => expect(readSession).toHaveBeenCalledOnce());

    expect(reached).toBe(false);
    resolve(user);
    const response = await pending;

    expect(reached).toBe(true);
    expect(response.body).toEqual({ kind: 'user', ...user });
  });

  it('passes a failed read to the error handler, and the response still has X-Request-Id', async () => {
    const readSession = vi.fn().mockRejectedValue(new Error('database is down'));
    const app = express();
    app.use(requestContextMiddleware({ ...options, readSession }));
    app.get('/', (_req, res) => {
      res.json({});
    });
    app.use(
      (error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.status(500).json({ message: error.message });
      },
    );

    const response = await request(createServer(app)).get('/').expect(500);

    expect(response.body).toEqual({ message: 'database is down' });
    expect(response.headers['x-request-id']).toMatch(UUID);
    expect(setUser).not.toHaveBeenCalled();
  });
});

// Node joins repeated headers with ", ", so a repeated value never equals the one expected.
describe('requestContextMiddleware: repeated and oversized headers', () => {
  async function sendRaw(headers: Record<string, string | string[]>): Promise<Seen> {
    const server = serverWith(options);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address() as AddressInfo;
      return await new Promise<Seen>((resolve, reject) => {
        const req = httpRequest({ host: '127.0.0.1', port, path: '/', headers }, (res) => {
          let body = '';
          res.on('data', (chunk: Buffer) => (body += chunk.toString()));
          res.on('end', () =>
            resolve({
              ...(JSON.parse(body) as Seen),
              header: res.headers['x-request-id'] as string,
            }),
          );
        });
        req.on('error', reject);
        req.end();
      });
    } finally {
      server.close();
    }
  }

  const trusted = { 'X-Proxy-Secret': PROXY_SECRET };

  it('does not trust two X-Proxy-Secret headers, even both right', async () => {
    const seen = await sendRaw({
      'X-Proxy-Secret': [PROXY_SECRET, PROXY_SECRET],
      'X-Forwarded-For': '203.0.113.7',
      'X-Request-Id': REQUEST_ID,
    });

    expect(seen.clientAddress).toBe(seen.socket);
    expect(seen.requestId).toMatch(UUID);
  });

  it('takes a new uuid for two valid X-Request-Id headers', async () => {
    const seen = await sendRaw({ ...trusted, 'X-Request-Id': [REQUEST_ID, REQUEST_ID] });

    expect(seen.requestId).toMatch(UUID);
  });

  it('takes the socket address for two X-Forwarded-For headers', async () => {
    const seen = await sendRaw({ ...trusted, 'X-Forwarded-For': ['203.0.113.7', '203.0.113.8'] });

    expect(seen.clientAddress).toBe(seen.socket);
  });

  it('takes a new uuid for a 9000-character X-Request-Id, without an error', async () => {
    const seen = await send({ ...trusted, 'X-Request-Id': 'a'.repeat(9000) });

    expect(seen.requestId).toMatch(UUID);
  });
});

describe('requestContextOf and findRequestContext', () => {
  it('throws for a request the middleware did not see, and finds nothing', () => {
    const req = {} as IncomingMessage;

    expect(() => requestContextOf(req)).toThrow(/useRequestContext/);
    expect(findRequestContext(req)).toBeUndefined();
  });
});

describe('@CurrentPrincipal()', () => {
  @Controller()
  class WhoController {
    @Get('who')
    who(@CurrentPrincipal() principal: Principal): Principal {
      return principal;
    }
  }

  @Module({ controllers: [WhoController] })
  class WhoModule {}

  async function whoServer(opts: RequestContextOptions = options): Promise<Server> {
    const moduleRef = await Test.createTestingModule({ imports: [WhoModule] }).compile();
    const app = moduleRef.createNestApplication({ logger: false });
    app.use(requestContextMiddleware(opts));
    await app.init();
    return app.getHttpServer() as Server;
  }

  it('hands the user principal to the handler when the session reader finds one', async () => {
    const readSession = vi.fn().mockResolvedValue({ userId: 'user-1', sessionId: 'session-1' });
    const response = await request(await whoServer({ ...options, readSession }))
      .get('/who')
      .expect(200);

    expect(response.body).toEqual({ kind: 'user', userId: 'user-1', sessionId: 'session-1' });
  });

  it('hands the anonymous principal to the handler without a session', async () => {
    const response = await request(await whoServer())
      .get('/who')
      .expect(200);

    expect(response.body).toEqual({ kind: 'anonymous' });
  });
});
