import type { captureCheckIn } from '@sentry/nestjs';

// @sentry/nestjs does not re-export the type itself.
type MonitorConfig = NonNullable<Parameters<typeof captureCheckIn>[1]>;

// When the nightly run starts (spec 0012 plan §4, P2): 04:00 Moscow time, every day.
export const TIME_ZONE = 'Europe/Moscow';
const RUN_HOUR = 4;

// A service started this long after 04:00 runs at once (P15): the monitor's margin.
export const START_WINDOW_MINUTES = 30;
const START_WINDOW_MS = START_WINDOW_MINUTES * 60_000;

// The Sentry cron monitor of the nightly run (P6, AC10), created by its first check-in from this
// config. Only the nightly run checks in: `--once` and `--pre-deploy` would break its schedule.
export const MONITOR_SLUG = 'nightly-backup';
export const MONITOR_CONFIG: MonitorConfig = {
  schedule: { type: 'crontab', value: `0 ${RUN_HOUR} * * *` },
  timezone: TIME_ZONE,
  checkinMargin: START_WINDOW_MINUTES,
  maxRuntime: 120,
  failureIssueThreshold: 1,
  recoveryThreshold: 1,
};

const dayFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

const offsetFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  timeZoneName: 'longOffset',
});

// The zone's offset from UTC at that moment, in ms: `GMT+03:00`, or `GMT` for none.
function offsetMs(at: Date): number {
  const name = offsetFormat.formatToParts(at).find((part) => part.type === 'timeZoneName')?.value;
  const match = /^GMT(?:([+-])(\d{2}):(\d{2}))?$/.exec(name ?? '');
  if (!match) throw new Error(`Unexpected time zone offset: ${name}`);
  if (match[1] === undefined) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return (match[1] === '-' ? -minutes : minutes) * 60_000;
}

// 04:00 Moscow time of the Moscow calendar day `dayOffset` days after the one `at` falls on.
function runOfDay(at: Date, dayOffset: number): Date {
  const parts = Object.fromEntries(
    dayFormat.formatToParts(at).map((part) => [part.type, Number(part.value)]),
  );
  const local = Date.UTC(parts['year']!, parts['month']! - 1, parts['day']! + dayOffset, RUN_HOUR);
  // The offset at the guess, then at the result, in case a change of offset lies between them.
  const guess = local - offsetMs(new Date(local));
  return new Date(local - offsetMs(new Date(guess)));
}

// The first 04:00 Moscow time after `now`.
export function nextRun(now: Date): Date {
  const today = runOfDay(now, 0);
  return today > now ? today : runOfDay(now, 1);
}

// A service started between 04:00 and 04:30 Moscow time runs a copy at once instead of waiting a
// day (P15): a deploy then may have cut off or skipped the night's run.
export function runsAtOnce(now: Date): boolean {
  const since = now.getTime() - runOfDay(now, 0).getTime();
  return since >= 0 && since < START_WINDOW_MS;
}
