import { describe, expect, it } from 'vitest';

import { productCount } from './product-count';

const NBSP = String.fromCodePoint(0xa0);

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

  it.each([
    [8340, `8${NBSP}340 товаров`],
    [50030, `50${NBSP}030 товаров`],
    [21001, `21${NBSP}001 товар`],
    [1000000, `1${NBSP}000${NBSP}000 товаров`],
  ])('groups the digits of %i with no-break spaces', (total, text) => {
    expect(productCount(total)).toBe(text);
  });
});
