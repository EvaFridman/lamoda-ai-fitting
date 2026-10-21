import { describe, expect, it } from 'vitest';

import { productCount } from './product-count';

describe('productCount', () => {
  it.each([
    [1, '1 товар'],
    [2, '2 товара'],
    [5, '5 товаров'],
    [11, '11 товаров'],
    [21, '21 товар'],
    [0, '0 товаров'],
  ])('writes %i as "%s"', (total, text) => {
    expect(productCount(total)).toBe(text);
  });
});
