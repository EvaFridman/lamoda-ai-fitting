import 'reflect-metadata';

import { fileURLToPath } from 'node:url';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ScheduleClient } from '@temporalio/client';
import { NativeConnection, Worker } from '@temporalio/worker';
import { Logger } from 'nestjs-pino';

import { AI_PROVIDER, type AiProvider } from '../ai/ai-provider.js';
import { assertWorkerEnv, type Env, type WorkerEnv, workerEnvWarnings } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { createActivities } from './activities/index.js';
import { AUTH_CLEANUP_SCHEDULE_ID, ensureAuthCleanupSchedule } from './auth-cleanup-schedule.js';
import { ensureHousekeepingSchedule, HOUSEKEEPING_SCHEDULE_ID } from './housekeeping-schedule.js';
import { sentryActivityInterceptor } from './sentry-activity.interceptor.js';
import { WorkerModule } from './worker.module.js';

// The temporal-worker process, loaded by worker.ts once Sentry has started.
// Polls TEMPORAL_TASK_QUEUE and runs the workflows and activities registered below.
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  // The generation runs here (spec 0019 plan §3): production refuses to start without the OpenAI
  // key, elsewhere an empty one selects the fake provider and is logged.
  const workerEnv: WorkerEnv = {
    NODE_ENV: config.get('NODE_ENV', { infer: true }),
    OPENAI_API_KEY: config.get('OPENAI_API_KEY', { infer: true }),
  };
  assertWorkerEnv(workerEnv);
  for (const warning of workerEnvWarnings(workerEnv)) {
    logger.warn(warning);
  }

  const address = config.get('TEMPORAL_ADDRESS', { infer: true });
  const namespace = config.get('TEMPORAL_NAMESPACE', { infer: true });
  const connection = await NativeConnection.connect({ address });
  const taskQueue = config.get('TEMPORAL_TASK_QUEUE', { infer: true });
  const worker = await Worker.create({
    connection,
    namespace,
    taskQueue,
    // The compiled workflows next to this file (dist/temporal/workflows in the image).
    workflowsPath: fileURLToPath(new URL('./workflows/index.js', import.meta.url)),
    // The housekeeping activity and a fitting's `complete` start `deleteFiles` on `taskQueue`
    // through the worker's own client (spec 0019 A38, `Context.current().client`).
    activities: createActivities(
      app.get(StorageService),
      app.get(PrismaService),
      taskQueue,
      app.get<AiProvider>(AI_PROVIDER),
    ),
    interceptors: { activity: [sentryActivityInterceptor] },
  });

  // The schedules of the daily cleanup (spec 0013 N50) and the fitting's housekeeping (spec 0019
  // A38), on the worker's connection. A failure stops the worker; production's compose restarts it
  // (`restart: unless-stopped`), which tries again.
  const schedules = new ScheduleClient({ connection, namespace });
  const authDone = await ensureAuthCleanupSchedule(schedules, taskQueue);
  logger.log(`Temporal schedule "${AUTH_CLEANUP_SCHEDULE_ID}" ${authDone}`);
  const housekeepingDone = await ensureHousekeepingSchedule(schedules, taskQueue);
  logger.log(`Temporal schedule "${HOUSEKEEPING_SCHEDULE_ID}" ${housekeepingDone}`);

  logger.log(`Temporal worker polling task queue "${taskQueue}"`);
  // Resolves after SIGTERM/SIGINT: the SDK stops polling and cancels the running activities (no
  // grace time), whose next attempt runs on the next worker.
  await worker.run();

  await connection.close();
  await app.close();
}

void bootstrap();
