import { describe, expect, it } from 'vitest';

import { resultFileName } from './result-file-name.js';

describe('resultFileName', () => {
  it('names the file by the moment in Moscow time', () => {
    expect(resultFileName(new Date('2026-10-27T09:30:00Z'))).toBe('primerka-2026-10-27-1230.webp');
  });

  it('rolls the day over when Moscow is past midnight and UTC is not', () => {
    expect(resultFileName(new Date('2026-10-27T21:05:00Z'))).toBe('primerka-2026-10-28-0005.webp');
  });

  it('rolls the month and the year over', () => {
    expect(resultFileName(new Date('2026-12-31T21:00:00Z'))).toBe('primerka-2027-01-01-0000.webp');
  });

  it('pads the month, the day, the hour and the minute with zeros', () => {
    expect(resultFileName(new Date('2026-03-04T02:07:59Z'))).toBe('primerka-2026-03-04-0507.webp');
  });

  it('uses a 24-hour clock, with midnight as 00', () => {
    expect(resultFileName(new Date('2026-06-14T20:59:00Z'))).toBe('primerka-2026-06-14-2359.webp');
    expect(resultFileName(new Date('2026-06-14T21:00:00Z'))).toBe('primerka-2026-06-15-0000.webp');
  });
});
