import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { AppExpressAdapter } from '../src/common/http/app-express.adapter.js';
import { createValidationPipe } from '../src/common/validation/validation-pipe.js';

// Created like src/server.ts does: the adapter keeps body-parser's errors apart, the pipe is global.
describe('error responses (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication(new AppExpressAdapter(), { logger: false });
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('broken JSON answers 400 BAD_JSON', async () => {
    const response = await request(app.getHttpServer())
      .post('/anything')
      .set('Content-Type', 'application/json')
      .send('{"name": ')
      .expect(400);

    expect(response.body).toEqual({
      error: { code: 'BAD_JSON', message: 'The body is not valid JSON', details: [] },
    });
  });

  it('a 101 KB JSON body answers 413 PAYLOAD_TOO_LARGE', async () => {
    const response = await request(app.getHttpServer())
      .post('/anything')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ text: 'a'.repeat(101 * 1024) }))
      .expect(413);

    expect(response.body.error).toMatchObject({ code: 'PAYLOAD_TOO_LARGE', details: [] });
  });

  it('an unknown route answers 404 ROUTE_NOT_FOUND', async () => {
    const response = await request(app.getHttpServer()).get('/no/such/route?token=abc').expect(404);

    expect(response.body.error).toMatchObject({ code: 'ROUTE_NOT_FOUND', details: [] });
    expect(response.body.error.message).toBe('Route not found');
    expect(JSON.stringify(response.body)).not.toContain('such');
    expect(JSON.stringify(response.body)).not.toContain('token');
  });

  it('/health/live keeps its body', async () => {
    const response = await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(response.body).toEqual({ status: 'ok', version: 'test' });
  });

  it('/health/ready keeps the terminus body on 503', async () => {
    const response = await request(app.getHttpServer()).get('/health/ready').expect(503);

    expect(response.body.status).toBe('error');
    expect(response.body).not.toHaveProperty('error.code');
    expect(Object.keys(response.body.error).sort()).toEqual(['postgres', 'redis', 'temporal']);
  });
});

// Its own app, so the throttler counts (THROTTLE_LIMIT=5) of the describe above do not matter.
describe('error responses for odd bodies and paths (e2e)', () => {
  let app: INestApplication;
  const limit = 100 * 1024;

  function jsonOfSize(bytes: number): string {
    const overhead = Buffer.byteLength(JSON.stringify({ text: '' }));
    return JSON.stringify({ text: 'a'.repeat(bytes - overhead) });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication(new AppExpressAdapter(), { logger: false });
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('a gzip-labelled body that is not gzip answers 400 VALIDATION_FAILED, not 500', async () => {
    const response = await request(app.getHttpServer())
      .post('/anything')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'gzip')
      .send('{"a":1}')
      .expect(400);

    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'The body cannot be read',
      details: [],
    });
  });

  it('a JSON body of exactly 102400 bytes is not refused as too large', async () => {
    const body = jsonOfSize(limit);
    expect(Buffer.byteLength(body)).toBe(limit);

    const response = await request(app.getHttpServer())
      .post('/anything')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('a JSON body of 102401 bytes answers 413 PAYLOAD_TOO_LARGE', async () => {
    const response = await request(app.getHttpServer())
      .post('/anything')
      .set('Content-Type', 'application/json')
      .send(jsonOfSize(limit + 1))
      .expect(413);

    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('a malformed percent-encoded path answers a 4xx in the error format', async () => {
    const response = await request(app.getHttpServer()).get('/%FF');

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(response.body.error).toEqual({
      code: expect.any(String),
      message: expect.any(String),
      details: [],
    });
  });

  it('a bare number as the JSON body answers 400 BAD_JSON', async () => {
    const response = await request(app.getHttpServer())
      .post('/anything')
      .set('Content-Type', 'application/json')
      .send('42')
      .expect(400);

    expect(response.body.error.code).toBe('BAD_JSON');
  });
});
