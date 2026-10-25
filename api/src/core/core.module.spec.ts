import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { Writable } from 'node:stream';

import type { ConfigService } from '@nestjs/config';
import express from 'express';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import {
  type RequestContextOptions,
  requestContextMiddleware,
} from '../common/http/request-context.js';
import type { Env } from '../config/env.js';
import { LOGGED_HEADER_MAX_LENGTH, pinoHttpOptions, serializeRequest } from './core.module.js';

function logged(context?: RequestContextOptions): { lines: () => string[]; server: Server } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  const values: Partial<Env> = { LOG_LEVEL: 'info', NODE_ENV: 'production' };
  const config = {
    get: (key: keyof Env) => values[key],
  } as unknown as ConfigService<Env, true>;
  const logger = pinoHttp(
    { ...pinoHttpOptions(config), level: 'info', transport: undefined },
    stream,
  );

  const respond = (_req: IncomingMessage, res: ServerResponse): void => {
    res.setHeader('Set-Cookie', 'session=cookie-secret');
    res.end('ok');
  };
  // With a context, the middleware (an Express one) runs before pino-http, as in the app.
  const handler = context ? express() : undefined;
  if (handler && context) {
    handler.use(requestContextMiddleware(context));
    handler.use((req, res) => {
      logger(req, res);
      respond(req, res);
    });
  }
  const server = createServer(
    handler ??
      ((req, res) => {
        logger(req, res);
        respond(req, res);
      }),
  );
  return { lines: () => chunks, server };
}

describe('serializeRequest', () => {
  it('answers empty headers for a request with none', () => {
    expect(serializeRequest({ id: 'r1', method: 'GET' })).toEqual({
      id: 'r1',
      method: 'GET',
      headers: {},
    });
  });

  it('keeps only the listed headers and leaves other fields as they are', () => {
    const req = {
      id: 'r1',
      method: 'GET',
      url: '/a?b=1',
      query: { b: '1' },
      params: {},
      remoteAddress: '::1',
      remotePort: 1234,
      headers: {
        'user-agent': 'ua',
        'content-type': 'text/plain',
        'content-length': '3',
        referer: 'https://r.example',
        authorization: 'x',
        cookie: 'y',
        'x-custom': 'z',
      },
    };

    expect(serializeRequest(req)).toEqual({
      ...req,
      headers: {
        'user-agent': 'ua',
        'content-type': 'text/plain',
        'content-length': '3',
        referer: 'https://r.example',
      },
    });
  });

  it('cuts the referer at the first ? or #', () => {
    const referer = (value: string): unknown =>
      (serializeRequest({ headers: { referer: value } }).headers as Record<string, unknown>)
        .referer;

    expect(referer('https://site.test/catalog?q=secret#frag')).toBe('https://site.test/catalog');
    expect(referer('https://site.test/catalog#frag')).toBe('https://site.test/catalog');
    expect(referer('https://site.test/catalog')).toBe('https://site.test/catalog');
  });

  it('cuts a kept header to the length limit followed by an ellipsis', () => {
    const headers = (value: string): Record<string, unknown> =>
      serializeRequest({ headers: { 'user-agent': value } }).headers as Record<string, unknown>;

    const cut = headers('a'.repeat(600))['user-agent'] as string;
    expect(cut).toBe(`${'a'.repeat(LOGGED_HEADER_MAX_LENGTH)}…`);
    expect(cut).toHaveLength(513);
    expect(headers('a'.repeat(512))['user-agent']).toBe('a'.repeat(512));
  });

  it('cuts a long referer after its query is removed', () => {
    const base = `https://site.test/${'p'.repeat(600)}`;

    const { headers } = serializeRequest({ headers: { referer: `${base}?q=secret` } }) as {
      headers: Record<string, string>;
    };

    expect(headers.referer).toBe(`${base.slice(0, LOGGED_HEADER_MAX_LENGTH)}…`);
    expect(headers.referer).not.toContain('secret');
  });

  it('does not change the request it is given', () => {
    const req = { headers: { cookie: 'y', 'user-agent': 'ua' } };

    serializeRequest(req);

    expect(req).toEqual({ headers: { cookie: 'y', 'user-agent': 'ua' } });
  });
});

