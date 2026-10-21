import { describe, expect, it } from 'vitest';

import type { FacetAttribute } from '@/entities/product';

import {
  attributeChoice,
  clearFilters,
  hasAppliedFilters,
  priceChoice,
  withAttributeChoice,
  withPriceChoice,
} from './filter-value';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function attribute(base: number, count: number): FacetAttribute {
  return {
    id: id(base),
    name: `A${base}`,
    values: Array.from({ length: count }, (_, index) => ({
      id: id(base + index + 1),
      value: `V${index}`,
      colorHex: null,
      count: 1,
    })),
  };
}

const colour = attribute(100, 2);
const material = attribute(200, 2);

describe('hasAppliedFilters', () => {
  it('is false for an empty selection and for a sort alone', () => {
    expect(hasAppliedFilters({})).toBe(false);
    expect(hasAppliedFilters({ sort: 'price_asc' })).toBe(false);
  });

  it('is false for empty lists', () => {
    expect(hasAppliedFilters({ brandId: [], size: [], attributeValueId: [] })).toBe(false);
  });

  it.each([
    ['search', { q: 'платье' }],
    ['brand', { brandId: [id(1)] }],
    ['size', { size: ['M'] }],
    ['attribute value', { attributeValueId: [id(1)] }],
    ['minimum price', { minPrice: 0 }],
    ['maximum price', { maxPrice: 100 }],
    ['discount', { hasDiscount: true }],
  ])('is true for a %s', (_, value) => {
    expect(hasAppliedFilters(value)).toBe(true);
  });
});

describe('clearFilters', () => {
  it('keeps only the sort', () => {
    expect(
      clearFilters({
        q: 'a',
        sort: 'price_desc',
        brandId: [id(1)],
        size: ['M'],
        attributeValueId: [id(2)],
        minPrice: 1,
        maxPrice: 2,
        hasDiscount: true,
      }),
    ).toEqual({ sort: 'price_desc' });
  });

  it('leaves nothing when there was no sort', () => {
    const cleared = clearFilters({ q: 'a' });
    expect(hasAppliedFilters(cleared)).toBe(false);
    expect(cleared.sort).toBeUndefined();
  });
});

describe('attributeChoice', () => {
  it('gives only the values of that attribute out of the shared list', () => {
    const value = { attributeValueId: [id(101), id(201), id(102)] };
    expect(attributeChoice(value, colour)).toEqual([id(101), id(102)]);
    expect(attributeChoice(value, material)).toEqual([id(201)]);
  });

  it('gives none for no list', () => {
    expect(attributeChoice({}, colour)).toEqual([]);
  });
});

describe('withAttributeChoice', () => {
  it('replaces that attribute choice and keeps the others', () => {
    const value = { attributeValueId: [id(101), id(201)], q: 'a' };
    expect(withAttributeChoice(value, colour, [id(102)])).toEqual({
      q: 'a',
      attributeValueId: [id(201), id(102)],
    });
  });

  it('leaves the list out when the choice empties it', () => {
    const next = withAttributeChoice({ attributeValueId: [id(101)] }, colour, []);
    expect(next.attributeValueId).toBeUndefined();
  });

  it('keeps the other attribute when its own choice is cleared', () => {
    const next = withAttributeChoice({ attributeValueId: [id(101), id(201)] }, colour, []);
    expect(next.attributeValueId).toEqual([id(201)]);
  });

  it('does not change its input', () => {
    const value = { attributeValueId: [id(101)] };
    withAttributeChoice(value, colour, [id(102)]);
    expect(value.attributeValueId).toEqual([id(101)]);
  });
});

describe('priceChoice', () => {
  const bounds = { min: 500, max: 9000 };

  it('is undefined with no price applied', () => {
    expect(priceChoice({}, bounds)).toBeUndefined();
  });

  it('gives both sides', () => {
    expect(priceChoice({ minPrice: 1000, maxPrice: 5000 }, bounds)).toEqual([1000, 5000]);
  });

  it('gives an open side the current products bound', () => {
    expect(priceChoice({ minPrice: 2000 }, bounds)).toEqual([2000, 9000]);
    expect(priceChoice({ maxPrice: 3000 }, bounds)).toEqual([500, 3000]);
  });

  it('keeps a zero minimum', () => {
    expect(priceChoice({ minPrice: 0 }, bounds)).toEqual([0, 9000]);
  });
});

describe('withPriceChoice', () => {
  const price = { min: 1000, max: 10000 };

  it('sets both sides inside the bounds', () => {
    const next = withPriceChoice({ q: 'a' }, price, [1500, 9000]);
    expect(next).toEqual({ q: 'a', minPrice: 1500, maxPrice: 9000 });
  });

  it('drops a side at or beyond the bound', () => {
    expect(withPriceChoice({}, price, [1000, 9000])).toMatchObject({
      minPrice: undefined,
      maxPrice: 9000,
    });
    expect(withPriceChoice({}, price, [1500, 10000])).toMatchObject({
      minPrice: 1500,
      maxPrice: undefined,
    });
    expect(withPriceChoice({}, price, [500, 20000])).toMatchObject({
      minPrice: undefined,
      maxPrice: undefined,
    });
  });

  it('clears both sides for undefined', () => {
    const next = withPriceChoice({ minPrice: 1500, maxPrice: 9000, q: 'a' }, price, undefined);
    expect(next.minPrice).toBeUndefined();
    expect(next.maxPrice).toBeUndefined();
    expect(next.q).toBe('a');
  });
});
