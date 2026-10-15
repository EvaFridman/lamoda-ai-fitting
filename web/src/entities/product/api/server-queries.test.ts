// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/shared/config/server', () => ({
  getServerEnv: () => ({ API_URL: 'http://api:3000', PROXY_SECRET: '' }),
}));

import { ApiError } from '@/shared/api';

import { productKeys } from './keys';
import {
  getProduct,
  getProductAttributeValues,
  getProductFacets,
  getProductImages,
  getProducts,
  getProductVariations,
  productAttributeValueListOptions,
  productFacetsOptions,
  productImageListOptions,
  productListOptions,
  productOptions,
  productVariationListOptions,
} from './server-queries';

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const ID2 = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const DATE = '2026-10-01T12:00:00.000Z';

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function respondWith(body: unknown, status = 200): void {
  fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(body, status)));
}

function requested(): URL {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  return new URL(String(fetchMock.mock.calls[0]?.[0]));
}

function listItem(extra: Record<string, unknown> = {}) {
  return {
    id: ID,
    article: 'A-1',
    name: 'Dress',
    brand: { id: ID2, name: 'Brand', ...extra },
    category: { id: ID2, name: 'Dresses', slug: 'dresses' },
    image: { url: 'https://cdn.example/a.jpg' },
    price: 5000,
    discount: 10,
    finalPrice: 4500,
    rating: null,
    createdAt: DATE,
    ...extra,
  };
}

const detail = {
  ...listItem(),
  description: null,
  images: [{ id: ID, url: 'https://cdn.example/a.jpg', sortOrder: 0 }],
  variations: [{ id: ID, size: 'M', stock: 3 }],
  attributes: [{ attribute: { id: ID, name: 'Color' }, values: [{ id: ID2, value: 'Red' }] }],
};

const facets = {
  total: 10,
  discounted: 2,
  price: { min: 100, max: 9000 },
  categories: [{ id: ID, name: 'Dresses', count: 4 }],
  brands: [{ id: ID2, name: 'Brand', count: 4 }],
  sizes: [{ size: 'M', count: 3 }],
  attributes: [
    {
      id: ID,
      name: 'Color',
      values: [
        { id: ID2, value: 'Red', colorHex: '#FF0000', count: 1 },
        { id: ID, value: 'Striped', colorHex: null, count: 2 },
      ],
    },
  ],
};

function facetsWithValue(patch: Record<string, unknown>) {
  const [attribute] = facets.attributes;
  const [first] = attribute?.values ?? [];
  return { ...facets, attributes: [{ ...attribute, values: [{ ...first, ...patch }] }] };
}

