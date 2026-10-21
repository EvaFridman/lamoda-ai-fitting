import { describe, expect, it } from 'vitest';

import { catalog } from '@/shared/analytics/catalog';

import { PRODUCT_SORTS } from './filters';

describe('the analytics catalog and the product sorts', () => {
  it('lists the same orders in "Catalog Sorted" as the api takes', () => {
    const property = catalog.events['Catalog Sorted'].properties.sort;
    expect([...property.values].sort()).toEqual([...PRODUCT_SORTS].sort());
  });
});
