import { describe, expect, it } from 'vitest';

import { quotaMonth } from './quota-month.js';

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
