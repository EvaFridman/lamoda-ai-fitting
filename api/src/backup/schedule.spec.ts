import { describe, expect, it } from 'vitest';

import { MONITOR_CONFIG, MONITOR_SLUG, nextRun, runsAtOnce } from './schedule.js';

// Moscow is UTC+3 all year, so 04:00 there is 01:00 UTC.
describe('nextRun', () => {
  it.each([
    ['before 04:00 Moscow', '2026-10-19T00:59:59Z', '2026-10-19T01:00:00Z'],
    ['exactly 04:00 Moscow (strictly after)', '2026-10-19T01:00:00Z', '2026-10-20T01:00:00Z'],
    ['just after 04:00 Moscow', '2026-10-19T01:00:01Z', '2026-10-20T01:00:00Z'],
    ['midnight UTC (03:00 Moscow)', '2026-10-19T00:00:00Z', '2026-10-19T01:00:00Z'],
    ['Moscow midnight (21:00 UTC)', '2026-10-18T21:00:00Z', '2026-10-19T01:00:00Z'],
    [
      'late evening UTC, already the next Moscow day',
      '2026-10-19T22:00:00Z',
      '2026-10-20T01:00:00Z',
    ],
    ['the end of the year', '2026-12-31T12:00:00Z', '2027-01-01T01:00:00Z'],
    ['the new year in Moscow before UTC', '2026-12-31T21:30:00Z', '2027-01-01T01:00:00Z'],
    ['after 04:00 on the last day of the year', '2026-12-31T05:00:00Z', '2027-01-01T01:00:00Z'],
  ])('%s', (_name, now, expected) => {
    expect(nextRun(new Date(now)).toISOString()).toBe(new Date(expected).toISOString());
  });

  it('is always strictly after now', () => {
    const start = Date.parse('2026-12-30T00:00:00Z');
    for (let i = 0; i < 24 * 4 * 4; i += 1) {
      const now = new Date(start + i * 15 * 60_000);
      const next = nextRun(now);
      expect(next.getTime()).toBeGreaterThan(now.getTime());
      expect(next.getTime() - now.getTime()).toBeLessThanOrEqual(24 * 3_600_000);
    }
  });
});

describe('runsAtOnce', () => {
  it.each([
    ['03:59 Moscow', '2026-10-19T00:59:00Z', false],
    ['04:00 Moscow', '2026-10-19T01:00:00Z', true],
    ['04:10 Moscow', '2026-10-19T01:10:00Z', true],
    ['04:29:59 Moscow', '2026-10-19T01:29:59Z', true],
    ['04:30 Moscow', '2026-10-19T01:30:00Z', false],
    ['04:40 Moscow', '2026-10-19T01:40:00Z', false],
    ['04:10 UTC is not 04:10 Moscow', '2026-10-19T04:10:00Z', false],
  ])('%s', (_name, now, expected) => {
    expect(runsAtOnce(new Date(now))).toBe(expected);
  });
});

describe('the Sentry monitor', () => {
  it('has the nightly slug', () => {
    expect(MONITOR_SLUG).toBe('nightly-backup');
  });

  it('is configured for 04:00 Moscow with a 30 minute margin', () => {
    expect(MONITOR_CONFIG).toEqual({
      schedule: { type: 'crontab', value: '0 4 * * *' },
      timezone: 'Europe/Moscow',
      checkinMargin: 30,
      maxRuntime: 120,
      failureIssueThreshold: 1,
      recoveryThreshold: 1,
    });
  });
});
