import 'reflect-metadata';

import { createServer, type IncomingMessage, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { Controller, Get, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import type { Principal } from '../auth/principal.js';
import {
  findRequestContext,
  type RequestContextOptions,
  requestContextMiddleware,
  requestContextOf,
} from './request-context.js';

const PROXY_SECRET = 'proxy-secret-0123456789abcdef-xyz';
const ADMIN_TOKEN = 'admin-token-0123456789abcdef-xyz';
const options: RequestContextOptions = { proxySecret: PROXY_SECRET, adminToken: ADMIN_TOKEN };
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
    const empty = { proxySecret: '', adminToken: ADMIN_TOKEN };

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

  it('does not make the next secret an admin token', async () => {
    expect((await send({ 'X-Admin-Token': NEXT }, both)).principal.kind).toBe('anonymous');
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

describe('requestContextMiddleware: principal', () => {
  it('is admin with the right token', async () => {
    expect((await send({ 'X-Admin-Token': ADMIN_TOKEN })).principal).toEqual({ kind: 'admin' });
  });

  it.each([
    ['wrong', { 'X-Admin-Token': 'wrong' }],
    ['of the same length', { 'X-Admin-Token': ADMIN_TOKEN.replace(/.$/, 'Q') }],
    ['empty', { 'X-Admin-Token': '' }],
    ['missing', {}],
  ])('is anonymous with a %s token', async (_name, headers) => {
    expect((await send(headers)).principal).toEqual({ kind: 'anonymous' });
  });

  it('makes no admin when ADMIN_API_TOKEN is empty, even with an empty token', async () => {
    const noAdmin = { proxySecret: PROXY_SECRET, adminToken: '' };

    expect((await send({ 'X-Admin-Token': '' }, noAdmin)).principal.kind).toBe('anonymous');
    expect((await send({ 'X-Admin-Token': 'anything' }, noAdmin)).principal.kind).toBe('anonymous');
  });

  it('does not depend on the proxy secret', async () => {
    const withSecret = await send({ 'X-Admin-Token': ADMIN_TOKEN, 'X-Proxy-Secret': PROXY_SECRET });
    const wrongSecret = await send({ 'X-Admin-Token': ADMIN_TOKEN, 'X-Proxy-Secret': 'wrong' });
    const noSecret = await send({ 'X-Admin-Token': ADMIN_TOKEN });

    expect(withSecret.principal.kind).toBe('admin');
    expect(wrongSecret.principal.kind).toBe('admin');
    expect(noSecret.principal.kind).toBe('admin');
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

  it('makes the principal anonymous for two X-Admin-Token headers, even both right', async () => {
    const seen = await sendRaw({ 'X-Admin-Token': [ADMIN_TOKEN, ADMIN_TOKEN] });

    expect(seen.principal).toEqual({ kind: 'anonymous' });
  });

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

  async function whoServer(): Promise<Server> {
    const moduleRef = await Test.createTestingModule({ imports: [WhoModule] }).compile();
    const app = moduleRef.createNestApplication({ logger: false });
    app.use(requestContextMiddleware(options));
    await app.init();
    return app.getHttpServer() as Server;
  }

  it('hands the admin principal to the handler with the right token', async () => {
    const response = await request(await whoServer())
      .get('/who')
      .set('X-Admin-Token', ADMIN_TOKEN)
      .expect(200);

    expect(response.body).toEqual({ kind: 'admin' });
  });

  it.each([
    ['no token', {}],
    ['a wrong token', { 'X-Admin-Token': 'wrong' }],
  ])(
    'hands the anonymous principal with %s, and serves a public route (200, not 401)',
    async (_n, headers) => {
      const response = await request(await whoServer())
        .get('/who')
        .set(headers)
        .expect(200);

      expect(response.body).toEqual({ kind: 'anonymous' });
    },
  );
});
