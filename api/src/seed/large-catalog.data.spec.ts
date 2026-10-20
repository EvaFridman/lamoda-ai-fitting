import { describe, expect, it } from 'vitest';

import { CATALOG, imageKeys } from './catalog.data.js';
import {
  LARGE_CATALOG_DEFAULT_COUNT,
  LARGE_CATALOG_MAX_COUNT,
  largeCatalogArticle,
  largeCatalogProduct,
  parseLargeCatalogCount,
} from './large-catalog.data.js';

describe('parseLargeCatalogCount', () => {
  it('gives the default when there is no argument', () => {
    expect(parseLargeCatalogCount(undefined)).toBe(2000);
    expect(LARGE_CATALOG_DEFAULT_COUNT).toBe(2000);
  });

  it.each([
    ['1', 1],
    ['50000', 50_000],
    ['99999', 99_999],
  ])('accepts %s', (arg, count) => {
    expect(parseLargeCatalogCount(arg)).toBe(count);
    expect(LARGE_CATALOG_MAX_COUNT).toBe(99_999);
  });

  it.each(['0', '100000', '-1', '1.5', 'abc', '', ' 5', '1e3'])('refuses "%s"', (arg) => {
    expect(() => parseLargeCatalogCount(arg)).toThrow(/whole number from 1 to 99999/);
  });
});

describe('largeCatalogProduct', () => {
  const sample = [1, 2, 10, 29, 30, 31, 100, 999, 1000, 50_000, 99_999];

  it('builds the same product for the same number', () => {
    for (const n of sample) {
      expect(largeCatalogProduct(n)).toEqual(largeCatalogProduct(n));
    }
  });

  it('names the article with five digits', () => {
    expect(largeCatalogArticle(1)).toBe('DEV-00001');
    expect(largeCatalogProduct(1).article).toBe('DEV-00001');
    expect(largeCatalogProduct(50_000).article).toBe('DEV-50000');
  });

  it('takes name, category, attributes, sizes and existing photo keys from the demo product', () => {
    const { products } = CATALOG;
    for (const n of sample) {
      const base = products[(n - 1) % products.length];
      if (!base) throw new Error('empty catalog');
      const product = largeCatalogProduct(n);
      expect(product.name).toBe(base.name);
      expect(product.categorySlug).toBe(base.categorySlug);
      expect(product.attributes).toEqual(base.attributes);
      expect(product.sizes).toEqual(base.sizes);
      expect(product.imageKeys).toEqual(imageKeys(base));
      expect(product.imageKeys.length).toBeGreaterThan(0);
      for (const key of product.imageKeys) {
        expect(key.startsWith(`seed/products/${base.article}/`)).toBe(true);
      }
    }
  });

  it('uses a brand of the catalog and moves to another one each round of demo products', () => {
    const length = CATALOG.products.length;
    for (const n of sample) {
      expect(CATALOG.brands).toContain(largeCatalogProduct(n).brand);
    }
    expect(largeCatalogProduct(1 + length).brand).not.toBe(largeCatalogProduct(1).brand);
  });

  it('keeps every value within the database checks', () => {
    for (let n = 1; n <= 3000; n += 1) {
      const p = largeCatalogProduct(n);
      expect(p.price).toBeGreaterThan(0);
      expect(p.price).toBeGreaterThanOrEqual(100);
      expect(p.price % 10).toBe(0);
      expect(Number.isInteger(p.discount)).toBe(true);
      expect(p.discount).toBeGreaterThanOrEqual(0);
      expect(p.discount).toBeLessThanOrEqual(100);
      if (n % 10 === 0) {
        expect(p.rating).toBeNull();
      } else {
        expect(p.rating).not.toBeNull();
        const rating = p.rating ?? 0;
        expect(rating).toBeGreaterThanOrEqual(3);
        expect(rating).toBeLessThanOrEqual(5);
        expect(Math.round(rating * 10) / 10).toBe(rating);
      }
    }
  });

  it('creates products in strictly increasing time', () => {
    let previous = largeCatalogProduct(1).createdAt.getTime();
    for (let n = 2; n <= 3000; n += 1) {
      const current = largeCatalogProduct(n).createdAt.getTime();
      expect(current).toBeGreaterThan(previous);
      previous = current;
    }
  });

  it('refuses an empty catalog', () => {
    expect(() => largeCatalogProduct(1, { ...CATALOG, products: [] })).toThrow();
    expect(() => largeCatalogProduct(1, { ...CATALOG, brands: [] })).toThrow();
  });
});
