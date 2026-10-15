import { describe, expect, it } from 'vitest';

import { PRODUCT_SORTS } from '../model/filters';

import { PRODUCT_SORT_ORDER, productSortLabels } from './sorts';

describe('productSortLabels', () => {
  it('has exactly the keys of PRODUCT_SORTS', () => {
    expect(Object.keys(productSortLabels).sort()).toEqual([...PRODUCT_SORTS].sort());
  });

  it('has the Russian labels', () => {
    expect(productSortLabels).toEqual({
      new: 'Новинки',
      price_desc: 'Сначала дороже',
      price_asc: 'Сначала дешевле',
      discount: 'По величине скидки',
      rating: 'По рейтингу',
    });
  });
});

describe('PRODUCT_SORT_ORDER', () => {
  it('lists the sorts in the order of the sort list', () => {
    expect([...PRODUCT_SORT_ORDER]).toEqual([
      'new',
      'price_desc',
      'price_asc',
      'discount',
      'rating',
    ]);
  });

  it('is a permutation of PRODUCT_SORTS', () => {
    expect([...PRODUCT_SORT_ORDER].sort()).toEqual([...PRODUCT_SORTS].sort());
    expect(new Set(PRODUCT_SORT_ORDER).size).toBe(PRODUCT_SORTS.length);
  });
});
