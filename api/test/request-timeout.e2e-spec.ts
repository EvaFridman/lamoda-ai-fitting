import {
  BadRequestException,
  Controller,
  Get,
  type INestApplication,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppExceptionFilter } from '../src/common/filters/app-exception.filter.js';
import { createHttpApp } from '../src/common/http/http-app.js';
import { validateEnv } from '../src/config/env.js';

const TIMEOUT_MS = 100;
const SLOW_MS = 1_000;

const timers = new Set<NodeJS.Timeout>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timers.add(timer);
  });
}

@Controller('probe')
class ProbeController {
  @Get('slow')
  async slow(): Promise<{ ok: boolean }> {
    await sleep(SLOW_MS);
    return { ok: true };
  }

  @Get('fast')
  async fast(): Promise<{ ok: boolean }> {
    await sleep(10);
    return { ok: true };
  }

  @Get('fails')
  async fails(): Promise<never> {
    await sleep(10);
    throw new NotFoundException('gone');
  }

  @Get('bad')
  bad(): never {
    throw new BadRequestException('nope');
  }
}

describe('request timeout (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    vi.stubEnv('REQUEST_TIMEOUT_MS', String(TIMEOUT_MS));
    // Their sum must stay under the request timeout (env.ts).
    vi.stubEnv('DATABASE_STATEMENT_TIMEOUT_MS', '40');
    vi.stubEnv('DATABASE_CONNECTION_TIMEOUT_MS', '40');
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv }),
        LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
      ],
      controllers: [ProbeController],
      providers: [{ provide: APP_FILTER, useClass: AppExceptionFilter }],
    }).compile();
    app = await createHttpApp(
      (adapter, options) =>
        moduleRef.createNestApplication<NestExpressApplication>(adapter, options),
      { logger: false },
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    for (const timer of timers) clearTimeout(timer);
    vi.unstubAllEnvs();
  });

  it('answers 503 SERVICE_UNAVAILABLE in the error format for a route slower than the timeout', async () => {
    const response = await request(app.getHttpServer()).get('/probe/slow');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: { code: 'SERVICE_UNAVAILABLE', message: expect.any(String), details: [] },
    });
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
  });

  it('answers 503 every time the same route times out, reported or not', async () => {
    const first = await request(app.getHttpServer()).get('/probe/slow');
    const second = await request(app.getHttpServer()).get('/probe/slow');

    for (const response of [first, second]) {
      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
    }
  });

  it('logs how a handler that timed out ended, with the request id of the 503', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn');

    try {
      const response = await request(app.getHttpServer()).get('/probe/slow');

      expect(response.status).toBe(503);
      const requestId = response.headers['x-request-id'];
      await vi.waitFor(
        () =>
          expect(warn).toHaveBeenCalledWith(
            expect.objectContaining({
              msg: 'A handler that timed out has ended',
              route: 'ProbeController.slow',
              requestId,
              outcome: 'succeeded',
            }),
          ),
        { timeout: 3_000 },
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('answers a route faster than the timeout normally', async () => {
    const response = await request(app.getHttpServer()).get('/probe/fast');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it('keeps the code of an error a fast handler throws', async () => {
    const response = await request(app.getHttpServer()).get('/probe/fails');

    expect(response.status).toBe(404);
    expect(response.body.error.code).not.toBe('SERVICE_UNAVAILABLE');
  });

  it('keeps the code of a synchronous error', async () => {
    const response = await request(app.getHttpServer()).get('/probe/bad');

    expect(response.status).toBe(400);
    expect(response.body.error.code).not.toBe('SERVICE_UNAVAILABLE');
  });
});
