import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { type Env, validateEnv } from '../../src/config/env.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import type { TestApp } from '../support/test-app.js';

// A pool of 2 gives the filter counts one slot (spec 0014 O62): the 7 queries of a cache miss run one
// after the other, and the answer is still 200.
describe('filter counts with a single slot (e2e)', () => {
  let testApp: TestApp;
  let prisma: PrismaService;

  beforeAll(async () => {
    // ConfigModule reads the environment when AppModule is imported: stub first, import after.
    vi.stubEnv('REQUEST_TIMEOUT_MS', '5000');
    vi.stubEnv('DATABASE_STATEMENT_TIMEOUT_MS', '1000');
    vi.stubEnv('DATABASE_CONNECTION_TIMEOUT_MS', '1000');
    vi.stubEnv('DATABASE_POOL_MAX', '2');
    const { createTestApp } = await import('../support/test-app.js');
    const { createTestDatabaseUrl } = await import('../support/test-database.js');
    const env = validateEnv({ ...process.env, DATABASE_URL: await createTestDatabaseUrl() });
    prisma = new PrismaService(new ConfigService<Env, true>(env));
    testApp = await createTestApp({
      override: (builder) => builder.overrideProvider(PrismaService).useValue(prisma),
    });
  });

  afterAll(async () => {
    await testApp?.close();
    await prisma?.$disconnect();
    vi.unstubAllEnvs();
  });

  it('answers 200 on a cache miss, with the queries serialised', async () => {
    const response = await request(testApp.app.getHttpServer()).get('/products/facets');

    expect(response.status).toBe(200);
  });

  it('answers 200 to several counts at once', async () => {
    const responses = await Promise.all(
      Array.from({ length: 4 }, () => request(testApp.app.getHttpServer()).get('/products/facets')),
    );

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200]);
  });
});
