import { createServer, type Server } from 'node:http';
import { Writable } from 'node:stream';

import type { ConfigService } from '@nestjs/config';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import type { Env } from '../config/env.js';
import { pinoHttpOptions } from './core.module.js';

function logged(): { lines: () => string[]; server: Server } {
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

  const server = createServer((req, res) => {
    logger(req, res);
    res.setHeader('Set-Cookie', 'session=cookie-secret');
    res.end('ok');
  });
  return { lines: () => chunks, server };
}

describe('request logging', () => {
  it('redacts the admin token, authorization and cookie headers', async () => {
    const { server, lines } = logged();

    await request(server)
      .get('/ping')
      .set('X-Admin-Token', 'secret-value')
      .set('Authorization', 'Bearer bearer-secret')
      .set('Cookie', 'sid=cookie-secret');

    const output = lines().join('');
    expect(output).toContain('[Redacted]');
    expect(output).not.toContain('secret-value');
    expect(output).not.toContain('bearer-secret');
    expect(output).not.toContain('cookie-secret');
    const entry = JSON.parse(lines()[0] ?? '{}') as {
      req: { headers: Record<string, string> };
      res: { headers: Record<string, string> };
    };
    expect(entry.req.headers['x-admin-token']).toBe('[Redacted]');
    expect(entry.req.headers.authorization).toBe('[Redacted]');
    expect(entry.req.headers.cookie).toBe('[Redacted]');
    expect(entry.res.headers['set-cookie']).toBe('[Redacted]');
  });

  it('does not log health checks', async () => {
    const { server, lines } = logged();

    await request(server).get('/health/ready');

    expect(lines()).toEqual([]);
  });
});
