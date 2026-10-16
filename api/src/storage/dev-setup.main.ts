import 'reflect-metadata';

import { S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import type { Env } from '../config/env.js';
import { CoreModule } from '../core/core.module.js';
import { setUpBucket } from './dev-setup.js';

// Entry point of the compose service `s3-init` (`npm run storage:setup:dev`): the local counterpart
// of the owner's setup of the bucket (spec 0011 M14). Exits 0 when done, 1 on an error, so the
// services that depend on it do not start. Development only: the file is in the production image
// too (nest build compiles all of src/), and there it would open media/ to everyone, so it refuses.
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(CoreModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  if (config.get('NODE_ENV', { infer: true }) === 'production') {
    logger.error('The emulator setup does not run in production: the owner sets the bucket up');
    process.exitCode = 1;
    await app.close();
    return;
  }
  const bucket = config.get('S3_BUCKET', { infer: true });
  const client = new S3Client({
    endpoint: config.get('S3_ENDPOINT', { infer: true }),
    region: config.get('S3_REGION', { infer: true }),
    credentials: {
      accessKeyId: config.get('S3_ACCESS_KEY_ID', { infer: true }),
      secretAccessKey: config.get('S3_SECRET_ACCESS_KEY', { infer: true }),
    },
    forcePathStyle: true,
  });

  try {
    await setUpBucket(client, bucket);
    logger.log(`Bucket ${bucket}: media/ readable by anyone, tmp/ expires after a day`);
  } catch (error) {
    logger.error(error);
    process.exitCode = 1;
  } finally {
    client.destroy();
    await app.close();
  }
}

// A failure while Nest builds the context (e.g. invalid environment) is logged by Nest, which exits
// with 1 itself.
await bootstrap();
