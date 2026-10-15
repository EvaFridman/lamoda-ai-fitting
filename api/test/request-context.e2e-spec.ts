import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getLoggerToken } from 'nestjs-pino';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { AppExceptionFilter } from '../src/common/filters/app-exception.filter.js';
import { AppExpressAdapter } from '../src/common/http/app-express.adapter.js';
import { useRequestContext } from '../src/common/http/request-context.js';
import { createValidationPipe } from '../src/common/validation/validation-pipe.js';

// vitest.config.ts: PROXY_SECRET and five reads per route. Each test boots its own app, so the
// in-memory request counters (Redis is down) start empty. Set up like src/server.ts.
const PROXY_SECRET = 'testproxysecret0123456789abcdef0';

describe('request context (e2e)', () => {
  const logger = { warn: vi.fn(), error: vi.fn() };
  let app: INestApplication;

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getLoggerToken(AppExceptionFilter.name))
      .useValue(logger)
      .compile();
    app = moduleRef.createNestApplication(new AppExpressAdapter(), { logger: false });
    useRequestContext(app);
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('rate limit by client address', () => {
    async function statuses(headers: (i: number) => Record<string, string>): Promise<number[]> {
      const result: number[] = [];
      for (let i = 0; i < 6; i += 1) {
        result.push((await request(app.getHttpServer()).get('/hello').set(headers(i))).status);
      }
      return result;
    }

    it('shares one quota between requests without the secret, whatever X-Forwarded-For says', async () => {
      expect(await statuses((i) => ({ 'X-Forwarded-For': `203.0.113.${i + 1}` }))).toEqual([
        200, 200, 200, 200, 200, 429,
      ]);
    });

    it('shares one quota between requests with a wrong secret', async () => {
      expect(
        await statuses((i) => ({
          'X-Proxy-Secret': 'wrong',
          'X-Forwarded-For': `203.0.113.${i + 1}`,
        })),
      ).toEqual([200, 200, 200, 200, 200, 429]);
    });

    it('gives each X-Forwarded-For address its own quota with the secret', async () => {
      expect(
        await statuses((i) => ({
          'X-Proxy-Secret': PROXY_SECRET,
          'X-Forwarded-For': `203.0.113.${i + 1}`,
        })),
      ).toEqual([200, 200, 200, 200, 200, 200]);
    });

    it('still limits one forwarded address with the secret', async () => {
      expect(
        await statuses(() => ({
          'X-Proxy-Secret': PROXY_SECRET,
          'X-Forwarded-For': '203.0.113.9',
        })),
      ).toEqual([200, 200, 200, 200, 200, 429]);
    });
  });

  describe('429 and empty admin token', () => {
    it('carries X-Request-Id on a 429, and a new forwarded address still gets 429 without the secret', async () => {
      for (let i = 0; i < 5; i += 1) {
        await request(app.getHttpServer()).get('/hello').expect(200);
      }

      const response = await request(app.getHttpServer())
        .get('/hello')
        .set('X-Forwarded-For', '203.0.113.200')
        .expect(429);

      expect(response.headers['x-request-id']).toMatch(/^[\da-f-]{36}$/);
    });

    it('serves a public route with an empty X-Admin-Token', async () => {
      await request(app.getHttpServer()).get('/hello').set('X-Admin-Token', '').expect(200);
    });

    it('answers 401 on an @AdminOnly route with an empty X-Admin-Token', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('X-Admin-Token', '')
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('request id', () => {
    it('answers a BAD_JSON response with an X-Request-Id that is on the filter log line', async () => {
      const response = await request(app.getHttpServer())
        .post('/anything')
        .set('Content-Type', 'application/json')
        .send('{"name": ')
        .expect(400);

      const id = response.headers['x-request-id'];
      expect(id).toMatch(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/);
      expect(response.body.error.code).toBe('BAD_JSON');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'BAD_JSON', requestId: id }),
        expect.any(String),
      );
    });

    it('uses the id nginx sent when the request carries the secret', async () => {
      const sent = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

      const response = await request(app.getHttpServer())
        .post('/anything')
        .set('Content-Type', 'application/json')
        .set('X-Proxy-Secret', PROXY_SECRET)
        .set('X-Request-Id', sent)
        .send('{"name": ')
        .expect(400);

      expect(response.headers['x-request-id']).toBe(sent);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: sent }),
        expect.any(String),
      );
    });

    it('ignores a sent id without the secret', async () => {
      const sent = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

      const response = await request(app.getHttpServer())
        .get('/hello')
        .set('X-Request-Id', sent)
        .expect(200);

      expect(response.headers['x-request-id']).not.toBe(sent);
    });
  });
});
