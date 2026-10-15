import { gzipSync } from 'node:zlib';

import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { AppExpressAdapter } from '../src/common/http/app-express.adapter.js';
import { useRequestContext } from '../src/common/http/request-context.js';
import { createValidationPipe } from '../src/common/validation/validation-pipe.js';
import type { Env } from '../src/config/env.js';

type INestApplication = NestExpressApplication;

// ConfigModule validates the process environment when the module is imported, so a lowered limit
// needs freshly imported modules after the variable is stubbed (as throttling-tiers.e2e-spec.ts does).
describe('a lowered BODY_LIMIT (e2e)', () => {
  let lowered: NestExpressApplication;

  beforeAll(async () => {
    vi.resetModules();
    vi.stubEnv('BODY_LIMIT', '1024');
    const fresh = await import('../src/app.module.js');
    const adapter = await import('../src/common/http/app-express.adapter.js');
    const context = await import('../src/common/http/request-context.js');
    const pipe = await import('../src/common/validation/validation-pipe.js');
    const moduleRef = await Test.createTestingModule({ imports: [fresh.AppModule] }).compile();
    lowered = moduleRef.createNestApplication<NestExpressApplication>(
      new adapter.AppExpressAdapter(),
      { logger: false, bodyParser: false },
    );
    context.useRequestContext(lowered);
    const nestConfig = await import('@nestjs/config');
    const config = lowered.get<InstanceType<typeof ConfigService<Env, true>>>(
      nestConfig.ConfigService,
    );
    lowered.useBodyParser('json', { limit: config.get('BODY_LIMIT', { infer: true }) });
    lowered.useGlobalPipes(pipe.createValidationPipe());
    await lowered.init();
  });

  afterAll(async () => {
    await lowered.close();
    vi.unstubAllEnvs();
  });

  it('a 2 KB JSON body answers 413 PAYLOAD_TOO_LARGE in the error format', async () => {
    const response = await request(lowered.getHttpServer())
      .post('/anything')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ text: 'a'.repeat(2 * 1024) }))
      .expect(413);

    expect(response.body).toEqual({
      error: { code: 'PAYLOAD_TOO_LARGE', message: expect.any(String), details: [] },
    });
  });

  it('a body under the lowered limit is not refused as too large', async () => {
    const response = await request(lowered.getHttpServer())
      .post('/anything')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ text: 'a'.repeat(500) }));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
  });
});

