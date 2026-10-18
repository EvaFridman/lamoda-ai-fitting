import type { INestApplication, WebSocketAdapter } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { ThrottlerStorage } from '@nestjs/throttler';

import { AppModule } from '../../src/app.module.js';
import { AccessGuard } from '../../src/common/auth/access.guard.js';
import { createHttpApp } from '../../src/common/http/http-app.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { STORAGE_SETTINGS } from '../../src/storage/s3-client.provider.js';
import { TEMPORAL_SETTINGS, type TemporalSettings } from '../../src/temporal/temporal-settings.js';
import { FallbackThrottlerStorage } from '../../src/throttling/fallback-throttler-storage.js';
import { TestAccessGuard } from './test-access-guard.js';
import { createTestDatabase } from './test-database.js';
import { testStorageSettings } from './test-storage.js';
import { testTemporalSettings } from './test-temporal.js';

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
// test/database/. Set up by createHttpApp, as src/server.ts is. StorageService uses the throwaway
// emulator (storage.ts); workflows start on the throwaway Temporal (temporal.ts), on `temporal`'s
// task queue, by default a new one no worker polls (a delete's workflow then waits there); Redis
// points at a closed port (vitest.config.ts); there is no rate limit, and a signed-in user
// (sign-in.ts) passes the @Closed() routes too (test-access-guard.ts), unless
// `access: 'production'` keeps the real guard (the access e2e, spec 0013 AC7, AC9).
// `override` replaces more providers; `socketAdapter` is set before init(), as server.ts sets it
// before listen() (the socket e2e then listens on a port of its own).
// Call once per file in `beforeAll` and `close()` in `afterAll`.
export async function createTestApp(
  options: {
    temporal?: TemporalSettings;
    access?: 'test' | 'production';
    override?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
    socketAdapter?: (app: INestApplication) => WebSocketAdapter;
  } = {},
): Promise<TestApp> {
  const temporal = options.temporal ?? testTemporalSettings();
  const prisma = await createTestDatabase();
  try {
    let builder = Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(STORAGE_SETTINGS)
      .useValue(testStorageSettings())
      .overrideProvider(TEMPORAL_SETTINGS)
      .useValue(temporal)
      .overrideProvider(FallbackThrottlerStorage)
      .useValue(unlimited);
    if (options.access !== 'production') {
      builder.overrideProvider(AccessGuard).useClass(TestAccessGuard);
    }
    if (options.override !== undefined) builder = options.override(builder);
    const moduleRef = await builder.compile();
    const app = await createHttpApp(
      (adapter, options) =>
        moduleRef.createNestApplication<NestExpressApplication>(adapter, options),
      { logger: false },
    );
    if (options.socketAdapter !== undefined) app.useWebSocketAdapter(options.socketAdapter(app));
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
