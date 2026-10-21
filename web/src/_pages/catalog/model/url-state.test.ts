import { describe, expect, it } from 'vitest';

import { type CatalogUrlState, catalogSearch, parseCatalogUrl } from './url-state';

const A = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const B = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const C = '9b2e6f1a-1c3d-4b5e-9f7a-2d4c6e8f0a1b';

const parse = (search: string) => parseCatalogUrl(new URLSearchParams(search));

describe('parseCatalogUrl', () => {
  it('gives an empty state for an empty address, from either kind of params', () => {
    expect(parse('')).toEqual({ query: {} });
    expect(parseCatalogUrl({})).toEqual({ query: {} });
  });

  it('reads Next searchParams records and URLSearchParams alike', () => {
    const record = parseCatalogUrl({ q: 'платье', brandId: [A, B], hasDiscount: 'true' });
    const params = parse(`q=платье&brandId=${A}&brandId=${B}&hasDiscount=true`);
    expect(record).toEqual(params);
    expect(record.query).toMatchObject({ q: 'платье', brandId: [A, B], hasDiscount: true });
  });

  it('drops unknown parameters, the category and the page from the state', () => {
    const state = parse(`utm_source=x&limit=5&offset=10&categoryId=${A}&q=a`);
    expect(state).toEqual({ query: { q: 'a' } });
  });

  describe('lists', () => {
    it('reads comma lists and repeated keys, each value once', () => {
      expect(parse(`brandId=${A},${B}&brandId=${B},${C}`).query.brandId).toEqual([A, B, C]);
    });

    it('keeps the valid uuids and drops the rest', () => {
      const state = parse(`brandId=${A},nope,${B}&attributeValueId=bad,${C}`);
      expect(state.query.brandId).toEqual([A, B]);
      expect(state.query.attributeValueId).toEqual([C]);
    });

    it('leaves a list with no valid item out', () => {
      expect(parse('brandId=nope,also').query.brandId).toBeUndefined();
    });

    it('reads at most 50 values', () => {
      const sizes = Array.from({ length: 80 }, (_, index) => `s${index}`).join(',');
      expect(parse(`size=${sizes}`).query.size).toHaveLength(50);
    });

    it('trims sizes and drops empty, over-long and NUL ones', () => {
      const state = parse(
        `size=${encodeURIComponent(' M ')},,${'x'.repeat(21)},${'y'.repeat(20)},a%00b`,
      );
      expect(state.query.size).toEqual(['M', 'y'.repeat(20)]);
    });

    it('counts a size in characters, not UTF-16 units', () => {
      const emoji = '😀'.repeat(20);
      expect(parse(`size=${emoji}`).query.size).toEqual([emoji]);
      expect(parse(`size=${emoji}😀`).query.size).toBeUndefined();
    });
  });

  describe('q', () => {
    it('trims it', () => {
      expect(parse(`q=${encodeURIComponent('  платье ')}`).query.q).toBe('платье');
    });

    it('leaves out a whitespace-only search', () => {
      expect(parse('q=%20%20').query.q).toBeUndefined();
      expect(parse('q=').query.q).toBeUndefined();
    });

    it('cuts it to 100 characters, an emoji counting as one', () => {
      expect(parse(`q=${'a'.repeat(150)}`).query.q).toBe('a'.repeat(100));
      expect(parse(`q=${'😀'.repeat(150)}`).query.q).toBe('😀'.repeat(100));
    });

    it('drops a search with a NUL', () => {
      expect(parse('q=a%00b').query.q).toBeUndefined();
    });
  });

  describe('prices', () => {
    it.each([
      ['0', 0],
      ['1500', 1500],
      ['12.5', 12.5],
      ['12.50', 12.5],
      ['99999999.99', 99_999_999.99],
    ])('keeps %s', (value, expected) => {
      expect(parse(`minPrice=${value}`).query.minPrice).toBe(expected);
    });

    it.each(['-1', '1.234', 'abc', '', '1e3', '100000000', '1.', '.5', ' 5'])(
      'drops %j',
      (value) => {
        expect(parse(`minPrice=${encodeURIComponent(value)}`).query.minPrice).toBeUndefined();
      },
    );

    it('drops a maximum below the minimum and keeps an equal or higher one', () => {
      expect(parse('minPrice=500&maxPrice=100').query).toEqual({ minPrice: 500 });
      expect(parse('minPrice=500&maxPrice=500').query).toEqual({ minPrice: 500, maxPrice: 500 });
      expect(parse('minPrice=500&maxPrice=900').query).toEqual({ minPrice: 500, maxPrice: 900 });
      expect(parse('maxPrice=100').query).toEqual({ maxPrice: 100 });
    });
  });

  it('reads hasDiscount only as true and drops false like an invalid value', () => {
    expect(parse('hasDiscount=true').query.hasDiscount).toBe(true);
    for (const value of ['false', '1', 'TRUE', 'yes', '']) {
      expect(parse(`hasDiscount=${value}`).query.hasDiscount).toBeUndefined();
    }
  });

  it('reads a known sort and leaves the default and unknown ones out', () => {
    expect(parse('sort=price_asc').query.sort).toBe('price_asc');
    expect(parse('sort=rating').query.sort).toBe('rating');
    expect(parse('sort=new').query.sort).toBeUndefined();
    expect(parse('sort=cheap').query.sort).toBeUndefined();
  });

  it('uses the first value of a parameter given twice', () => {
    const state = parse(
      'sort=discount&sort=rating&q=a&q=b&minPrice=5&minPrice=9&cursor=x&cursor=y',
    );
    expect(state).toEqual({ query: { sort: 'discount', q: 'a', minPrice: 5 }, cursor: 'x' });
    expect(parseCatalogUrl({ q: ['a', 'b'] }).query.q).toBe('a');
  });

  it('keeps the cursor as given and ignores an empty one', () => {
    expect(parse('cursor=abc.DEF_-%3D').cursor).toBe('abc.DEF_-=');
    expect(parse('cursor=')).toEqual({ query: {} });
    expect('cursor' in parse('cursor=')).toBe(false);
  });
});

