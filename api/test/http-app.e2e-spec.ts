import { Body, Controller, Get, type INestApplication, Post, Req } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppExceptionFilter } from '../src/common/filters/app-exception.filter.js';
import { AppExpressAdapter } from '../src/common/http/app-express.adapter.js';
import { type CreateApp, createHttpApp } from '../src/common/http/http-app.js';
import { validateEnv } from '../src/config/env.js';

@Controller('probe')
class ProbeController {
  @Post('echo')
  echo(@Body() body: unknown): { body: unknown } {
    return { body: body ?? null };
  }

  @Get('ip')
  ip(@Req() req: Request): { ip: string | undefined } {
    return { ip: req.ip };
  }
}

const webOrigin = process.env.WEB_ORIGIN ?? '';

async function build(create?: (inner: CreateApp) => CreateApp, options = {}) {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv }),
      LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
    ],
    controllers: [ProbeController],
    providers: [{ provide: APP_FILTER, useClass: AppExceptionFilter }],
  }).compile();
  const inner: CreateApp = (adapter, opts) =>
    moduleRef.createNestApplication<NestExpressApplication>(adapter, opts);
  return createHttpApp(create ? create(inner) : inner, { logger: false, ...options });
}

describe('createHttpApp', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await build();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('body parsers', () => {
    it('reads a JSON body', async () => {
      const response = await request(app.getHttpServer()).post('/probe/echo').send({ a: 1 });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ body: { a: 1 } });
    });

    it('does not read a urlencoded body (spec 0006 F26)', async () => {
      const response = await request(app.getHttpServer())
        .post('/probe/echo')
        .type('form')
        .send('a=1&b=2');

      expect(response.body).toEqual({ body: null });
    });
  });

  describe('CORS', () => {
    it('answers a preflight from the web origin with credentials allowed', async () => {
      const response = await request(app.getHttpServer())
        .options('/probe/echo')
        .set('Origin', webOrigin)
        .set('Access-Control-Request-Method', 'POST');

      expect(response.headers['access-control-allow-origin']).toBe(webOrigin);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('allows the web origin on a normal request', async () => {
      const response = await request(app.getHttpServer())
        .post('/probe/echo')
        .set('Origin', webOrigin)
        .send({});

      expect(response.headers['access-control-allow-origin']).toBe(webOrigin);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    // With a single configured origin the cors package always answers that origin, so a browser
    // on another origin is refused because the value differs from its own.
    it('never allows another origin', async () => {
      const response = await request(app.getHttpServer())
        .post('/probe/echo')
        .set('Origin', 'https://evil.example')
        .send({});

      expect(response.headers['access-control-allow-origin']).not.toBe('https://evil.example');
      expect(response.headers['access-control-allow-origin']).not.toBe('*');
    });

    it('keeps the CORS header on a 413 answer', async () => {
      const response = await request(app.getHttpServer())
        .post('/probe/echo')
        .set('Origin', webOrigin)
        .send({ big: 'x'.repeat(2 * 1024 * 1024) });

      expect(response.status).toBe(413);
      expect(response.body).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
      expect(response.headers['access-control-allow-origin']).toBe(webOrigin);
    });
  });

  describe('trust proxy', () => {
    it('ignores X-Forwarded-For in Express', async () => {
      const forwarded = await request(app.getHttpServer())
        .get('/probe/ip')
        .set('X-Forwarded-For', '203.0.113.7');

      expect(forwarded.body.ip).not.toContain('203.0.113.7');
      expect(app.getHttpAdapter().getInstance().get('trust proxy')).toBe(false);
    });
  });
});

describe('createHttpApp create callback', () => {
  it('gets an AppExpressAdapter and the options with bodyParser forced off', async () => {
    const seen = vi.fn();
    const spied = await build(
      (inner) => (adapter, options) => {
        seen(adapter, options);
        return inner(adapter, options);
      },
      // A caller that bypasses the type still cannot turn the default parsers on.
      { bodyParser: true },
    );
    await spied.close();

    expect(seen).toHaveBeenCalledTimes(1);
    const [adapter, options] = seen.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(adapter).toBeInstanceOf(AppExpressAdapter);
    expect(options).toEqual({ logger: false, bodyParser: false });
  });
});
