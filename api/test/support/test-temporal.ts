import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { NativeConnection, Runtime, Worker } from '@temporalio/worker';
import { inject } from 'vitest';

import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type { StorageService } from '../../src/storage/storage.service.js';
import { createActivities } from '../../src/temporal/activities/index.js';
import type { TemporalSettings } from '../../src/temporal/temporal-settings.js';

// The throwaway Temporal (temporal.ts), for specs under test/database/. Files share the server, so
// each passes a task queue of its own (a new one per call here) to createTestApp() and to its
// worker: workflows of one file never run on another file's worker.
export function testTemporalSettings(taskQueue = `test-${randomUUID()}`): TemporalSettings {
  return { address: inject('temporalAddress'), namespace: 'default', taskQueue };
}

export interface TestWorker {
  // Stops polling, lets the running activities end, and closes the worker's connection.
  stop: () => Promise<void>;
}

let runtimeInstalled = false;

// A worker of the app's workflows and activities on `settings.taskQueue`, as run-worker.ts builds
// it, with the activities' services given by the test (a StorageService on the emulator, the
// client of the throwaway database, such as a TestApp's `prisma`). Bundling the workflows takes
// seconds: start it in `beforeAll` with a long timeout, `stop()` in `afterAll`.
export function startTestWorker(
  settings: TemporalSettings,
  storage: StorageService,
  prisma: PrismaClient,
): Promise<TestWorker> {
  return startTestWorkerWith(settings, createActivities(storage, prisma));
}

// The same worker with activities of the test, e.g. stubs, to check a workflow's own logic apart
// from the storage.
export async function startTestWorkerWith(
  settings: TemporalSettings,
  activities: object,
): Promise<TestWorker> {
  if (!runtimeInstalled) {
    // The worker's own logs (bundling, polling) stay out of the test output; failures still throw.
    // The runtime is installed once per process, before the first connection.
    Runtime.install({
      logger: {
        log: () => {},
        trace: () => {},
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      },
    });
    runtimeInstalled = true;
  }
  const connection = await NativeConnection.connect({ address: settings.address });
  try {
    const worker = await Worker.create({
      connection,
      namespace: settings.namespace,
      taskQueue: settings.taskQueue,
      workflowsPath: fileURLToPath(
        new URL('../../src/temporal/workflows/index.ts', import.meta.url),
      ),
      activities,
    });
    const running = worker.run();
    return {
      stop: async () => {
        try {
          worker.shutdown();
          await running;
        } finally {
          await connection.close();
        }
      },
    };
  } catch (error) {
    await connection.close();
    throw error;
  }
}
