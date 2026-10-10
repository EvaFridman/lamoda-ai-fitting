import { describe, expect, it } from 'vitest';

import { Prisma } from '../../generated/prisma/client.js';
import { finalPrice } from './final-price.js';

const price = (value: string): Prisma.Decimal => new Prisma.Decimal(value);

describe('finalPrice', () => {
  it('rounds 1999.99 with discount 15 down to 1699 (AC5)', () => {
    expect(finalPrice(price('1999.99'), 15)).toBe(1699);
  });

  it('returns the price rounded down when the discount is 0', () => {
    expect(finalPrice(price('1999.99'), 0)).toBe(1999);
    expect(finalPrice(price('2500.00'), 0)).toBe(2500);
  });

  it('returns 0 when the discount is 100', () => {
    expect(finalPrice(price('1999.99'), 100)).toBe(0);
  });

  it('returns a number', () => {
    expect(typeof finalPrice(price('10.00'), 10)).toBe('number');
  });

  it('keeps an exact whole result whole', () => {
    expect(finalPrice(price('2.50'), 20)).toBe(2);
    expect(finalPrice(price('12.50'), 20)).toBe(10);
    expect(finalPrice(price('1000.00'), 10)).toBe(900);
  });

  it('does not let a binary fraction shift the floor', () => {
    // In floats 4.35 * 100 is 434.99999999999994 and 0.57 * 100 is 56.99999999999999.
    expect(finalPrice(price('4.35'), 0)).toBe(4);
    expect(finalPrice(price('57.00'), 0)).toBe(57);
    expect(finalPrice(price('0.29'), 0)).toBe(0);
    expect(finalPrice(price('1.15'), 50)).toBe(0);
  });

  it('handles the maximum price', () => {
    const max = price('99999999.99');

    expect(finalPrice(max, 0)).toBe(99_999_999);
    expect(finalPrice(max, 1)).toBe(98_999_999);
    expect(finalPrice(max, 50)).toBe(49_999_999);
    expect(finalPrice(max, 100)).toBe(0);
  });

  it('rounds down, never up, at the smallest price', () => {
    expect(finalPrice(price('0.01'), 0)).toBe(0);
  });
});
