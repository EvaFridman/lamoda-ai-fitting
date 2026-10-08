import { describe, expect, it } from 'vitest';

import { priceLabel } from './price-label';

const bounds: [number, number] = [60, 288900];

describe('priceLabel', () => {
  it('names both sides when both moved', () => {
    expect(priceLabel(bounds, [1500, 9000])).toBe('от 1 500 до 9 000 ₽');
  });

  it('names only the min when only it moved', () => {
    expect(priceLabel(bounds, [1500, 288900])).toBe('от 1 500 ₽');
  });

  it('names only the max when only it moved', () => {
    expect(priceLabel(bounds, [60, 9000])).toBe('до 9 000 ₽');
  });

  it('names a single price when both sides are equal', () => {
    expect(priceLabel(bounds, [3000, 3000])).toBe('3 000 ₽');
  });

  it('names a single price when both sides sit on the same bound', () => {
    expect(priceLabel(bounds, [60, 60])).toBe('60 ₽');
    expect(priceLabel(bounds, [288900, 288900])).toBe('288 900 ₽');
  });

  it('is undefined for the whole bounds', () => {
    expect(priceLabel(bounds, [60, 288900])).toBeUndefined();
  });
});