// The pipe runs before any service, so no database is needed. Its own app: the throttler allows five
// requests per route and tier in tests.
describe('validation details cap and gzip bodies (e2e)', () => {
  let app: INestApplication;
  const adminToken = process.env.ADMIN_API_TOKEN ?? '';

  function unknownParams(count: number): Record<string, string> {
    return Object.fromEntries(Array.from({ length: count }, (_, i) => [`unknown${i}`, '1']));
  }

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /products with 51 unknown query params answers 50 details and TOO_MANY_ERRORS', async () => {
    const response = await request(app.getHttpServer())
      .get('/products')
      .query(unknownParams(51))
      .expect(400);

    const { code, details } = response.body.error;
    expect(code).toBe('VALIDATION_FAILED');
    expect(details).toHaveLength(51);
    expect(
      details.slice(0, 50).every((d: { code: string }) => d.code === 'WHITELIST_VALIDATION'),
    ).toBe(true);
    expect(details[50]).toEqual({ field: '', code: 'TOO_MANY_ERRORS', message: '1 more errors' });
  });

  it('GET /products with 50 unknown query params answers 50 details, no TOO_MANY_ERRORS', async () => {
    const response = await request(app.getHttpServer())
      .get('/products')
      .query(unknownParams(50))
      .expect(400);

    const details: { code: string }[] = response.body.error.details;
    expect(details).toHaveLength(50);
    expect(details.some((d) => d.code === 'TOO_MANY_ERRORS')).toBe(false);
  });

  it('a body with one 50 KB key answers a 400 whose body stays small', async () => {
    const response = await request(app.getHttpServer())
      .post('/products')
      .set('X-Admin-Token', adminToken)
      .send({ ['k'.repeat(50 * 1024)]: 1 })
      .expect(400);

    expect(JSON.stringify(response.body).length).toBeLessThan(2048);
  });

  it('a 150 KB urlencoded body is not read, so not refused as too large (F26)', async () => {
    const response = await request(app.getHttpServer())
      .post('/anything')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(`text=${'a'.repeat(150 * 1024)}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('an admin POST /products with a urlencoded body is not parsed, so its fields are missing (F26)', async () => {
    const response = await request(app.getHttpServer())
      .post('/products')
      .set('X-Admin-Token', adminToken)
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('notAProductField=1')
      .expect(400);

    const { code, details } = response.body.error;
    expect(code).toBe('VALIDATION_FAILED');
    expect(details.length).toBeGreaterThan(0);
    const fields = details.map((d: { field: string }) => d.field);
    // Parsed, the unknown key would be refused as WHITELIST_VALIDATION; unread, only required fields fail.
    expect(fields).not.toContain('notAProductField');
  });

  it('a gzip body that inflates past BODY_LIMIT answers 413 PAYLOAD_TOO_LARGE', async () => {
    const compressed = gzipSync(JSON.stringify({ text: 'a'.repeat(150 * 1024) }));
    expect(compressed.length).toBeLessThan(102_400);

    // superagent would JSON-stringify a Buffer for a JSON content type, hence the identity serializer.
    const response = await request(app.getHttpServer())
      .post('/anything')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'gzip')
      .serialize((body: Buffer) => body as unknown as string)
      .send(compressed)
      .expect(413);

    expect(response.body).toEqual({
      error: { code: 'PAYLOAD_TOO_LARGE', message: expect.any(String), details: [] },
    });
  });

  it('a small valid gzip body is read (the 413 above comes from the inflated size)', async () => {
    const response = await request(app.getHttpServer())
      .post('/anything')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'gzip')
      .serialize((body: Buffer) => body as unknown as string)
      .send(gzipSync(JSON.stringify({ text: 'a' })));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('POST /products as admin with 60 unknown fields answers 50 details and TOO_MANY_ERRORS', async () => {
    const unknown = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`extra${i}`, i]));
    const response = await request(app.getHttpServer())
      .post('/products')
      .set('X-Admin-Token', adminToken)
      .send(unknown)
      .expect(400);

    const { code, details } = response.body.error;
    expect(code).toBe('VALIDATION_FAILED');
    expect(details).toHaveLength(51);
    // The missing required fields of the DTO add to the 60 unknown ones, so the count is not fixed.
    expect(details[50]).toEqual({
      field: '',
      code: 'TOO_MANY_ERRORS',
      message: expect.stringMatching(/^\d+ more errors$/),
    });
    expect(Number.parseInt(details[50].message, 10)).toBeGreaterThanOrEqual(10);
  });
});

// Created like src/server.ts does: the adapter keeps body-parser's errors apart, the request context
// comes before the body parser (limited to BODY_LIMIT), the pipe is global.
async function createApp(): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const created = moduleRef.createNestApplication<NestExpressApplication>(new AppExpressAdapter(), {
    logger: false,
    bodyParser: false,
  });
  useRequestContext(created);
  const config = created.get<ConfigService<Env, true>>(ConfigService);
  created.useBodyParser('json', { limit: config.get('BODY_LIMIT', { infer: true }) });
  created.useGlobalPipes(createValidationPipe());
  await created.init();
  return created;
}

describe('error responses (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('a 150 KB JSON body answers 413 PAYLOAD_TOO_LARGE in the error format', async () => {
    const response = await request(app.getHttpServer())
      .post('/anything')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ text: 'a'.repeat(150 * 1024) }))
      .expect(413);

    expect(response.body).toEqual({
      error: { code: 'PAYLOAD_TOO_LARGE', message: expect.any(String), details: [] },
    });
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

// Its own app, so the throttler counts (five per route and tier) of the describe above do not matter.
describe('error responses for odd bodies and paths (e2e)', () => {
  let app: INestApplication;
  const limit = 100 * 1024;

  function jsonOfSize(bytes: number): string {
    const overhead = Buffer.byteLength(JSON.stringify({ text: '' }));
    return JSON.stringify({ text: 'a'.repeat(bytes - overhead) });
  }

  beforeAll(async () => {
    app = await createApp();
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
