import * as Sentry from '@sentry/nestjs';
import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { dailyDatabaseKey, dailyStorageKey } from './keys.js';
import { MONITOR_CONFIG, MONITOR_SLUG } from './schedule.js';
import {
  BackupRunError,
  type BackupJob,
  type Clock,
  type NightlyRun,
  reportCutOff,
  runNightly,
  runBackup,
  runService,
} from './service.js';

vi.mock('@sentry/nestjs', () => ({
  captureCheckIn: vi.fn(),
}));

function stubLogger() {
  const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
  return { logger, asLogger: logger as unknown as Logger };
}

function stubJob(overrides: Partial<Pick<BackupJob, 'copyDatabase' | 'copyBucket'>> = {}) {
  const { logger, asLogger } = stubLogger();
  const copyDatabase = vi.fn().mockResolvedValue(undefined);
  const copyBucket = vi.fn().mockResolvedValue(undefined);
  const job: BackupJob = { logger: asLogger, copyDatabase, copyBucket, ...overrides };
  return { job, logger, copyDatabase, copyBucket };
}

const AT = new Date('2026-10-19T01:00:00Z');

describe('runBackup', () => {
  it('copies the database and the bucket under keys of the same stamp', async () => {
    const { job, copyDatabase, copyBucket } = stubJob();

    await runBackup(AT, job);

    expect(copyDatabase).toHaveBeenCalledWith(dailyDatabaseKey(AT));
    expect(copyBucket).toHaveBeenCalledWith(dailyStorageKey(AT));
    expect(dailyDatabaseKey(AT)).toContain('2026-10-19T01-00-00Z');
    expect(dailyStorageKey(AT)).toContain('2026-10-19T01-00-00Z');
  });

  it('copies the database first', async () => {
    const order: string[] = [];
    const { job } = stubJob({
      copyDatabase: vi.fn(async () => void order.push('database')),
      copyBucket: vi.fn(async () => void order.push('bucket')),
    });

    await runBackup(AT, job);

    expect(order).toEqual(['database', 'bucket']);
  });

  it('copies the bucket after a failed database copy, then fails', async () => {
    const { job, copyBucket, logger } = stubJob({
      copyDatabase: vi.fn().mockRejectedValue(new Error('dump failed')),
    });

    await expect(runBackup(AT, job)).rejects.toThrow(BackupRunError);

    expect(copyBucket).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('fails when only the bucket copy failed, naming it', async () => {
    const { job, copyDatabase } = stubJob({
      copyBucket: vi.fn().mockRejectedValue(new Error('tar failed')),
    });

    await expect(runBackup(AT, job)).rejects.toThrow(/bucket/);

    expect(copyDatabase).toHaveBeenCalledOnce();
  });

  it('names both copies when both failed', async () => {
    const { job } = stubJob({
      copyDatabase: vi.fn().mockRejectedValue(new Error('a')),
      copyBucket: vi.fn().mockRejectedValue(new Error('b')),
    });

    await expect(runBackup(AT, job)).rejects.toThrow(/database, bucket/);
  });

  it('does not throw when both copies succeed', async () => {
    const { job, logger } = stubJob();

    await expect(runBackup(AT, job)).resolves.toBeUndefined();

    expect(logger.error).not.toHaveBeenCalled();
  });
});

describe('runNightly', () => {
  beforeEach(() => {
    vi.mocked(Sentry.captureCheckIn).mockClear();
    vi.mocked(Sentry.captureCheckIn).mockReturnValue('check-in-1');
  });

  it('sends an in-progress check-in with the monitor slug and config, and runs the backup', async () => {
    const { job, copyDatabase, copyBucket } = stubJob();

    await runNightly(AT, job);

    expect(Sentry.captureCheckIn).toHaveBeenNthCalledWith(
      1,
      { monitorSlug: 'nightly-backup', status: 'in_progress' },
      MONITOR_CONFIG,
    );
    expect(MONITOR_SLUG).toBe('nightly-backup');
    expect(copyDatabase).toHaveBeenCalledOnce();
    expect(copyBucket).toHaveBeenCalledOnce();
  });

  it('sends ok with the same id and a duration in seconds after a successful run', async () => {
    const { job } = stubJob();

    await runNightly(AT, job);

    expect(Sentry.captureCheckIn).toHaveBeenCalledTimes(2);
    expect(Sentry.captureCheckIn).toHaveBeenNthCalledWith(2, {
      monitorSlug: 'nightly-backup',
      status: 'ok',
      checkInId: 'check-in-1',
      duration: expect.any(Number),
    });
    const finish = vi.mocked(Sentry.captureCheckIn).mock.calls[1]![0] as { duration: number };
    const duration = finish.duration;
    expect(duration).toBeGreaterThanOrEqual(0);
    expect(duration).toBeLessThan(5);
  });

  it('sends error with the same id and rethrows when the backup fails', async () => {
    const { job } = stubJob({ copyDatabase: vi.fn().mockRejectedValue(new Error('x')) });

    await expect(runNightly(AT, job)).rejects.toThrow(BackupRunError);

    expect(Sentry.captureCheckIn).toHaveBeenCalledTimes(2);
    expect(Sentry.captureCheckIn).toHaveBeenNthCalledWith(2, {
      monitorSlug: 'nightly-backup',
      status: 'error',
      checkInId: 'check-in-1',
      duration: expect.any(Number),
    });
  });

  it('keeps the check-in id in the run while the backup runs and clears it after success', async () => {
    const run: NightlyRun = {};
    let during: string | undefined;
    const { job } = stubJob({
      copyDatabase: vi.fn(async () => {
        during = run.checkInId;
      }),
    });

    await runNightly(AT, job, run);

    expect(during).toBe('check-in-1');
    expect(run.checkInId).toBeUndefined();
  });

  it('clears the check-in id after a failure', async () => {
    const run: NightlyRun = {};
    let during: string | undefined;
    const { job } = stubJob({
      copyDatabase: vi.fn(async () => {
        during = run.checkInId;
        throw new Error('x');
      }),
    });

    await expect(runNightly(AT, job, run)).rejects.toThrow(BackupRunError);

    expect(during).toBe('check-in-1');
    expect(run.checkInId).toBeUndefined();
  });
});

describe('reportCutOff', () => {
  beforeEach(() => {
    vi.mocked(Sentry.captureCheckIn).mockClear();
    vi.mocked(Sentry.captureCheckIn).mockReturnValue('check-in-1');
  });

  it('ends the check-in of a run in progress as an error and clears the id', async () => {
    const run: NightlyRun = {};
    let afterCutOff: string | undefined = 'unset';
    let callsAtCutOff: unknown[][] = [];
    const { job } = stubJob({
      copyDatabase: vi.fn(async () => {
        reportCutOff(run);
        afterCutOff = run.checkInId;
        callsAtCutOff = [...vi.mocked(Sentry.captureCheckIn).mock.calls];
      }),
    });

    await runNightly(AT, job, run);

    expect(callsAtCutOff).toHaveLength(2);
    expect(callsAtCutOff[1]).toEqual([
      { monitorSlug: 'nightly-backup', status: 'error', checkInId: 'check-in-1' },
    ]);
    expect(afterCutOff).toBeUndefined();
    expect(Sentry.captureCheckIn).toHaveBeenCalledTimes(2);
  });

  it('sends no later ok after a cut-off when the run then fails', async () => {
    const run: NightlyRun = {};
    const { job } = stubJob({
      copyDatabase: vi.fn(async () => {
        reportCutOff(run);
        throw new Error('x');
      }),
    });

    await expect(runNightly(AT, job, run)).rejects.toThrow(BackupRunError);

    expect(Sentry.captureCheckIn).toHaveBeenCalledTimes(2);
    expect(Sentry.captureCheckIn).toHaveBeenNthCalledWith(2, {
      monitorSlug: 'nightly-backup',
      status: 'error',
      checkInId: 'check-in-1',
    });
  });

  it('sends nothing when no run is in progress', () => {
    const run: NightlyRun = {};

    reportCutOff(run);

    expect(Sentry.captureCheckIn).not.toHaveBeenCalled();
  });
});

// A clock whose sleep moves its own time forward; `wake` lets a test shorten a sleep.
function fakeClock(start: string, wake: (ms: number) => number = (ms) => ms) {
  let time = Date.parse(start);
  const sleeps: number[] = [];
  const clock: Clock = {
    now: () => new Date(time),
    sleep: (ms, signal) => {
      sleeps.push(ms);
      if (!signal.aborted) time += wake(ms);
      return Promise.resolve();
    },
  };
  return {
    clock,
    sleeps,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

const HOUR = 3_600_000;

describe('runService', () => {
  function setup(start: string, wake?: (ms: number) => number, maxRuns = 1) {
    const fake = fakeClock(start, wake);
    const controller = new AbortController();
    const { logger, asLogger } = stubLogger();
    const runs: string[] = [];
    const night = vi.fn(async (at: Date) => {
      runs.push(at.toISOString());
      if (runs.length >= maxRuns) controller.abort();
    });
    const run = () =>
      runService({ clock: fake.clock, signal: controller.signal, logger: asLogger, night });
    return { ...fake, controller, logger, runs, night, run };
  }

  it('started at 03:00 Moscow runs once at 04:00 Moscow', async () => {
    const { run, runs, sleeps } = setup('2026-10-19T00:00:00Z');

    await run();

    expect(runs).toEqual(['2026-10-19T01:00:00.000Z']);
    expect(sleeps).toEqual([HOUR]);
  });

  it('then sleeps until the next day at 04:00', async () => {
    const { run, runs, sleeps } = setup('2026-10-19T00:00:00Z', undefined, 2);

    await run();

    expect(runs).toEqual(['2026-10-19T01:00:00.000Z', '2026-10-20T01:00:00.000Z']);
    expect(sleeps).toEqual([HOUR, 24 * HOUR]);
  });

  it('started at 04:10 Moscow runs at once', async () => {
    const { run, runs, sleeps } = setup('2026-10-19T01:10:00Z');

    await run();

    expect(runs).toEqual(['2026-10-19T01:10:00.000Z']);
    expect(sleeps).toEqual([]);
  });

  it('started at 04:40 Moscow waits until the next day at 04:00', async () => {
    const { run, runs, sleeps } = setup('2026-10-19T01:40:00Z');

    await run();

    expect(runs).toEqual(['2026-10-20T01:00:00.000Z']);
    expect(sleeps).toEqual([23 * HOUR + 20 * 60_000]);
  });

  it('goes on to the next night after a night that throws', async () => {
    const fake = fakeClock('2026-10-19T00:00:00Z');
    const controller = new AbortController();
    const { asLogger } = stubLogger();
    const night = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockImplementationOnce(async () => {
        controller.abort();
      });

    await runService({ clock: fake.clock, signal: controller.signal, logger: asLogger, night });

    expect(night).toHaveBeenCalledTimes(2);
    expect(night.mock.calls.map(([at]) => (at as Date).toISOString())).toEqual([
      '2026-10-19T01:00:00.000Z',
      '2026-10-20T01:00:00.000Z',
    ]);
  });

  it('ends without running when the signal is already aborted', async () => {
    const { run, night, controller } = setup('2026-10-19T01:10:00Z');
    controller.abort();

    await run();

    expect(night).not.toHaveBeenCalled();
  });

  it('ends without running when the signal aborts during the wait', async () => {
    const fake = fakeClock('2026-10-19T00:00:00Z');
    const controller = new AbortController();
    const { asLogger } = stubLogger();
    const night = vi.fn().mockResolvedValue(undefined);
    const clock: Clock = {
      now: fake.clock.now,
      sleep: () => {
        controller.abort();
        return Promise.resolve();
      },
    };

    await runService({ clock, signal: controller.signal, logger: asLogger, night });

    expect(night).not.toHaveBeenCalled();
  });

  it('does not start a second run at once when a run lasts past the next 04:00', async () => {
    const fake = fakeClock('2026-10-19T01:10:00Z');
    const controller = new AbortController();
    const { asLogger } = stubLogger();
    const runs: string[] = [];
    const night = vi.fn(async (at: Date) => {
      runs.push(at.toISOString());
      if (runs.length === 1) fake.advance(24 * HOUR);
      else controller.abort();
    });

    await runService({ clock: fake.clock, signal: controller.signal, logger: asLogger, night });

    // The run ended at 04:10 of day 2, so day 2's 04:00 is skipped.
    expect(runs).toEqual(['2026-10-19T01:10:00.000Z', '2026-10-21T01:00:00.000Z']);
  });

  it('sleeps again when a sleep wakes early', async () => {
    const { run, runs, sleeps } = setup('2026-10-19T00:00:00Z', (ms) => ms / 2);

    await run();

    expect(runs).toEqual(['2026-10-19T01:00:00.000Z']);
    expect(sleeps.length).toBeGreaterThan(1);
    expect(sleeps[0]).toBe(HOUR);
    expect(sleeps[1]).toBe(HOUR / 2);
  });
});
