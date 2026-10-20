import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import type { Env } from '../config/env.js';
import { parseLargeCatalogCount } from './large-catalog.data.js';
import { LargeCatalogModule } from './large-catalog.module.js';
import { LargeCatalogService } from './large-catalog.service.js';

// Entry point of the development catalog (`npm run seed:dev-large -- 50000`, spec 0014 plan §2.8):
// the demo seed, then generated products up to the count given, 2000 by default. Exits 0 when done,
// 1 on an error. Development only: the file is in the production image too (nest build compiles all
// of src/), and there it would fill the real catalog, so it refuses.
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(LargeCatalogModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  try {
    const config = app.get<ConfigService<Env, true>>(ConfigService);
    if (config.get('NODE_ENV', { infer: true }) === 'production') {
      throw new Error('The development catalog does not run in production');
    }
    const count = parseLargeCatalogCount(process.argv[2]);
    await app.get(LargeCatalogService).run(count);
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
