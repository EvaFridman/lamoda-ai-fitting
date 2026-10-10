import { describe, expect, it } from 'vitest';

import { Prisma } from '../../generated/prisma/client.js';
import { decimalToNumber } from './decimal.js';

describe('decimalToNumber', () => {
  it('turns a Decimal into a number', () => {
    expect(decimalToNumber(new Prisma.Decimal('1999.99'))).toBe(1999.99);
  });

  it('keeps null as null', () => {
    expect(decimalToNumber(null)).toBeNull();
  });

  it.each(['99999999.99', '0.1', '0.01', '4.5', '0.00', '5.0'])('is exact for %s', (text) => {
    expect(decimalToNumber(new Prisma.Decimal(text))).toBe(Number(text));
  });

  it('gives a number, not a string or Decimal', () => {
    expect(typeof decimalToNumber(new Prisma.Decimal('3.5'))).toBe('number');
  });
});
