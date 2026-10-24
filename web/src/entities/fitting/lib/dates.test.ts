import { describe, expect, it } from 'vitest';

import { fittingDate, renewalDate } from './dates';

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
