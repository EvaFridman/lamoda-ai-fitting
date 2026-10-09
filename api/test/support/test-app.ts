import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../src/app.module.js';
import { AppExpressAdapter } from '../../src/common/http/app-express.adapter.js';
import { createValidationPipe } from '../../src/common/validation/validation-pipe.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { createTestDatabase } from './test-database.js';

export interface TestApp {
  app: INestApplication;
  // The client the app's PrismaService is replaced with: for arranging rows and checking them.
  prisma: PrismaClient;
  close: () => Promise<void>;
}

// The whole api on a database of the test file's own (test-database.ts), for specs under
// test/database/. Built like src/main.ts: the adapter keeps body-parser's errors apart, the pipe is
// global. Redis and Temporal point at closed ports (vitest.config.ts). Call once per file in
// `beforeAll` and `close()` in `afterAll`.
export async function createTestApp(): Promise<TestApp> {
  const prisma = await createTestDatabase();
  try {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    const app = moduleRef.createNestApplication(new AppExpressAdapter(), { logger: false });
    app.useGlobalPipes(createValidationPipe());
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
