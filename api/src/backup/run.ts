import * as Sentry from '@sentry/nestjs';
import { pino } from 'pino';

import { copyBucket } from './bucket.js';
import { createBackupClients, validateBackupEnv } from './config.js';
import { copyDatabase } from './database.js';
import {
  type BackupJob,
  type NightlyRun,
  reportCutOff,
  runBackup,
  runNightly,
  runService,
  systemClock,
} from './service.js';

// The backup job's process, loaded by main.ts once Sentry has started (plan §4). No argument: the
// nightly service. `--once`: one copy now, with no check-in. Exits 0 when done, 1 on an error.
async function bootstrap(): Promise<void> {
  const args = process.argv.slice(2);
  const once = args.length === 1 && args[0] === '--once';
  // Plain JSON lines: the backup image has no pino-pretty, and no Nest context is built.
  // LOG_LEVEL is applied once validated: pino throws on an unknown level.
  const logger = pino({ level: 'info', base: { job: 'backup' } });
  if (args.length > 0 && !once) {
    logger.error('Usage: main.js [--once]');
    process.exitCode = 1;
    return;
  }

  let env;
  try {
    env = validateBackupEnv(process.env);
  } catch (error) {
    // The message names the variables, never their values.
    logger.error((error as Error).message);
    process.exitCode = 1;
    return;
  }
  logger.level = env.LOG_LEVEL;

  const clients = createBackupClients(env);
  const job: BackupJob = {
    logger,
    copyDatabase: (key) =>
      copyDatabase({
        databaseUrl: env.DATABASE_URL,
        recipient: env.BACKUP_AGE_RECIPIENT,
        client: clients.write,
        bucket: env.BACKUP_BUCKET,
        key,
        logger,
      }),
    copyBucket: (key) =>
      copyBucket({
        recipient: env.BACKUP_AGE_RECIPIENT,
        source: clients.read,
        sourceBucket: env.S3_BUCKET,
        target: clients.write,
        targetBucket: env.BACKUP_BUCKET,
        key,
        logger,
      }),
  };

  // Node as the container's first process ignores SIGTERM without a handler. A nightly run cut off
  // here checks in as failed (P21).
  let running = false;
  const nightly: NightlyRun = {};
  const stopped = new AbortController();
  const stop = (signal: NodeJS.Signals) => {
    logger.info({ signal, running }, 'Backup job stopping');
    stopped.abort();
    if (running) {
      reportCutOff(nightly);
      process.exitCode = 1;
      void Sentry.flush(2000).finally(() => process.exit());
    }
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);

  try {
    if (once) {
      running = true;
      await runBackup(new Date(), job);
    } else {
      await runService({
        clock: systemClock,
        signal: stopped.signal,
        logger,
        night: async (at) => {
          running = true;
          try {
            await runNightly(at, job, nightly);
          } finally {
            running = false;
            // A check-in is sent in the background; one night's must not wait for the next.
            await Sentry.flush(5000);
          }
        },
      });
    }
  } catch {
    // runBackup logged each failed copy.
    process.exitCode = 1;
  } finally {
    clients.read.destroy();
    clients.write.destroy();
  }
}

await bootstrap();
