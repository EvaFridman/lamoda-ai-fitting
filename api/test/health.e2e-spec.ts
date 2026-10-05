import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';

// The whole app, with every dependency pointing at a closed port (vitest.config.ts, test.env):
// liveness must not care, readiness must report each one as down.
describe('health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
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
