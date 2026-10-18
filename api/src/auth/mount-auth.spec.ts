import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import { PinoLogger } from 'nestjs-pino';
import { pino } from 'pino';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requestContextMiddleware } from '../common/http/request-context.js';
import { pinoHttpOptions } from '../core/core.module.js';
import { FallbackThrottlerStorage } from '../throttling/fallback-throttler-storage.js';
import { AUTH } from './auth.module.js';
import { mountAuth } from './mount-auth.js';

const config = {
  get: (key: string) => {
    if (key === 'LOG_LEVEL') return 'info';
    if (key === 'NODE_ENV') return 'test';
    if (key === 'WEB_ORIGIN') return 'https://site.example';
    if (key === 'BODY_LIMIT') return 102_400;
    if (key === 'REQUEST_TIMEOUT_MS') return 5000;
    return 1000;
  },
};

describe('mountAuth', () => {
  const lines: Record<string, unknown>[] = [];
  const originalRoot = PinoLogger.root;
  let app: express.Express;

  beforeEach(async () => {
    lines.length = 0;
    // The root logger nestjs-pino builds from the same options, writing to `lines`.
    // @ts-expect-error root is readonly outside nestjs-pino
    PinoLogger.root = pino(
      { level: 'info', redact: pinoHttpOptions(config as never).redact },
      {
        write: (line: string) => {
          lines.push(JSON.parse(line) as Record<string, unknown>);
        },
      },
    );
    app = express();
    app.use(requestContextMiddleware({ proxySecret: 'secret-secret' }));
    // Answers the address Better Auth would route.
    const auth = {
      handler: (req: Request) => Promise.resolve(Response.json({ routed: req.url })),
    };
    const storage = {
      increment: () =>
        Promise.resolve({ totalHits: 1, timeToExpire: 1, isBlocked: false, timeToBlockExpire: 0 }),
    };
    const logger = { setContext: vi.fn(), error: vi.fn() };
    const nest = {
      get: (token: unknown) => {
        if (token === ConfigService) return config;
        if (token === FallbackThrottlerStorage) return storage;
        if (token === AUTH) return auth;
        throw new Error('unexpected token');
      },
      resolve: () => Promise.resolve(logger),
      getHttpAdapter: () => ({ getInstance: () => app }),
    };
    await mountAuth(nest as unknown as NestExpressApplication);
  });

  afterEach(() => {
    // @ts-expect-error root is readonly outside nestjs-pino
    PinoLogger.root = originalRoot;
  });

  it('logs the request of /api/auth with its id and without the cookie', async () => {
    const response = await request(app)
      .get('/api/auth/get-session')
      .set('Cookie', 'lamoda.session_token=top-secret-token');

    expect(response.status).toBe(200);
    await vi.waitFor(() => {
      expect(lines.some((line) => line.msg === 'request completed')).toBe(true);
    });
    const line = lines.find((entry) => entry.msg === 'request completed');
    expect(line).toMatchObject({
      req: { id: response.headers['x-request-id'], method: 'GET', url: '/api/auth/get-session' },
      res: { statusCode: 200 },
    });
    expect(JSON.stringify(line)).not.toContain('top-secret-token');
    expect((line?.req as { headers: Record<string, unknown> }).headers.cookie).toBe('[Redacted]');
  });

  it('logs the url and fields without the query (the callback carries a code and a state)', async () => {
    await request(app).get('/api/auth/get-session?code=secret-code&state=secret-state');

    await vi.waitFor(() => {
      expect(lines.some((line) => line.msg === 'request completed')).toBe(true);
    });
    const line = lines.find((entry) => entry.msg === 'request completed');
    expect((line?.req as Record<string, unknown>).url).toBe('/api/auth/get-session');
    expect(line?.req).not.toHaveProperty('query');
    expect(JSON.stringify(line)).not.toContain('secret-code');
    expect(JSON.stringify(line)).not.toContain('secret-state');
  });

  it('routes Better Auth to the checked path whatever X-Forwarded-Proto and Host say', async () => {
    const response = await request(app)
      .get('/api/auth/ok')
      .set('X-Forwarded-Proto', 'http://x/api/auth/list-sessions#')
      .set('Host', 'evil.example/api/auth/list-sessions#');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ routed: 'https://site.example/api/auth/ok' });
  });

  it('logs a refused route too', async () => {
    await request(app).get('/api/auth/list-sessions').expect(404);

    await vi.waitFor(() => {
      expect(lines).toContainEqual(
        expect.objectContaining({
          msg: 'request completed',
          res: expect.objectContaining({ statusCode: 404 }),
        }),
      );
    });
  });
});
