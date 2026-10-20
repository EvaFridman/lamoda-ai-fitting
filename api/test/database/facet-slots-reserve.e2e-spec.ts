import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { type Env, validateEnv } from '../../src/config/env.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import type { TestApp } from '../support/test-app.js';

// A pool of 4 gives the filter counts 2 slots (spec 0014 O62): however many counts a client sends,
// two connections stay for the other routes.
describe('filter counts and the reserved half of the pool (e2e)', () => {
  let testApp: TestApp;
  let prisma: PrismaService;
  let locker: PrismaClient;
  let release: () => void = () => undefined;
  let lockHolder: Promise<unknown> = Promise.resolve();

  beforeAll(async () => {
    // ConfigModule reads the environment when AppModule is imported: stub first, import after.
    vi.stubEnv('REQUEST_TIMEOUT_MS', '2000');
    vi.stubEnv('DATABASE_STATEMENT_TIMEOUT_MS', '400');
    vi.stubEnv('DATABASE_CONNECTION_TIMEOUT_MS', '400');
    vi.stubEnv('DATABASE_POOL_MAX', '4');
    const { createTestApp } = await import('../support/test-app.js');
    const { createTestDatabaseUrl } = await import('../support/test-database.js');
    const connectionString = await createTestDatabaseUrl();
    const env = validateEnv({ ...process.env, DATABASE_URL: connectionString });
    prisma = new PrismaService(new ConfigService<Env, true>(env));
    locker = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    testApp = await createTestApp({
      override: (builder) => builder.overrideProvider(PrismaService).useValue(prisma),
    });
  });

  afterAll(async () => {
    release();
    await Promise.allSettled([lockHolder]);
    await testApp?.close();
    await prisma?.$disconnect();
    await locker?.$disconnect();
    vi.unstubAllEnvs();
  });

  it('answers 503 to the counts while products is locked, and still serves another route', async () => {
    let acquired: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    lockHolder = locker.$transaction(
      async (tx) => {
        await tx.$executeRaw`LOCK TABLE products IN ACCESS EXCLUSIVE MODE`;
        acquired();
        await released;
      },
      { maxWait: 5_000, timeout: 60_000 },
    );
    await ready;
    const server = testApp.app.getHttpServer();

    const [brands, ...facets] = await Promise.all([
      request(server).get('/brands'),
      ...Array.from({ length: 5 }, () => request(server).get('/products/facets')),
    ]);

    expect(facets.map((response) => response.status)).toEqual([503, 503, 503, 503, 503]);
    for (const response of facets) {
      expect(response.body).toEqual({
        error: { code: 'SERVICE_UNAVAILABLE', message: expect.any(String), details: [] },
      });
    }
    expect(brands.status).toBe(200);
  });
});
