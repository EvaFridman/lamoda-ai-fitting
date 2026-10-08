import { describe, expect, it } from 'vitest';

// Through the segment's public API and the `@/` alias, so the test also checks the alias resolves.
import { formatAmount, formatPrice } from '@/shared/lib';

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

describe('formatPrice without the currency', () => {
  it('gives the same digits without "₽" and without a trailing space', () => {
    expect(formatPrice(10_399, { currency: false })).toBe(`10${nbsp}399`);
    expect(formatPrice(999, { currency: false })).toBe('999');
  });

  it('keeps the kopecks when there are any', () => {
    expect(formatPrice(1299.5, { currency: false })).toBe(`1${nbsp}299,50`);
  });

  it('is the default formatting without "₽" and the space before it', () => {
    expect(`${formatPrice(4500, { currency: false })}${nbsp}₽`).toBe(formatPrice(4500));
  });
});

describe('formatAmount', () => {
  it('groups whole rubles with no-break spaces and no "₽"', () => {
    expect(formatAmount(1500)).toBe(`1${nbsp}500`);
    expect(formatAmount(1_234_567)).toBe(`1${nbsp}234${nbsp}567`);
  });

  it('leaves short numbers alone', () => {
    expect(formatAmount(999)).toBe('999');
    expect(formatAmount(0)).toBe('0');
  });
});
