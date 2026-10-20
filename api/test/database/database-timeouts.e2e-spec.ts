import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as Sentry from '@sentry/nestjs';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { type Env, validateEnv } from '../../src/config/env.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import type { TestApp } from '../support/test-app.js';

// Only the outage reports are counted; every other export stays real.
vi.mock('@sentry/nestjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/nestjs')>()),
  captureException: vi.fn(),
}));

// The database pool and its timeouts (spec 0014 plan §2.7, O18, O36, O59), with the same small
// values: createTestApp() builds its client without them, so the app's PrismaService is replaced
// here with a real PrismaService built from the validated env (which covers its wiring).
const STATEMENT_TIMEOUT_MS = 300;
const CONNECTION_TIMEOUT_MS = 300;
const POOL_MAX = 2;

const SERVICE_UNAVAILABLE = {
  error: { code: 'SERVICE_UNAVAILABLE', message: expect.any(String), details: [] },
};

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the promise to reject');
}

describe('database pool and timeouts (e2e)', () => {
  let testApp: TestApp;
  // The app's client, with the pool and the timeouts.
  let prisma: PrismaClient;
  // A client of its own, with no limits, to hold locks the app's queries then wait for.
  let locker: PrismaClient;
  let databaseEnv: Env;
  const releases: (() => void)[] = [];
  const holders: Promise<unknown>[] = [];

  // Holds one connection of `client` in an open transaction until release().
  async function hold(
    client: PrismaClient,
    statement: 'select' | 'lock',
    table: 'brands' | 'categories' | 'attribute_values' = 'brands',
  ): Promise<void> {
    let acquired: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const released = new Promise<void>((resolve) => releases.push(resolve));
    holders.push(
      client.$transaction(
        async (tx) => {
          if (statement === 'lock') {
            // Identifiers cannot be bound; `table` is one of two constants.
            await tx.$executeRawUnsafe(`LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE`);
          } else await tx.$queryRaw`SELECT 1`;
          acquired();
          await released;
        },
        { maxWait: 5_000, timeout: 60_000 },
      ),
    );
    await ready;
  }

  async function releaseAll(): Promise<void> {
    for (const release of releases.splice(0)) release();
    await Promise.allSettled(holders.splice(0));
  }

  beforeAll(async () => {
    // ConfigModule reads the environment when AppModule is imported: stub first, import after.
    vi.stubEnv('REQUEST_TIMEOUT_MS', '2000');
    vi.stubEnv('DATABASE_STATEMENT_TIMEOUT_MS', String(STATEMENT_TIMEOUT_MS));
    vi.stubEnv('DATABASE_CONNECTION_TIMEOUT_MS', String(CONNECTION_TIMEOUT_MS));
    vi.stubEnv('DATABASE_POOL_MAX', String(POOL_MAX));
    const { createTestApp } = await import('../support/test-app.js');
    const { createTestDatabaseUrl } = await import('../support/test-database.js');
    const connectionString = await createTestDatabaseUrl();
    databaseEnv = validateEnv({ ...process.env, DATABASE_URL: connectionString });
    expect(databaseEnv).toMatchObject({
      DATABASE_POOL_MAX: POOL_MAX,
      DATABASE_STATEMENT_TIMEOUT_MS: STATEMENT_TIMEOUT_MS,
      DATABASE_CONNECTION_TIMEOUT_MS: CONNECTION_TIMEOUT_MS,
    });
    prisma = new PrismaService(new ConfigService<Env, true>(databaseEnv));
    locker = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    testApp = await createTestApp({
      override: (builder) => builder.overrideProvider(PrismaService).useValue(prisma),
    });
  });

  afterEach(releaseAll);

  afterAll(async () => {
    await releaseAll();
    await testApp?.close();
    await prisma?.$disconnect();
    await locker?.$disconnect();
    vi.unstubAllEnvs();
  });

  describe('a statement past the statement timeout', () => {
    it('is cancelled by Postgres with SQLSTATE 57014 behind a Prisma error', async () => {
      const error = await rejection(prisma.$queryRaw`SELECT pg_sleep(2)`);

      expect(error).toMatchObject({
        code: 'P2010',
        meta: { driverAdapterError: { cause: { originalCode: '57014' } } },
      });
    });

    it('answers 503 SERVICE_UNAVAILABLE in the error format', async () => {
      await hold(locker, 'lock');

      const response = await request(testApp.app.getHttpServer()).get('/brands');

      expect(response.status).toBe(503);
      expect(response.body).toEqual(SERVICE_UNAVAILABLE);
    });

    it('sends one Sentry event for 20 requests of one route that hit the timeout (O60)', async () => {
      // A route no earlier test of the file hit, as the filter counts per route for a minute.
      await hold(locker, 'lock', 'categories');
      vi.mocked(Sentry.captureException).mockClear();

      // Four waves of five: more at once would add listeners to the unlistened server (a Node warning).
      const responses = [];
      for (let wave = 0; wave < 4; wave += 1) {
        responses.push(
          ...(await Promise.all(
            Array.from({ length: 5 }, () =>
              request(testApp.app.getHttpServer()).get('/categories'),
            ),
          )),
        );
      }

      expect(responses.map((response) => response.status)).toEqual(Array(20).fill(503));
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      expect(Sentry.captureException).toHaveBeenCalledWith(expect.anything(), {
        tags: { 'error.code': 'SERVICE_UNAVAILABLE' },
      });
    });

    it('answers normally again once the lock is gone', async () => {
      const response = await request(testApp.app.getHttpServer()).get('/brands');

      expect(response.status).toBe(200);
    });
  });

  describe('with every pool connection held', () => {
    it('answers 503 SERVICE_UNAVAILABLE for GET /products and still serves /health/live', async () => {
      for (let i = 0; i < POOL_MAX; i += 1) await hold(prisma, 'select');

      const products = await request(testApp.app.getHttpServer()).get('/products');
      const brands = await request(testApp.app.getHttpServer()).get('/brands');
      const live = await request(testApp.app.getHttpServer()).get('/health/live');

      expect(products.status).toBe(503);
      expect(products.body).toEqual(SERVICE_UNAVAILABLE);
      expect(brands.status).toBe(503);
      expect(brands.body).toEqual(SERVICE_UNAVAILABLE);
      expect(live.status).toBe(200);
    });

    it('fails a plain query with the pool timeout of pg, after the connection timeout', async () => {
      for (let i = 0; i < POOL_MAX; i += 1) await hold(prisma, 'select');

      const error = await rejection(prisma.brand.findMany());

      expect((error as Error).message).toContain('timeout exceeded when trying to connect');
      expect(error).not.toHaveProperty('code');
    });

    // to-app-exception.ts tells these two P2028 messages from a misused transaction by their text.
    it('fails a transaction past maxWait with P2028 and the text the filter looks for', async () => {
      for (let i = 0; i < POOL_MAX; i += 1) await hold(prisma, 'select');

      const error = await rejection(
        prisma.$transaction(async (tx) => tx.brand.findMany(), { maxWait: 100, timeout: 100 }),
      );

      expect(error).toMatchObject({
        code: 'P2028',
        message: expect.stringContaining('Unable to start a transaction in the given time'),
      });
    });

    it('gives every transaction the env timeouts, not those of Prisma, by default', async () => {
      for (let i = 0; i < POOL_MAX; i += 1) await hold(prisma, 'select');
      const started = Date.now();

      const error = await rejection(prisma.$transaction(async (tx) => tx.brand.findMany()));

      expect(error).toMatchObject({
        code: 'P2028',
        message: expect.stringContaining('Unable to start a transaction in the given time'),
      });
      // Prisma's own maxWait is 2000 ms.
      expect(Date.now() - started).toBeLessThan(1500);
    });

    it('answers 503 for a route that reads in a batch transaction, under a lock', async () => {
      await hold(locker, 'lock', 'categories');

      const response = await request(testApp.app.getHttpServer()).get('/categories');

      expect(response.status).toBe(503);
      expect(response.body).toEqual(SERVICE_UNAVAILABLE);
    });

    it('answers 503 for a route that reads in a batch transaction, with no connection', async () => {
      for (let i = 0; i < POOL_MAX; i += 1) await hold(prisma, 'select');

      const response = await request(testApp.app.getHttpServer()).get('/categories');

      expect(response.status).toBe(503);
      expect(response.body).toEqual(SERVICE_UNAVAILABLE);
    });

    it('serves GET /products again once the connections are released', async () => {
      const response = await request(testApp.app.getHttpServer()).get('/products');

      expect(response.status).toBe(200);
    });
  });

  describe('the seed client', () => {
    it('runs a statement longer than the statement timeout', async () => {
      const { UnlimitedPrismaService } = await import('../../src/prisma/prisma.service.js');
      const seedClient = new UnlimitedPrismaService(new ConfigService<Env, true>(databaseEnv));
      try {
        const rows = await seedClient.$queryRaw<
          { one: number }[]
        >`SELECT 1 AS one FROM pg_sleep(${(STATEMENT_TIMEOUT_MS * 2) / 1000})`;

        expect(rows).toEqual([{ one: 1 }]);
      } finally {
        await seedClient.$disconnect();
      }
    });
  });

  describe("the product list's interactive transaction", () => {
    it('answers 503 when the lookup of attributeValueId, inside it, stalls on a lock (O61)', async () => {
      await hold(locker, 'lock', 'attribute_values');

      const response = await request(testApp.app.getHttpServer()).get(
        `/products?attributeValueId=${randomUUID()}`,
      );

      expect(response.status).toBe(503);
      expect(response.body).toEqual(SERVICE_UNAVAILABLE);
    });

    // Prisma cannot interrupt a running statement (that is the statement timeout's job): the
    // transaction timeout shows when the next statement finds the transaction closed.
    it('fails past its timeout with P2028 and the text the filter looks for', async () => {
      const error = await rejection(
        prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT 1 AS one FROM pg_sleep(0.2)`;
            return tx.$queryRaw`SELECT 1 AS one`;
          },
          { maxWait: 100, timeout: 100 },
        ),
      );

      expect(error).toMatchObject({
        code: 'P2028',
        message: expect.stringContaining('expired transaction'),
      });
    });

    it('expires by default after the statement timeout of the env', async () => {
      const error = await rejection(
        prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT 1 AS one FROM pg_sleep(0.2)`;
          await tx.$queryRaw`SELECT 1 AS one FROM pg_sleep(0.2)`;
          return tx.$queryRaw`SELECT 1 AS one`;
        }),
      );

      expect(error).toMatchObject({
        code: 'P2028',
        message: expect.stringContaining('expired transaction'),
      });
    });

    it('answers 503 SERVICE_UNAVAILABLE when a lock on products stalls it', async () => {
      let acquired: () => void = () => undefined;
      const ready = new Promise<void>((resolve) => {
        acquired = resolve;
      });
      const released = new Promise<void>((resolve) => releases.push(resolve));
      holders.push(
        locker.$transaction(
          async (tx) => {
            await tx.$executeRaw`LOCK TABLE products IN ACCESS EXCLUSIVE MODE`;
            acquired();
            await released;
          },
          { maxWait: 5_000, timeout: 60_000 },
        ),
      );
      await ready;

      const response = await request(testApp.app.getHttpServer()).get('/products');

      expect(response.status).toBe(503);
      expect(response.body).toEqual(SERVICE_UNAVAILABLE);
    });
  });
});
