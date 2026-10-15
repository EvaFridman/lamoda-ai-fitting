import { describe, expect, it } from 'vitest';

import { compareSizes, sortSizes } from './sizes';

describe('sortSizes', () => {
  it('orders letter sizes from small to large', () => {
    expect(sortSizes(['XL', 'S', 'XS', 'M', 'L'])).toEqual(['XS', 'S', 'M', 'L', 'XL']);
  });

  it('knows the full letter scale', () => {
    expect(sortSizes(['3XL', 'XXL', 'XL', 'L', 'M', 'S', 'XS', 'XXS'])).toEqual([
      'XXS',
      'XS',
      'S',
      'M',
      'L',
      'XL',
      'XXL',
      '3XL',
    ]);
  });

  it('orders numbers ascending, not as text', () => {
    expect(sortSizes(['34', '26', '30'])).toEqual(['26', '30', '34']);
    expect(sortSizes(['100', '9', '40'])).toEqual(['9', '40', '100']);
  });

  it('handles decimals with a dot or a comma', () => {
    expect(sortSizes(['28', '27,5', '27', '27.5', '26'])).toEqual([
      '26',
      '27',
      '27,5',
      '27.5',
      '28',
    ]);
    expect(sortSizes(['28', '27,5', '27'])).toEqual(['27', '27,5', '28']);
  });

  it('puts letters first, then numbers, then the rest by text', () => {
    expect(sortSizes(['Без размера', '42', 'M', 'One size', '38', 'S'])).toEqual([
      'S',
      'M',
      '38',
      '42',
      'Без размера',
      'One size',
    ]);
  });

  it('ignores case and surrounding spaces when ranking', () => {
    expect(sortSizes(['xl', 'S', ' xs ', 'm'])).toEqual([' xs ', 'S', 'm', 'xl']);
  });

  it('ranks XXXL as 3XL', () => {
    expect(compareSizes('XXXL', 'XXL')).toBeGreaterThan(0);
    expect(compareSizes('XXXL', '1')).toBeLessThan(0);
    expect(sortSizes(['XXXL', 'XXL', 'XL'])).toEqual(['XL', 'XXL', 'XXXL']);
    expect(sortSizes(['XXXL', 'One size', '42'])).toEqual(['XXXL', '42', 'One size']);
  });

  it('orders unknown sizes by text', () => {
    const unknown = ['Б', 'А', 'One size', 'Another'];
    expect(sortSizes(unknown)).toEqual([...unknown].sort((a, b) => a.localeCompare(b, 'ru')));
    expect(sortSizes(['One size', 'Another'])).toEqual(['Another', 'One size']);
    expect(sortSizes(['Б', 'А'])).toEqual(['А', 'Б']);
  });

  it('does not change the input', () => {
    const input = ['XL', 'S', 'XS'];
    const result = sortSizes(input);
    expect(input).toEqual(['XL', 'S', 'XS']);
    expect(result).not.toBe(input);
  });

  it('returns an empty list for an empty list', () => {
    expect(sortSizes([])).toEqual([]);
  });
});

describe('compareSizes', () => {
  it('is negative when the first is smaller, positive when larger', () => {
    expect(compareSizes('S', 'M')).toBeLessThan(0);
    expect(compareSizes('M', 'S')).toBeGreaterThan(0);
    expect(compareSizes('M', 'M')).toBe(0);
  });

  it('puts a letter before a number and a number before other text', () => {
    expect(compareSizes('XXL', '1')).toBeLessThan(0);
    expect(compareSizes('99', 'One size')).toBeLessThan(0);
    expect(compareSizes('One size', 'XS')).toBeGreaterThan(0);
  });
});
