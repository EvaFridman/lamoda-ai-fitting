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
import { pinoHttpOptions } from './core.module.js';

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

describe('request logging', () => {
  it('redacts the authorization and cookie headers, and Set-Cookie', async () => {
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
    expect(entry.req.headers.authorization).toBe('[Redacted]');
    expect(entry.req.headers.cookie).toBe('[Redacted]');
    expect(entry.res.headers['set-cookie']).toBe('[Redacted]');
  });

  it('has no redaction rule for the retired admin token header', () => {
    const config = { get: () => 'info' } as unknown as ConfigService<Env, true>;

    const redact = JSON.stringify(pinoHttpOptions(config).redact);

    expect(redact).not.toMatch(/admin/i);
    expect(redact).toMatch(/cookie/i);
  });

  it('redacts the proxy secret header', async () => {
    const { server, lines } = logged();

    await request(server).get('/ping').set('X-Proxy-Secret', 'proxy-secret-value');

    const output = lines().join('');
    expect(output).not.toContain('proxy-secret-value');
    const entry = JSON.parse(lines()[0] ?? '{}') as { req: { headers: Record<string, string> } };
    expect(entry.req.headers['x-proxy-secret']).toBe('[Redacted]');
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
