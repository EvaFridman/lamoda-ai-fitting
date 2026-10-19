import { setTimeout as delay } from 'node:timers/promises';

import * as Sentry from '@sentry/nestjs';
import type { Logger } from 'pino';

import { dailyDatabaseKey, dailyStorageKey } from './keys.js';
import { MONITOR_CONFIG, MONITOR_SLUG, nextRun, runsAtOnce } from './schedule.js';

// One night's copies, bound to their clients and settings by run.ts; each takes its key.
export interface BackupJob {
  logger: Logger;
  copyDatabase(key: string): Promise<unknown>;
  copyBucket(key: string): Promise<unknown>;
}

// A run in which a copy failed; the copy's own error is in the log.
export class BackupRunError extends Error {
  override readonly name = 'BackupRunError';
}

// The database copy, then the bucket copy, both named by the run's start (plan §4). The second runs
// even when the first failed; the run fails if either did. Each copy logs what it stored.
export async function runBackup(at: Date, job: BackupJob): Promise<void> {
  const { logger } = job;
  logger.info('Backup run started');
  const failed: string[] = [];
  try {
    await job.copyDatabase(dailyDatabaseKey(at));
  } catch (error) {
    logger.error({ err: error }, 'Database copy failed');
    failed.push('database');
  }
  try {
    await job.copyBucket(dailyStorageKey(at));
  } catch (error) {
    logger.error({ err: error }, 'Bucket copy failed');
    failed.push('bucket');
  }
  if (failed.length > 0) throw new BackupRunError(`Backup run failed: ${failed.join(', ')}`);
  logger.info('Backup run finished');
}

// The check-in of the nightly run in progress, if any: the stop handler ends it (reportCutOff).
export interface NightlyRun {
  checkInId?: string;
}

// The nightly run, checked in with the Sentry cron monitor (P6): a failed run, or none by 04:30,
// becomes an issue (AC10). With Sentry off (an empty DSN) no check-in is sent. The check-ins are
// sent by hand, not by Sentry.withMonitor, so that a run cut off by a stop ends as a failure at
// once instead of when maxRuntime runs out (P21).
export async function runNightly(at: Date, job: BackupJob, run: NightlyRun = {}): Promise<void> {
  const checkInId = Sentry.captureCheckIn(
    { monitorSlug: MONITOR_SLUG, status: 'in_progress' },
    MONITOR_CONFIG,
  );
  run.checkInId = checkInId;
  const started = performance.now();
  const finish = (status: 'ok' | 'error') => {
    // Already closed as failed by reportCutOff: the stop does not end the copy, which may still
    // finish before the process exits.
    if (run.checkInId !== checkInId) return;
    run.checkInId = undefined;
    const duration = (performance.now() - started) / 1000;
    Sentry.captureCheckIn({ monitorSlug: MONITOR_SLUG, status, checkInId, duration });
  };
  try {
    await runBackup(at, job);
  } catch (error) {
    finish('error');
    throw error;
  }
  finish('ok');
}

// Ends the check-in of a run a stop cuts off as a failure (P21). Stopped before 04:30, the
// restarted service runs again at once (P15) and its success resolves the issue; later, the next
// night's does (or a `--once` is run by hand, which does not check in).
export function reportCutOff(run: NightlyRun): void {
  if (run.checkInId === undefined) return;
  Sentry.captureCheckIn({ monitorSlug: MONITOR_SLUG, status: 'error', checkInId: run.checkInId });
  run.checkInId = undefined;
}

export interface Clock {
  now(): Date;
  // Resolves after `ms`, or at once when `signal` aborts.
  sleep(ms: number, signal: AbortSignal): Promise<void>;
}

// setTimeout's longest delay; a longer wait sleeps again.
const MAX_SLEEP_MS = 2 ** 31 - 1;

export const systemClock: Clock = {
  now: () => new Date(),
  sleep: (ms, signal) =>
    delay(Math.min(ms, MAX_SLEEP_MS), undefined, { signal }).catch(() => undefined),
};

// The service (plan §4): sleeps until the next 04:00 Moscow time, runs the night's copies and
// sleeps again, until `signal` aborts. Started between 04:00 and 04:30 it runs at once (P15).
// `night` is runNightly bound to the job; its failures are logged by runBackup and reported by the
// monitor, and the service goes on to the next night.
export async function runService(options: {
  clock: Clock;
  signal: AbortSignal;
  logger: Logger;
  night: (at: Date) => Promise<void>;
}): Promise<void> {
  const { clock, signal, logger } = options;
  const started = clock.now();
  let next = runsAtOnce(started) ? started : nextRun(started);
  while (!signal.aborted) {
    if (next > clock.now()) logger.info({ next: next.toISOString() }, 'Next backup run');
    // A timer that fires early, or a wait longer than one timer, sleeps again.
    while (!signal.aborted && next > clock.now()) {
      await clock.sleep(next.getTime() - clock.now().getTime(), signal);
    }
    if (signal.aborted) return;
    try {
      await options.night(clock.now());
    } catch {
      // Logged by runBackup, reported by the monitor.
    }
    // From the run's end: a run still going at the next 04:00 skips that night instead of starting
    // a second run at once.
    const now = clock.now();
    next = nextRun(now > next ? now : next);
  }
}