const image = {
  id: ID,
  productId: ID2,
  imageKey: 'a.jpg',
  url: 'https://cdn.example/a.jpg',
  sortOrder: 0,
  createdAt: DATE,
  updatedAt: DATE,
};
const variation = { id: ID, productId: ID2, size: 'M', stock: 3, createdAt: DATE, updatedAt: DATE };
const attributeValue = {
  productId: ID,
  attributeValueId: ID2,
  attribute: { id: ID, name: 'Color' },
  value: { id: ID2, value: 'Red' },
  createdAt: DATE,
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('getProducts', () => {
  it('requests /products without a query by default and returns the page', async () => {
    const page = { items: [listItem()], total: 1 };
    respondWith(page);
    await expect(getProducts()).resolves.toEqual(page);
    const url = requested();
    expect(url.pathname).toBe('/products');
    expect(url.search).toBe('');
  });

  it('sends arrays as repeated keys and leaves absent values out', async () => {
    respondWith({ items: [], total: 0 });
    await getProducts({
      categoryId: [ID, ID2],
      size: ['M', 'L'],
      q: 'red dress',
      minPrice: 100,
      hasDiscount: true,
      sort: 'price_asc',
      limit: 20,
      offset: 40,
    });
    const { searchParams } = requested();
    expect(searchParams.getAll('categoryId')).toEqual([ID, ID2]);
    expect(searchParams.getAll('size')).toEqual(['M', 'L']);
    expect(searchParams.get('q')).toBe('red dress');
    expect(searchParams.get('minPrice')).toBe('100');
    expect(searchParams.get('hasDiscount')).toBe('true');
    expect(searchParams.get('sort')).toBe('price_asc');
    expect(searchParams.get('limit')).toBe('20');
    expect(searchParams.get('offset')).toBe('40');
    expect([...searchParams.keys()]).not.toContain('brandId');
    expect([...searchParams.keys()]).not.toContain('maxPrice');
  });

  it('does not send unknown keys of a wider object', async () => {
    respondWith({ items: [], total: 0 });
    const wider = { q: 'x', admin: 'yes', extra: [1] };
    await getProducts(wider);
    expect([...requested().searchParams.keys()]).toEqual(['q']);
  });

  it('accepts extra fields, top-level and nested, and drops them', async () => {
    respondWith({ items: [listItem({ extra: 'x' })], total: 1, note: 'y' });
    const result = await getProducts();
    expect(result).toEqual({ items: [listItem()], total: 1 });
    expect(result.items[0]?.brand).not.toHaveProperty('extra');
    expect(result).not.toHaveProperty('note');
  });

  it.each([
    ['a wrong type', { items: [{ ...listItem(), price: '5000' }], total: 1 }],
    ['a missing field', { items: [{ ...listItem(), article: undefined }], total: 1 }],
    ['a bad uuid', { items: [{ ...listItem(), id: 'nope' }], total: 1 }],
    ['a non-ISO date', { items: [{ ...listItem(), createdAt: 'yesterday' }], total: 1 }],
    ['a missing total', { items: [] }],
  ])('rejects %s with a schema error', async (_name, body) => {
    respondWith(body);
    await expect(getProducts()).rejects.toMatchObject({ name: 'ApiError', kind: 'schema' });
  });

  it('propagates an http error', async () => {
    respondWith({ error: { code: 'INTERNAL' } }, 500);
    await expect(getProducts()).rejects.toMatchObject({ kind: 'http', status: 500 });
  });
});

describe('getProductFacets', () => {
  it('requests /products/facets and returns the counts', async () => {
    respondWith(facets);
    await expect(getProductFacets()).resolves.toEqual(facets);
    expect(requested().pathname).toBe('/products/facets');
  });

  it('sends the filters but never sort, limit or offset', async () => {
    respondWith(facets);
    const wider = {
      brandId: [ID],
      attributeValueId: [ID, ID2],
      maxPrice: 900,
      sort: 'rating',
      limit: 5,
      offset: 5,
    };
    await getProductFacets(wider);
    const { searchParams } = requested();
    expect(searchParams.getAll('brandId')).toEqual([ID]);
    expect(searchParams.getAll('attributeValueId')).toEqual([ID, ID2]);
    expect(searchParams.get('maxPrice')).toBe('900');
    expect([...searchParams.keys()].sort()).toEqual([
      'attributeValueId',
      'attributeValueId',
      'brandId',
      'maxPrice',
    ]);
  });

  it('accepts a null price and drops extra fields', async () => {
    respondWith({ ...facets, price: null, extra: 1, brands: [{ ...facets.brands[0], extra: 1 }] });
    const result = await getProductFacets();
    expect(result.price).toBeNull();
    expect(result.brands[0]).toEqual(facets.brands[0]);
  });

  it('rejects a response failing the schema', async () => {
    respondWith({ ...facets, total: 'many' });
    await expect(getProductFacets()).rejects.toMatchObject({ kind: 'schema' });
  });

  it('keeps a colorHex of either case and a null one', async () => {
    const mixed = facetsWithValue({ colorHex: '#a1B2c3' });
    respondWith(mixed);
    await expect(getProductFacets()).resolves.toEqual(mixed);
    respondWith(facetsWithValue({ colorHex: null }));
    const result = await getProductFacets();
    expect(result.attributes[0]?.values[0]?.colorHex).toBeNull();
  });

  it.each([
    ['a colour name', { colorHex: 'red' }],
    ['a short hex', { colorHex: '#FFF' }],
    ['a missing colorHex', { colorHex: undefined }],
  ])('rejects a facet value with %s as a schema error', async (_name, patch) => {
    respondWith(facetsWithValue(patch));
    await expect(getProductFacets()).rejects.toMatchObject({ name: 'ApiError', kind: 'schema' });
  });

  it('propagates an http error', async () => {
    respondWith({}, 400);
    await expect(getProductFacets()).rejects.toMatchObject({ kind: 'http', status: 400 });
  });
});

describe('getProduct', () => {
  it('requests /products/:id and returns the detail', async () => {
    respondWith(detail);
    await expect(getProduct(ID)).resolves.toEqual(detail);
    expect(requested().pathname).toBe(`/products/${ID}`);
  });

  it('keeps an id taken from input in one segment', async () => {
    respondWith(detail);
    await getProduct('../users');
    const url = requested();
    expect(url.origin).toBe('http://api:3000');
    expect(url.pathname).toBe('/products/..%2Fusers');
  });

  it('refuses an empty id before any request', async () => {
    const error = await getProduct('').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'path' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts extra fields and drops them, nested too', async () => {
    respondWith({
      ...detail,
      extra: 1,
      images: [{ ...detail.images[0], extra: 1 }],
      attributes: [{ ...detail.attributes[0], extra: 1 }],
    });
    const result = await getProduct(ID);
    expect(result).toEqual(detail);
    expect(result.images[0]).not.toHaveProperty('extra');
  });

  it.each([
    ['a missing description', { ...detail, description: undefined }],
    ['a bad image url', { ...detail, images: [{ ...detail.images[0], url: 'not a url' }] }],
    ['a bad nested uuid', { ...detail, variations: [{ ...detail.variations[0], id: '1' }] }],
    ['a non-ISO date', { ...detail, createdAt: '2026-10-01' }],
  ])('rejects %s with a schema error', async (_name, body) => {
    respondWith(body);
    await expect(getProduct(ID)).rejects.toMatchObject({ kind: 'schema' });
  });

  it('propagates a 404 as an http error', async () => {
    respondWith({ error: { code: 'NOT_FOUND' } }, 404);
    await expect(getProduct(ID)).rejects.toMatchObject({ kind: 'http', status: 404 });
  });
});

describe.each([
  ['getProductImages', getProductImages, 'images', image],
  ['getProductVariations', getProductVariations, 'variations', variation],
  ['getProductAttributeValues', getProductAttributeValues, 'attribute-values', attributeValue],
] as const)('%s', (_name, loader, segment, record) => {
  it('requests the sub-route with the page and returns it', async () => {
    const page = { items: [record], total: 1 };
    respondWith(page);
    await expect(loader(ID, { limit: 10, offset: 20 })).resolves.toEqual(page);
    const url = requested();
    expect(url.pathname).toBe(`/products/${ID}/${segment}`);
    expect(url.searchParams.get('limit')).toBe('10');
    expect(url.searchParams.get('offset')).toBe('20');
  });

  it('sends no query by default and ignores unknown keys', async () => {
    respondWith({ items: [], total: 0 });
    await loader(ID, { sort: 'rating', q: 'x' } as object);
    expect(requested().search).toBe('');
  });

  it('keeps an id taken from input in one segment', async () => {
    respondWith({ items: [], total: 0 });
    await loader('../users');
    expect(requested().pathname).toBe(`/products/..%2Fusers/${segment}`);
  });

  it('refuses an empty id before any request', async () => {
    await expect(loader('')).rejects.toMatchObject({ kind: 'path' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('drops extra fields of an item', async () => {
    respondWith({ items: [{ ...record, extra: 1 }], total: 1 });
    const result = await loader(ID);
    expect(result.items[0]).toEqual(record);
  });

  it.each([
    ['a bad uuid', { items: [{ ...record, productId: 'x' }], total: 1 }],
    ['a non-ISO date', { items: [{ ...record, createdAt: 'x' }], total: 1 }],
    ['a missing total', { items: [] }],
  ])('rejects %s with a schema error', async (_n, body) => {
    respondWith(body);
    await expect(loader(ID)).rejects.toMatchObject({ kind: 'schema' });
  });

  it('propagates an http error', async () => {
    respondWith({}, 503);
    await expect(loader(ID)).rejects.toMatchObject({ kind: 'http', status: 503 });
  });
});

describe('empty filters', () => {
  it.each([[''], ['   ']])('getProducts sends no q for %j', async (q) => {
    respondWith({ items: [], total: 0 });
    await getProducts({ q });
    expect(requested().search).toBe('');
  });

  it('getProducts trims q', async () => {
    respondWith({ items: [], total: 0 });
    await getProducts({ q: '  платье ' });
    expect(requested().searchParams.get('q')).toBe('платье');
  });

  it('getProducts sends no empty lists', async () => {
    respondWith({ items: [], total: 0 });
    await getProducts({ brandId: [], categoryId: [], size: [], attributeValueId: [] });
    expect(requested().search).toBe('');
  });

  it('getProducts keeps the non-empty lists next to empty ones', async () => {
    respondWith({ items: [], total: 0 });
    await getProducts({ brandId: [], size: ['M'] });
    const { searchParams } = requested();
    expect([...searchParams.keys()]).toEqual(['size']);
  });

  it('getProductFacets sends no empty list or blank q', async () => {
    respondWith(facets);
    await getProductFacets({ brandId: [], categoryId: [], q: '   ' });
    expect(requested().search).toBe('');
  });

  it('getProductFacets trims q', async () => {
    respondWith(facets);
    await getProductFacets({ q: '  платье ' });
    expect(requested().searchParams.get('q')).toBe('платье');
  });

  it.each([[['']], [['  ', '']]])('getProducts sends no size for %j', async (size) => {
    respondWith({ items: [], total: 0 });
    await getProducts({ size });
    expect(requested().search).toBe('');
  });

  it('getProducts trims list elements and drops empty ones', async () => {
    respondWith({ items: [], total: 0 });
    await getProducts({ size: [' M ', '', 'L'] });
    expect(requested().search).toBe('?size=M&size=L');
  });

  it.each([[['']], [['  ', '']]])('getProductFacets sends no size for %j', async (size) => {
    respondWith(facets);
    await getProductFacets({ size });
    expect(requested().search).toBe('');
  });

  it('getProductFacets trims list elements and drops empty ones', async () => {
    respondWith(facets);
    await getProductFacets({ size: [' M ', '', 'L'] });
    expect(requested().search).toBe('?size=M&size=L');
  });

  it('gives lists of blank elements the key of no filters', () => {
    expect(productKeys.list({ size: [''] })).toEqual(productKeys.list({}));
    expect(productKeys.facets({ size: ['  ', ''] })).toEqual(productKeys.facets({}));
  });

  it('gives a trimmed list element the key of the same element', () => {
    expect(productKeys.list({ size: [' M'] })).toEqual(productKeys.list({ size: ['M'] }));
  });

  it('gives empty filters the keys of no filters', () => {
    const empty = { brandId: [], categoryId: [], size: [], attributeValueId: [], q: '' };
    expect(productKeys.list({ brandId: [], q: '' })).toEqual(productKeys.list({}));
    expect(productKeys.list(empty)).toEqual(productKeys.list());
    expect(productKeys.facets({ brandId: [], q: '  ' })).toEqual(productKeys.facets({}));
    expect(productKeys.facets(empty)).toEqual(productKeys.facets());
    expect(productListOptions({ brandId: [], q: '' }).queryKey).toEqual(productKeys.list({}));
    expect(productFacetsOptions({ brandId: [], q: '' }).queryKey).toEqual(productKeys.facets({}));
  });

  it('gives a trimmed q the key of the same q', () => {
    expect(productKeys.list({ q: ' a ' })).toEqual(productKeys.list({ q: 'a' }));
  });
});

describe('product query options', () => {
  it('keys the list by the known filters only', () => {
    const query = { q: 'x', sort: 'rating', limit: 5 } as const;
    expect(productListOptions(query).queryKey).toEqual(productKeys.list(query));
    expect(productListOptions({ ...query, junk: 1 } as object).queryKey).toEqual(
      productListOptions(query).queryKey,
    );
  });

  it('keys the facets without sort and page', () => {
    const key = productFacetsOptions({ q: 'x' }).queryKey;
    expect(key).toEqual(productKeys.facets({ q: 'x' }));
    expect(productFacetsOptions({ q: 'x', sort: 'rating', limit: 1 } as object).queryKey).toEqual(
      key,
    );
  });

  it('keys the detail and its parts under the product', () => {
    expect(productOptions(ID).queryKey).toEqual(productKeys.detail(ID));
    expect(productImageListOptions(ID, { limit: 1 }).queryKey).toEqual(
      productKeys.images(ID, { limit: 1 }),
    );
    expect(productVariationListOptions(ID).queryKey).toEqual(productKeys.variations(ID));
    expect(productAttributeValueListOptions(ID).queryKey).toEqual(productKeys.attributeValues(ID));
    expect(productKeys.images(ID).slice(0, 3)).toEqual(productKeys.detail(ID));
    expect(productKeys.images(ID, { limit: 1, junk: 1 } as object)).toEqual(
      productKeys.images(ID, { limit: 1 }),
    );
  });

  it('keeps different filters apart', () => {
    expect(productListOptions({ q: 'a' }).queryKey).not.toEqual(
      productListOptions({ q: 'b' }).queryKey,
    );
    expect(productOptions(ID).queryKey).not.toEqual(productOptions(ID2).queryKey);
  });

  it('runs the loader in queryFn', async () => {
    respondWith({ items: [], total: 0 });
    const options = productListOptions({ q: 'x' });
    await (options.queryFn as () => Promise<unknown>)();
    expect(requested().searchParams.get('q')).toBe('x');
  });

  it('runs the detail loader in queryFn', async () => {
    respondWith(detail);
    await (productOptions(ID).queryFn as () => Promise<unknown>)();
    expect(requested().pathname).toBe(`/products/${ID}`);
  });
});
