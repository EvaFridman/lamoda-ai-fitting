import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { createHttpApp } from '../src/common/http/http-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { emptyCatalogPrisma } from './support/empty-catalog.js';

// The rate limit of Better Auth's routes (spec 0013 plan §5). Redis points at a closed port
// (vitest.config.ts), so the counters run on the in-memory fallback; the test environment gives five
// requests per minute for each tier. Nothing here reaches the database: get-session without a
// cookie and a sign-in with an invalid body are answered before it.
describe('rate limit of /api/auth (e2e)', () => {
  let app: INestApplication | undefined;

  // A new app per test: its counters start empty.
  beforeEach(async () => {
    await app?.close();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(emptyCatalogPrisma())
      .compile();
    app = await createHttpApp(
      (adapter, options) =>
        moduleRef.createNestApplication<NestExpressApplication>(adapter, options),
      { logger: false },
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  const server = (): ReturnType<INestApplication['getHttpServer']> => app?.getHttpServer();
  const getSession = (path = '/api/auth/get-session'): request.Test => request(server()).get(path);
  const signIn = (path = '/api/auth/sign-in/social'): request.Test =>
    request(server()).post(path).set('Origin', 'http://localhost:3001').send({});

  async function statuses(call: () => request.Test, times: number): Promise<number[]> {
    const result: number[] = [];
    for (let i = 0; i < times; i += 1) result.push((await call()).status);
    return result;
  }

  it('answers a GET normally up to the read limit', async () => {
    const result = await statuses(() => getSession(), 5);

    expect(result).toEqual([200, 200, 200, 200, 200]);
  });

  it('answers 429 in the api format with Retry-After on the sixth GET', async () => {
    await statuses(() => getSession(), 5);

    const response = await getSession();

    expect(response.status).toBe(429);
    expect(String(response.headers['retry-after'])).toMatch(/^[1-9]\d*$/);
    expect(Number(response.headers['retry-after'])).toBeLessThanOrEqual(60);
    expect(response.body).toMatchObject({ error: { code: 'TOO_MANY_REQUESTS' } });
  });

  it('does not reset the counter when the path changes', async () => {
    await statuses(() => getSession(), 2);

    const varied = await statuses(
      () => getSession(`/api/auth/anything-${Math.random().toString(36).slice(2)}`),
      4,
    );

    expect(varied.slice(0, 3)).not.toContain(429);
    expect(varied[3]).toBe(429);
  });

  it('counts a POST sign-in in the expensive tier, apart from the read one', async () => {
    const result = await statuses(() => signIn(), 6);

    expect(result.slice(0, 5)).not.toContain(429);
    expect(result[5]).toBe(429);
    expect((await getSession()).status).toBe(200);
  });

  it('answers 429 to a sign-in in the api format with Retry-After', async () => {
    await statuses(() => signIn(), 5);

    const response = await signIn();

    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBeDefined();
    expect(response.body).toMatchObject({ error: { code: 'TOO_MANY_REQUESTS' } });
  });

  it('shares the expensive counter between sign-in paths, in any letter case', async () => {
    const paths = [
      '/api/auth/sign-in/social',
      '/api/auth/SIGN-IN/social',
      '/api/auth/sign-in/other-1',
      '/api/auth/sign-in/other-2',
      '/api/auth/Sign-In/other-3',
      '/api/auth/sign-in/other-4',
    ];

    const result = await Promise.all(paths.map((path) => signIn(path)));

    expect(result.filter((response) => response.status === 429)).toHaveLength(1);
  });

  // Sent with node:http, which keeps the path as given (supertest may tidy it).
  async function rawSignIn(path: string): Promise<number> {
    const http = app?.getHttpServer() as Server;
    if (!http.listening) await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    const { port } = http.address() as AddressInfo;
    return new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        {
          host: '127.0.0.1',
          port,
          path,
          method: 'POST',
          headers: { Origin: 'http://localhost:3001', 'Content-Type': 'application/json' },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on('error', reject);
      req.end('{}');
    });
  }

  it('counts a sign-in behind `..` and `%2e%2e` in the expensive counter', async () => {
    const result: number[] = [];
    for (const path of [
      '/api/auth/x/../sign-in/social',
      '/api/auth/x/%2e%2e/sign-in/social',
      '/api/auth/x/../sign-in/social',
      '/api/auth/x/%2E%2E/sign-in/social',
      '/api/auth/x/../sign-in/social',
    ]) {
      result.push(await rawSignIn(path));
    }

    expect(result).not.toContain(429);
    expect((await signIn()).status).toBe(429);
    expect(await rawSignIn('/api/auth/x/%2e%2e/sign-in/social')).toBe(429);
  });

  it('counts any other POST in the write tier, leaving read and expensive open', async () => {
    const signOut = (): request.Test =>
      request(server()).post('/api/auth/sign-out').set('Origin', 'http://localhost:3001').send({});

    const result = await statuses(signOut, 6);

    expect(result.slice(0, 5)).not.toContain(429);
    expect(result[5]).toBe(429);
    expect((await getSession()).status).toBe(200);
    expect((await signIn()).status).not.toBe(429);
  });

  it('counts the routes Better Auth refuses too', async () => {
    const disabled = (): request.Test => request(server()).get('/api/auth/list-accounts');

    const result = await statuses(disabled, 6);

    expect(result.slice(0, 5)).toEqual([404, 404, 404, 404, 404]);
    expect(result[5]).toBe(429);
  });

  it("leaves the api's own routes with their own counters", async () => {
    await statuses(() => getSession(), 6);

    expect((await request(server()).get('/categories')).status).toBe(200);
  });
});
