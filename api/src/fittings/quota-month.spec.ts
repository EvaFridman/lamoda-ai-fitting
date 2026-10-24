import { describe, expect, it } from 'vitest';

import { quotaMonth, quotaRenewsAt } from './quota-month.js';

describe('quotaRenewsAt', () => {
  it.each([
    ['2026-10-23T12:00:00Z', '2026-10-31T21:00:00.000Z'],
    ['2026-12-15T12:00:00Z', '2026-12-31T21:00:00.000Z'],
    ['2026-02-10T08:00:00Z', '2026-02-28T21:00:00.000Z'],
    // 00:00:01 Moscow on the 1st is already the new month: it renews on the 1st of the next.
    ['2026-10-31T21:00:01Z', '2026-11-30T21:00:00.000Z'],
    // 23:59:59 Moscow on the last day is still the old month.
    ['2026-10-31T20:59:59Z', '2026-10-31T21:00:00.000Z'],
    ['2026-12-31T21:00:01Z', '2027-01-31T21:00:00.000Z'],
  ])('renews the month of %s at %s', (at, renews) => {
    expect(quotaRenewsAt(new Date(at)).toISOString()).toBe(renews);
  });

  it('is the start of the month that follows quotaMonth', () => {
    const at = new Date('2026-12-20T10:00:00Z');

    const renews = quotaRenewsAt(at);

    expect(quotaMonth(at)).toBe('2026-12');
    expect(quotaMonth(new Date(renews.getTime() - 1))).toBe('2026-12');
    expect(quotaMonth(renews)).toBe('2027-01');
  });
});

describe('quotaMonth', () => {
  it.each([
    ['2026-10-23T12:00:00Z', '2026-10'],
    ['2026-10-31T20:59:59.999Z', '2026-10'],
    ['2026-10-31T21:00:00Z', '2026-11'],
    ['2026-11-01T00:00:00Z', '2026-11'],
    ['2026-12-31T21:00:00Z', '2027-01'],
    ['2026-01-01T00:00:00+03:00', '2026-01'],
    ['2025-12-31T20:59:59Z', '2025-12'],
  ])('puts %s into the Moscow month %s', (at, month) => {
    expect(quotaMonth(new Date(at))).toBe(month);
  });
});
