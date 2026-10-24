import { describe, expect, it } from 'vitest';

import { fittingDate, historyDate, renewalDate } from './dates';

describe('historyDate', () => {
  const now = Date.parse('2026-10-24T12:00:00.000Z');

  it('says «Сегодня» with the Moscow time for the same Moscow day', () => {
    expect(historyDate('2026-10-24T11:06:00.000Z', now)).toBe('Сегодня, 14:06');
  });

  it('counts the day from Moscow midnight: 21:00 UTC starts the next day', () => {
    const lateNow = Date.parse('2026-10-24T20:59:00.000Z');
    expect(historyDate('2026-10-23T21:00:00.000Z', lateNow)).toBe('Сегодня, 00:00');
    expect(historyDate('2026-10-23T20:59:00.000Z', lateNow)).toBe('23 октября');
  });

  it('treats a time after Moscow midnight but before UTC midnight as the same day', () => {
    const earlyNow = Date.parse('2026-10-24T21:30:00.000Z');
    expect(historyDate('2026-10-24T21:10:00.000Z', earlyNow)).toBe('Сегодня, 00:10');
    expect(historyDate('2026-10-24T20:30:00.000Z', earlyNow)).toBe('24 октября');
  });

  it('writes the day and the month for another day of this year', () => {
    expect(historyDate('2026-10-12T09:00:00.000Z', now)).toBe('12 октября');
  });

  it('adds the year for another year', () => {
    expect(historyDate('2025-10-12T09:00:00.000Z', now)).toBe('12 октября 2025 г.');
  });

  it('compares the year in Moscow time', () => {
    const newYear = Date.parse('2027-01-01T10:00:00.000Z');
    expect(historyDate('2026-12-31T20:59:00.000Z', newYear)).toBe('31 декабря 2026 г.');
  });
});

describe('renewalDate', () => {
  it('writes the day and the month name', () => {
    expect(renewalDate('2026-10-31T21:00:00.000Z')).toBe('1 ноября');
  });

  it('uses Moscow time: 21:00 UTC is already the next day', () => {
    expect(renewalDate('2026-10-31T20:59:00.000Z')).toBe('31 октября');
  });
});

describe('fittingDate', () => {
  it('adds the Moscow time of the day', () => {
    expect(fittingDate('2026-10-19T11:06:00.000Z')).toBe('19 октября, 14:06');
  });

  it('pads the hour', () => {
    expect(fittingDate('2026-10-19T04:05:00.000Z')).toBe('19 октября, 07:05');
  });
});
