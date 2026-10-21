import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { createHttpApp } from '../src/common/http/http-app.js';
import { REDIS, REDIS_CACHE } from '../src/redis/redis.module.js';

// The whole app, with every dependency pointing at a closed port (vitest.config.ts, test.env):
// liveness must not care, readiness must report each one as down.
describe('health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await createHttpApp(
      (adapter, options) =>
        moduleRef.createNestApplication<NestExpressApplication>(adapter, options),
      { logger: false },
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/live answers 200 with the version, whatever the dependencies', async () => {
    const response = await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(response.body).toEqual({ status: 'ok', version: 'test' });
  });

  it('GET /health/ready answers 503 and names every dependency that is down', async () => {
    const response = await request(app.getHttpServer()).get('/health/ready').expect(503);
    expect(response.body.status).toBe('error');
    expect(Object.keys(response.body.error).sort()).toEqual(['postgres', 'redis', 'temporal']);
  });
});

// Spec 0018 V5: readiness asks the counters' Redis only; without the caches' one the api is ready.
describe('health (e2e): the caches Redis', () => {
  const counters = { ping: vi.fn(), on: vi.fn(), quit: vi.fn() };
  const caches = { ping: vi.fn(), on: vi.fn(), quit: vi.fn() };
  let app: INestApplication;

  beforeAll(async () => {
    counters.ping.mockResolvedValue('PONG');
    caches.ping.mockRejectedValue(new Error('Connection is closed.'));
    counters.quit.mockResolvedValue('OK');
    caches.quit.mockResolvedValue('OK');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(REDIS)
      .useValue(counters)
      .overrideProvider(REDIS_CACHE)
      .useValue(caches)
      .compile();
    app = await createHttpApp(
      (adapter, options) =>
        moduleRef.createNestApplication<NestExpressApplication>(adapter, options),
      { logger: false },
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports redis up from the counters client while the caches client is down, and never pings the latter', async () => {
    const response = await request(app.getHttpServer()).get('/health/ready').expect(503);

    expect(response.body.info).toHaveProperty('redis');
    expect(response.body.info.redis.status).toBe('up');
    expect(response.body.error).not.toHaveProperty('redis');
    expect(counters.ping).toHaveBeenCalled();
    expect(caches.ping).not.toHaveBeenCalled();
  });
});
