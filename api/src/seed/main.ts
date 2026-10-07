import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { SeedModule } from './seed.module.js';
import { SeedService } from './seed.service.js';

// Entry point of the seed: same image as the api, different command (`npm run seed`, or
// `npm run seed:dev` from sources). Loads the demo catalog and exits: 0 when done, 1 on an error,
// so a deploy that runs it stops on a failure (spec 0002, C16).
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(SeedModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  try {
    await app.get(SeedService).run();
  } catch (error) {
    logger.error(error);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

// A failure while Nest builds the context (e.g. invalid environment) is logged by Nest, which exits
// with 1 itself.
await bootstrap();