describe('request logging', () => {
  it('leaves the authorization and cookie headers out, and redacts Set-Cookie', async () => {
    const { server, lines } = logged();

    await request(server)
      .get('/ping')
      .set('Authorization', 'Bearer bearer-secret')
      .set('Cookie', 'sid=cookie-secret');

    const output = lines().join('');
    expect(output).toContain('[Redacted]');
    expect(output).not.toContain('bearer-secret');
    expect(output).not.toContain('cookie-secret');
    const entry = JSON.parse(lines()[0] ?? '{}') as {
      req: { headers: Record<string, string> };
      res: { headers: Record<string, string> };
    };
    expect(entry.req.headers).not.toHaveProperty('authorization');
    expect(entry.req.headers).not.toHaveProperty('cookie');
    expect(entry.res.headers['set-cookie']).toBe('[Redacted]');
  });

  it('logs only the listed request headers, and the request fields as before', async () => {
    const { server, lines } = logged();

    await request(server)
      .post('/ping?x=1')
      .set('Authorization', 'Bearer bearer-secret')
      .set('Cookie', 'sid=cookie-secret')
      .set('X-Proxy-Secret', 'proxy-secret-value')
      .set('X-Custom', 'custom-value')
      .set('X-Forwarded-For', '203.0.113.7')
      .set('User-Agent', 'test-agent')
      .set('Referer', 'https://site.example/page')
      .send({ name: 'body' });

    const entry = JSON.parse(lines()[0] ?? '{}') as {
      req: {
        headers: Record<string, string>;
        id: string;
        method: string;
        url: string;
        remoteAddress: string;
      };
    };
    expect(Object.keys(entry.req.headers).sort()).toEqual([
      'content-length',
      'content-type',
      'referer',
      'user-agent',
    ]);
    expect(entry.req.headers['user-agent']).toBe('test-agent');
    expect(entry.req.headers.referer).toBe('https://site.example/page');
    expect(entry.req.headers['content-type']).toContain('application/json');
    expect(entry.req.id).toEqual(expect.any(String));
    expect(entry.req.method).toBe('POST');
    expect(entry.req.url).toBe('/ping?x=1');
    expect(entry.req.remoteAddress).toEqual(expect.any(String));
    const output = lines().join('');
    for (const secret of ['bearer-secret', 'cookie-secret', 'proxy-secret-value']) {
      expect(output).not.toContain(secret);
    }
    expect(output).not.toContain('custom-value');
    expect(output).not.toContain('203.0.113.7');
  });

  it('has no redaction rule for the retired admin token header', () => {
    const config = { get: () => 'info' } as unknown as ConfigService<Env, true>;

    const redact = JSON.stringify(pinoHttpOptions(config).redact);

    expect(redact).not.toMatch(/admin/i);
    expect(redact).toMatch(/cookie/i);
  });

  it('logs the referer without its query', async () => {
    const { server, lines } = logged();

    await request(server).get('/ping').set('Referer', 'http://x.test/p?token=leak-value');

    expect(lines().join('')).not.toContain('leak-value');
    const entry = JSON.parse(lines()[0] ?? '{}') as { req: { headers: Record<string, string> } };
    expect(entry.req.headers.referer).toBe('http://x.test/p');
  });

  it('leaves the proxy secret header out', async () => {
    const { server, lines } = logged();

    await request(server).get('/ping').set('X-Proxy-Secret', 'proxy-secret-value');

    const output = lines().join('');
    expect(output).not.toContain('proxy-secret-value');
    const entry = JSON.parse(lines()[0] ?? '{}') as { req: { headers: Record<string, string> } };
    expect(entry.req.headers).not.toHaveProperty('x-proxy-secret');
  });

  it('logs a new uuid as the request id when no request context exists', async () => {
    const { server, lines } = logged();

    await request(server).get('/ping');

    const entry = JSON.parse(lines()[0] ?? '{}') as { req: { id: string } };
    expect(entry.req.id).toMatch(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/);
  });

  it('logs the id of the request context', async () => {
    const { server, lines } = logged({ proxySecret: 's'.repeat(32) });
    const id = 'a'.repeat(32);

    await request(server)
      .get('/ping')
      .set('X-Proxy-Secret', 's'.repeat(32))
      .set('X-Request-Id', id);

    const entry = JSON.parse(lines()[0] ?? '{}') as { req: { id: string } };
    expect(entry.req.id).toBe(id);
  });

  it('does not log health checks', async () => {
    const { server, lines } = logged();

    await request(server).get('/health/ready');

    expect(lines()).toEqual([]);
  });
});
