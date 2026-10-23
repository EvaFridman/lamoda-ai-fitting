import { describe, expect, it } from 'vitest';

import type { FacetAttribute, FacetBrand } from '../model/schemas';
import { filterSummary } from './filter-summary';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// The no-break space the price formats use.
const nb = String.fromCodePoint(0xa0);

const colour: FacetAttribute = {
  id: id(100),
  name: 'Цвет',
  values: [
    { id: id(101), value: 'Бежевый', colorHex: '#F5F5DC', count: 3 },
    { id: id(102), value: 'Черный', colorHex: '#000000', count: 5 },
    { id: id(103), value: 'Синий', colorHex: null, count: 7 },
  ],
};

const material: FacetAttribute = {
  id: id(200),
  name: 'Материал',
  values: [
    { id: id(201), value: 'Хлопок', colorHex: null, count: 9 },
    { id: id(202), value: 'Шерсть', colorHex: null, count: 4 },
    { id: id(203), value: 'Лен', colorHex: null, count: 1 },
  ],
};

const brands: FacetBrand[] = [
  { id: id(1), name: 'Nike', count: 12 },
  { id: id(2), name: 'Puma', count: 5 },
  { id: id(3), name: 'Adidas', count: 2 },
];

describe('filterSummary.attribute', () => {
  it('is undefined when nothing is chosen', () => {
    expect(filterSummary.attribute(material, [])).toBeUndefined();
  });

  it('joins the names by ", " in the order of the values, not of the ids', () => {
    expect(filterSummary.attribute(material, [id(203), id(201)])).toBe('Хлопок, Лен');
  });

  it('drops an id missing from the counts, and is undefined when all are missing', () => {
    expect(filterSummary.attribute(material, [id(202), id(999)])).toBe('Шерсть');
    expect(filterSummary.attribute(material, [id(998), id(999)])).toBeUndefined();
  });

  it('writes a colour attribute in lower case', () => {
    expect(filterSummary.attribute(colour, [id(102), id(101)])).toBe('бежевый, черный');
  });

  it('keeps the case of an attribute that is not a colour', () => {
    expect(filterSummary.attribute(material, [id(201)])).toBe('Хлопок');
  });
});

describe('filterSummary.brand', () => {
  it('is undefined when nothing is chosen', () => {
    expect(filterSummary.brand(brands, [])).toBeUndefined();
  });

  it('joins the names in the order of the brands', () => {
    expect(filterSummary.brand(brands, [id(3), id(1)])).toBe('Nike, Adidas');
  });

  it('drops a missing brand, and is undefined when all are missing', () => {
    expect(filterSummary.brand(brands, [id(2), id(999)])).toBe('Puma');
    expect(filterSummary.brand(brands, [id(999)])).toBeUndefined();
  });
});

describe('filterSummary.size', () => {
  const sizes = [
    { size: 'M', count: 1 },
    { size: '42', count: 2 },
    { size: 'XL', count: 3 },
    { size: 'S', count: 4 },
  ];

  it('is undefined when nothing is chosen', () => {
    expect(filterSummary.size(sizes, [])).toBeUndefined();
  });

  it('puts the sizes in clothing order whatever the order chosen', () => {
    expect(filterSummary.size(sizes, ['XL', 'S', '42', 'M'])).toBe('S, M, XL, 42');
  });

  it('drops a size missing from the counts, and is undefined when all are missing', () => {
    expect(filterSummary.size(sizes, ['L', 'M'])).toBe('M');
    expect(filterSummary.size(sizes, ['L', 'XXS'])).toBeUndefined();
  });
});

describe('filterSummary.price', () => {
  const price = { min: 1000, max: 10000 };

  it('is undefined when no range is chosen', () => {
    expect(filterSummary.price(price, undefined)).toBeUndefined();
    expect(filterSummary.price(null, undefined)).toBeUndefined();
  });

  it('writes a range inside the bounds as the price chip does', () => {
    expect(filterSummary.price(price, [1500, 9000])).toBe(`от 1${nb}500 до 9${nb}000${nb}₽`);
    expect(filterSummary.price(price, [1500, 10000])).toBe(`от 1${nb}500${nb}₽`);
    expect(filterSummary.price(price, [1000, 9000])).toBe(`до 9${nb}000${nb}₽`);
  });

  it('writes both sides when the range equals the bounds', () => {
    expect(filterSummary.price(price, [1000, 10000])).toBe(`от 1${nb}000 до 10${nb}000${nb}₽`);
  });

  it('writes both sides when there are no products to bound it', () => {
    expect(filterSummary.price(null, [1500, 9000])).toBe(`от 1${nb}500 до 9${nb}000${nb}₽`);
  });
});

describe('filterSummary.sort', () => {
  it('is undefined for the default order', () => {
    expect(filterSummary.sort('new')).toBeUndefined();
  });

  it('is the label of any other order', () => {
    expect(filterSummary.sort('price_desc')).toBe('Сначала дороже');
    expect(filterSummary.sort('price_asc')).toBe('Сначала дешевле');
  });
});
