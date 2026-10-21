import { describe, expect, it } from 'vitest';

import type { FacetAttribute } from '@/entities/product';

import { filterChanges, sortChange } from './analytics';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const BLACK = id(101);
const BLUE = id(102);
const COTTON = id(201);
const WOOL = id(202);
const GONE = id(999);

const attributes: FacetAttribute[] = [
  {
    id: id(100),
    name: 'Цвет',
    values: [
      { id: BLACK, value: 'Черный', colorHex: '#000000', count: 5 },
      { id: BLUE, value: 'Синий', colorHex: '#3972FC', count: 7 },
    ],
  },
  {
    id: id(200),
    name: 'Материал',
    values: [
      { id: COTTON, value: 'Хлопок', colorHex: null, count: 9 },
      { id: WOOL, value: 'Шерсть', colorHex: null, count: 4 },
    ],
  },
];

describe('filterChanges', () => {
  it('reports nothing for the same selection', () => {
    const query = { brandId: [id(1)], size: ['M'], minPrice: 100, hasDiscount: true as const };
    expect(filterChanges(query, { ...query }, attributes)).toEqual([]);
  });

  it('ignores the search, the sort and the order of a list', () => {
    expect(
      filterChanges(
        { q: 'a', sort: 'price_asc', brandId: [id(1), id(2)] },
        { q: 'b', sort: 'rating', brandId: [id(2), id(1)] },
        attributes,
      ),
    ).toEqual([]);
  });

  it('counts the brands chosen, and 0 when the filter is gone', () => {
    expect(filterChanges({}, { brandId: [id(1), id(2)] }, attributes)).toEqual([
      { filter: 'brand', values: 2 },
    ]);
    expect(filterChanges({ brandId: [id(1)] }, {}, attributes)).toEqual([
      { filter: 'brand', values: 0 },
    ]);
  });

  it('counts the sizes chosen', () => {
    expect(filterChanges({ size: ['M'] }, { size: ['M', 'L', 'S'] }, attributes)).toEqual([
      { filter: 'size', values: 3 },
    ]);
  });

  it('tells a colour attribute from the others by the current counts', () => {
    expect(filterChanges({}, { attributeValueId: [BLACK, BLUE, COTTON] }, attributes)).toEqual([
      { filter: 'color', values: 2 },
      { filter: 'attribute', values: 1 },
    ]);
  });

  it('reports only the attribute that changed, counting its values alone', () => {
    expect(
      filterChanges(
        { attributeValueId: [BLACK, COTTON] },
        { attributeValueId: [BLACK, COTTON, WOOL] },
        attributes,
      ),
    ).toEqual([{ filter: 'attribute', values: 2 }]);
    expect(
      filterChanges(
        { attributeValueId: [BLACK, COTTON] },
        { attributeValueId: [COTTON] },
        attributes,
      ),
    ).toEqual([{ filter: 'color', values: 0 }]);
  });

  it('groups the values of attributes the counts do not list as one attribute', () => {
    expect(filterChanges({}, { attributeValueId: [GONE, id(998)] }, attributes)).toEqual([
      { filter: 'attribute', values: 2 },
    ]);
    expect(filterChanges({}, { attributeValueId: [GONE] }, [])).toEqual([
      { filter: 'attribute', values: 1 },
    ]);
  });

  it('counts the price bounds set', () => {
    expect(filterChanges({}, { minPrice: 100 }, attributes)).toEqual([
      { filter: 'price', values: 1 },
    ]);
    expect(filterChanges({ minPrice: 100 }, { minPrice: 100, maxPrice: 500 }, attributes)).toEqual([
      { filter: 'price', values: 2 },
    ]);
    expect(
      filterChanges({ minPrice: 100, maxPrice: 500 }, { minPrice: 200, maxPrice: 500 }, attributes),
    ).toEqual([{ filter: 'price', values: 2 }]);
    expect(filterChanges({ minPrice: 100, maxPrice: 500 }, {}, attributes)).toEqual([
      { filter: 'price', values: 0 },
    ]);
  });

  it('reports the discount as 1 or 0', () => {
    expect(filterChanges({}, { hasDiscount: true }, attributes)).toEqual([
      { filter: 'discount', values: 1 },
    ]);
    expect(filterChanges({ hasDiscount: true }, {}, attributes)).toEqual([
      { filter: 'discount', values: 0 },
    ]);
  });

  it('reports one entry per changed filter, and carries no value of the selection', () => {
    const changes = filterChanges(
      { brandId: [id(1)], hasDiscount: true },
      { brandId: [id(2), id(3)], size: ['M'], minPrice: 1, hasDiscount: undefined },
      attributes,
    );
    expect(changes).toEqual([
      { filter: 'brand', values: 2 },
      { filter: 'size', values: 1 },
      { filter: 'price', values: 1 },
      { filter: 'discount', values: 0 },
    ]);
    for (const change of changes) expect(Object.keys(change).sort()).toEqual(['filter', 'values']);
  });

  it('clearing every filter reports each as gone', () => {
    expect(
      filterChanges(
        { brandId: [id(1)], size: ['M'], attributeValueId: [BLACK, COTTON], maxPrice: 9 },
        {},
        attributes,
      ),
    ).toEqual([
      { filter: 'brand', values: 0 },
      { filter: 'size', values: 0 },
      { filter: 'color', values: 0 },
      { filter: 'attribute', values: 0 },
      { filter: 'price', values: 0 },
    ]);
  });
});

describe('sortChange', () => {
  it('returns the new sort', () => {
    expect(sortChange({}, { sort: 'price_asc' })).toBe('price_asc');
    expect(sortChange({ sort: 'price_asc' }, { sort: 'rating' })).toBe('rating');
  });

  it('returns the default sort when the chosen one is dropped', () => {
    expect(sortChange({ sort: 'rating' }, {})).toBe('new');
  });

  it('returns nothing when the order is the same, the default one written either way', () => {
    expect(sortChange({}, {})).toBeUndefined();
    expect(sortChange({ sort: 'new' }, {})).toBeUndefined();
    expect(sortChange({ sort: 'discount' }, { sort: 'discount', q: 'a' })).toBeUndefined();
  });
});
