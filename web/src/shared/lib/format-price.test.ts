import { describe, expect, it } from 'vitest';

// Through the segment's public API and the `@/` alias, so the test also checks the alias resolves.
import { formatPrice } from '@/shared/lib';

// U+00A0, the no-break space Intl puts between digit groups and before "₽".
const nbsp = String.fromCodePoint(0xa0);

describe('formatPrice', () => {
  it('shows whole rubles without kopecks', () => {
    expect(formatPrice(1299)).toBe(`1${nbsp}299${nbsp}₽`);
  });

  it('shows kopecks as two digits when there are any', () => {
    expect(formatPrice(1299.5)).toBe(`1${nbsp}299,50${nbsp}₽`);
    expect(formatPrice(1299.05)).toBe(`1${nbsp}299,05${nbsp}₽`);
  });

  it('groups every three digits', () => {
    expect(formatPrice(999)).toBe(`999${nbsp}₽`);
    expect(formatPrice(1_234_567)).toBe(`1${nbsp}234${nbsp}567${nbsp}₽`);
  });

  it('shows zero as a price', () => {
    expect(formatPrice(0)).toBe(`0${nbsp}₽`);
  });

  it('uses only no-break spaces, so a price never wraps', () => {
    expect(formatPrice(12_345.67)).not.toMatch(/ /);
  });
});
