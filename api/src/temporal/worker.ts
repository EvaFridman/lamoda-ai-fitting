import 'reflect-metadata';

import { fileURLToPath } from 'node:url';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NativeConnection, Worker } from '@temporalio/worker';
import { Logger } from 'nestjs-pino';

import type { Env } from '../config/env.js';
import { createActivities } from './activities/hello.activities.js';
import { WorkerModule } from './worker.module.js';

// Entry point of the temporal-worker process: same image as the api, different command.
// Polls TEMPORAL_TASK_QUEUE and runs the workflows and activities registered below.
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  const connection = await NativeConnection.connect({
    address: config.get('TEMPORAL_ADDRESS', { infer: true }),
  });
  const taskQueue = config.get('TEMPORAL_TASK_QUEUE', { infer: true });
  const worker = await Worker.create({
    connection,
    namespace: config.get('TEMPORAL_NAMESPACE', { infer: true }),
    taskQueue,
    // The compiled workflows next to this file (dist/temporal/workflows in the image).
    workflowsPath: fileURLToPath(new URL('./workflows/index.js', import.meta.url)),
    activities: createActivities(),
  });

  logger.log(`Temporal worker polling task queue "${taskQueue}"`);
  // Resolves after SIGTERM/SIGINT: the SDK stops polling and lets running activities finish.
  await worker.run();

  await connection.close();
  await app.close();
}

void bootstrap();