describe('catalogSearch', () => {
  it('gives an empty string for an empty state', () => {
    expect(catalogSearch({ query: {} })).toBe('');
  });

  it('writes parameters in one order whatever the order of the state', () => {
    const state: CatalogUrlState = {
      cursor: 'cur',
      query: {
        hasDiscount: true,
        maxPrice: 900,
        minPrice: 100,
        attributeValueId: [C],
        size: ['M', 'L'],
        brandId: [A, B],
        sort: 'price_desc',
        q: 'платье',
      },
    };
    expect(catalogSearch(state)).toBe(
      `?q=${encodeURIComponent('платье')}&sort=price_desc&brandId=${A},${B}&size=M,L` +
        `&attributeValueId=${C}&minPrice=100&maxPrice=900&hasDiscount=true&cursor=cur`,
    );
  });

  it('encodes each list item, so a comma or a space inside one stays encoded', () => {
    expect(catalogSearch({ query: { size: ['4 XL', 'a&b'] } })).toBe('?size=4%20XL,a%26b');
  });

  it('leaves out the default sort, empty lists and an empty cursor', () => {
    expect(catalogSearch({ query: { sort: 'new', brandId: [], size: [] }, cursor: '' })).toBe('');
  });

  it('trims the search and leaves out a blank one', () => {
    expect(catalogSearch({ query: { q: '  a  ' } })).toBe('?q=a');
    expect(catalogSearch({ query: { q: '   ' } })).toBe('');
  });

  it('keeps a zero price and leaves out hasDiscount false, as it is read (O85)', () => {
    expect(catalogSearch({ query: { minPrice: 0, hasDiscount: false } })).toBe('?minPrice=0');
  });
});

describe('round trips', () => {
  const states: CatalogUrlState[] = [
    { query: {} },
    {
      query: {
        q: 'платье & шорты',
        sort: 'discount',
        brandId: [A, B],
        size: ['M', '4 XL'],
        attributeValueId: [C],
        minPrice: 100.5,
        maxPrice: 900,
        hasDiscount: true,
      },
      cursor: 'eyJhIjoxfQ==',
    },
    { query: { minPrice: 0, hasDiscount: true } },
    { query: { q: '😀'.repeat(100) } },
  ];

  it.each(states)('parse(catalogSearch(state)) equals the state %#', (state) => {
    expect(parseCatalogUrl(new URLSearchParams(catalogSearch(state)))).toEqual(state);
  });

  it('writes the canonical string of a messy address', () => {
    const messy = `utm_source=a&hasDiscount=true&brandId=${B}&brandId=${A},${B},bad&sort=new&q=%20x%20&limit=3`;
    expect(catalogSearch(parse(messy))).toBe(`?q=x&brandId=${B},${A}&hasDiscount=true`);
    const canonical = catalogSearch(parse(messy));
    expect(catalogSearch(parse(canonical))).toBe(canonical);
  });
});
