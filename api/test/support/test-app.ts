import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { ThrottlerStorage } from '@nestjs/throttler';

import { AppModule } from '../../src/app.module.js';
import { createHttpApp } from '../../src/common/http/http-app.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { FallbackThrottlerStorage } from '../../src/throttling/fallback-throttler-storage.js';
import { createTestDatabase } from './test-database.js';

export interface TestApp {
  app: INestApplication;
  // The client the app's PrismaService is replaced with: for arranging rows and checking them.
  prisma: PrismaClient;
  close: () => Promise<void>;
}

// Every request of a spec comes from one address and the tiers allow five per route in tests, so the
// rate limit is off here; test/throttling-tiers.e2e-spec.ts checks it.
const unlimited: Pick<ThrottlerStorage, 'increment'> = {
  increment: () =>
    Promise.resolve({ totalHits: 1, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 }),
};

// The whole api on a database of the test file's own (test-database.ts), for specs under
// test/database/. Set up by createHttpApp, as src/server.ts is. Redis and Temporal point at closed
// ports (vitest.config.ts); there is no rate limit.
// Call once per file in `beforeAll` and `close()` in `afterAll`.
export async function createTestApp(): Promise<TestApp> {
  const prisma = await createTestDatabase();
  try {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(FallbackThrottlerStorage)
      .useValue(unlimited)
      .compile();
    const app = await createHttpApp(
      (adapter, options) =>
        moduleRef.createNestApplication<NestExpressApplication>(adapter, options),
      { logger: false },
    );
    await app.init();
    return {
      app,
      prisma,
      close: async () => {
        try {
          await app.close();
        } finally {
          await prisma.$disconnect();
        }
      },
    };
  } catch (error) {
    await prisma.$disconnect();
    throw error;
  }
}
