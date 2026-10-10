import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp } from '../support/test-app.js';

interface Facets {
  total: number;
  discounted: number;
  price: { min: number; max: number } | null;
  categories: { id: string; name: string; count: number }[];
  brands: { id: string; name: string; count: number }[];
  sizes: { size: string; count: number }[];
  attributes: {
    id: string;
    name: string;
    values: { id: string; value: string; count: number }[];
  }[];
}

interface Page {
  items: { id: string; price: number }[];
  total: number;
}

// The list filters as the tests choose them; `q` defaults to the scope of the fixture.
interface Choice {
  categoryId?: string[];
  brandId?: string[];
  size?: string[];
  attributeValueId?: string[];
  q?: string;
  minPrice?: number;
  maxPrice?: number;
  hasDiscount?: boolean;
}

let testApp: TestApp;

beforeAll(async () => {
  testApp = await createTestApp();
});

afterAll(async () => {
  await testApp.close();
});

const http = () => request(testApp.app.getHttpServer());

function toQuery(choice: Choice): string {
  const parts: string[] = [];
  for (const key of ['categoryId', 'brandId', 'size', 'attributeValueId'] as const) {
    const values = choice[key];
    if (values !== undefined) {
      parts.push(`${key}=${values.map((value) => encodeURIComponent(value)).join(',')}`);
    }
  }
  if (choice.q !== undefined) parts.push(`q=${encodeURIComponent(choice.q)}`);
  if (choice.minPrice !== undefined) parts.push(`minPrice=${choice.minPrice}`);
  if (choice.maxPrice !== undefined) parts.push(`maxPrice=${choice.maxPrice}`);
  if (choice.hasDiscount !== undefined) parts.push(`hasDiscount=${choice.hasDiscount}`);
  return parts.join('&');
}

async function facets(query: string): Promise<Facets> {
  const response = await http().get(`/products/facets?${query}`);
  expect(response.status, query).toBe(200);
  return response.body as Facets;
}

async function list(query: string): Promise<Page> {
  const response = await http().get(`/products?${query}&limit=100`);
  expect(response.status, query).toBe(200);
  return response.body as Page;
}

function expectInvalid(response: request.Response): void {
  expect(response.status).toBe(400);
  expect((response.body as { error: { code: string } }).error.code).toBe('VALIDATION_FAILED');
}

interface Fixture {
  token: string;
  categories: { dress: string; shirt: string; empty: string };
  brands: { a: string; b: string; c: string; unused: string };
  attributes: { color: string; material: string };
  values: {
    black: string;
    white: string;
    red: string;
    cotton: string;
    silk: string;
  };
  valueAttribute: Map<string, string>;
  products: { p1: string; p2: string; p3: string; p4: string; p5: string };
}

async function newProduct(
  token: string,
  fields: {
    name: string;
    categoryId: string;
    brandId: string;
    price: number;
    discount?: number;
    sizes?: [string, number][];
    valueIds?: string[];
  },
): Promise<string> {
  const created = await testApp.prisma.product.create({
    data: {
      article: `ART-${randomUUID()}`,
      name: `${token} ${fields.name}`,
      price: fields.price,
      discount: fields.discount ?? 0,
      brandId: fields.brandId,
      categoryId: fields.categoryId,
      variations: { create: (fields.sizes ?? []).map(([size, stock]) => ({ size, stock })) },
      attributeValues: {
        create: (fields.valueIds ?? []).map((attributeValueId) => ({ attributeValueId })),
      },
    },
  });
  return created.id;
}

// Every product name starts with the token, and `q=<token>` scopes the facets to this fixture: the
// tests of a file share one database. Names, sort orders and creation order are chosen so that the
// sort rules (not the creation order) decide the order of the answer.
//
//   p1 dress  A  100.00   0  M5 L0     black cotton   "red dress"
//   p2 dress  A  250.50  20  M2 S1      white silk
//   p3 shirt  B   50.00  10  L3         black silk
//   p4 shirt  B  300.00   0  S0 XS0     black cotton
//   p5 shirt  C   80.00   0  (none)     (none)
async function arrange(): Promise<Fixture> {
  const token = `tk${randomUUID().replaceAll('-', '')}`;
  const { prisma } = testApp;
  const category = async (name: string, sortOrder: number) =>
    (
      await prisma.category.create({
        data: { name: `${name}-${token}`, slug: randomUUID(), isActive: true, sortOrder },
      })
    ).id;
  const brand = async (name: string) =>
    (await prisma.brand.create({ data: { name: `${name}-${token}` } })).id;
  const attribute = async (name: string) =>
    (await prisma.attribute.create({ data: { name: `${name} ${token}` } })).id;
  const value = async (attributeId: string, text: string) =>
    (await prisma.attributeValue.create({ data: { attributeId, value: text } })).id;

  const shirt = await category('Shirt', 1);
  const dress = await category('Dress', 2);
  const empty = await category('Empty', 0);
  const c = await brand('C');
  const b = await brand('B');
  const a = await brand('A');
  const unused = await brand('D');
  const material = await attribute('Material');
  const color = await attribute('Color');
  const white = await value(color, 'white');
  const red = await value(color, 'red');
  const black = await value(color, 'black');
  const silk = await value(material, 'silk');
  const cotton = await value(material, 'cotton');

  const p1 = await newProduct(token, {
    name: 'red dress',
    categoryId: dress,
    brandId: a,
    price: 100,
    sizes: [
      ['M', 5],
      ['L', 0],
    ],
    valueIds: [black, cotton],
  });
  const p2 = await newProduct(token, {
    name: 'white dress',
    categoryId: dress,
    brandId: a,
    price: 250.5,
    discount: 20,
    sizes: [
      ['M', 2],
      ['S', 1],
    ],
    valueIds: [white, silk],
  });
  const p3 = await newProduct(token, {
    name: 'shirt',
    categoryId: shirt,
    brandId: b,
    price: 50,
    discount: 10,
    sizes: [['L', 3]],
    valueIds: [black, silk],
  });
  const p4 = await newProduct(token, {
    name: 'shirt long',
    categoryId: shirt,
    brandId: b,
    price: 300,
    sizes: [
      ['S', 0],
      ['XS', 0],
    ],
    valueIds: [black, cotton],
  });
  const p5 = await newProduct(token, {
    name: 'shirt plain',
    categoryId: shirt,
    brandId: c,
    price: 80,
  });

  return {
    token,
    categories: { dress, shirt, empty },
    brands: { a, b, c, unused },
    attributes: { color, material },
    values: { black, white, red, cotton, silk },
    valueAttribute: new Map([
      [black, color],
      [white, color],
      [red, color],
      [cotton, material],
      [silk, material],
    ]),
    products: { p1, p2, p3, p4, p5 },
  };
}

describe('GET /products/facets: the answer', () => {
  it('counts every group with no filter but the scope, in the documented order', async () => {
    const f = await arrange();

    const body = await facets(`q=${f.token}`);

    expect(body.total).toBe(5);
    expect(body.discounted).toBe(2);
    expect(body.price).toEqual({ min: 50, max: 300 });
    expect(body.categories.map(({ id, count }) => [id, count])).toEqual([
      [f.categories.shirt, 3],
      [f.categories.dress, 2],
    ]);
    expect(body.categories[0]?.name).toBe(`Shirt-${f.token}`);
    expect(body.brands.map(({ id, count }) => [id, count])).toEqual([
      [f.brands.a, 2],
      [f.brands.b, 2],
      [f.brands.c, 1],
    ]);
    expect(body.brands[0]?.name).toBe(`A-${f.token}`);
    expect(body.sizes).toEqual([
      { size: 'L', count: 1 },
      { size: 'M', count: 2 },
      { size: 'S', count: 1 },
    ]);
    expect(body.attributes).toEqual([
      {
        id: f.attributes.color,
        name: `Color ${f.token}`,
        values: [
          { id: f.values.black, value: 'black', count: 3 },
          { id: f.values.white, value: 'white', count: 1 },
        ],
      },
      {
        id: f.attributes.material,
        name: `Material ${f.token}`,
        values: [
          { id: f.values.cotton, value: 'cotton', count: 2 },
          { id: f.values.silk, value: 'silk', count: 2 },
        ],
      },
    ]);
  });

  it('answers with JSON numbers', async () => {
    const f = await arrange();

    const body = await facets(`q=${f.token}`);

    expect(typeof body.total).toBe('number');
    expect(typeof body.discounted).toBe('number');
    expect(typeof body.price?.min).toBe('number');
    expect(typeof body.price?.max).toBe('number');
    expect(body.price).toEqual({ min: 50, max: 300 });
    for (const row of [...body.categories, ...body.brands, ...body.sizes]) {
      expect(typeof row.count).toBe('number');
    }
    for (const attribute of body.attributes) {
      for (const row of attribute.values) expect(typeof row.count).toBe('number');
    }
  });

  it('keeps the price before the discount, with cents', async () => {
    const f = await arrange();

    const body = await facets(`q=${f.token}&brandId=${f.brands.a}`);

    expect(body.price).toEqual({ min: 100, max: 250.5 });
  });

  it('is public: needs no admin token', async () => {
    const response = await http().get('/products/facets');

    expect(response.status).toBe(200);
  });

  it('is not taken for a product id', async () => {
    const response = await http().get('/products/facets');

    expect(response.status).not.toBe(400);
  });
});

describe('GET /products/facets: choosing a value', () => {
  it('one colour keeps the other colours counts and narrows the other attributes', async () => {
    const f = await arrange();

    const body = await facets(`q=${f.token}&attributeValueId=${f.values.black}`);

    expect(body.total).toBe(3);
    expect(body.discounted).toBe(1);
    expect(body.price).toEqual({ min: 50, max: 300 });
    const [color, material] = body.attributes;
    expect(color?.values.map(({ id, count }) => [id, count])).toEqual([
      [f.values.black, 3],
      [f.values.white, 1],
    ]);
    expect(material?.values.map(({ id, count }) => [id, count])).toEqual([
      [f.values.cotton, 2],
      [f.values.silk, 1],
    ]);
    expect(body.categories.map(({ count }) => count)).toEqual([2, 1]);
  });

  it('colour and material narrow each other (AND across attributes)', async () => {
    const f = await arrange();

    const body = await facets(`q=${f.token}&attributeValueId=${f.values.black},${f.values.cotton}`);

    expect(body.total).toBe(2);
    const [color, material] = body.attributes;
    expect(color?.values.map(({ id, count }) => [id, count])).toEqual([[f.values.black, 2]]);
    expect(material?.values.map(({ id, count }) => [id, count])).toEqual([
      [f.values.cotton, 2],
      [f.values.silk, 1],
    ]);
  });

  it('two colours widen (OR inside an attribute)', async () => {
    const f = await arrange();

    const body = await facets(`q=${f.token}&attributeValueId=${f.values.black},${f.values.white}`);

    expect(body.total).toBe(4);
    const color = body.attributes[0];
    expect(color?.values.map(({ id, count }) => [id, count])).toEqual([
      [f.values.black, 3],
      [f.values.white, 1],
    ]);
  });

  it('a chosen brand keeps the other brands and narrows the categories', async () => {
    const f = await arrange();

    const body = await facets(`q=${f.token}&brandId=${f.brands.a}`);

    expect(body.total).toBe(2);
    expect(body.brands.map(({ id, count }) => [id, count])).toEqual([
      [f.brands.a, 2],
      [f.brands.b, 2],
      [f.brands.c, 1],
    ]);
    expect(body.categories.map(({ id, count }) => [id, count])).toEqual([[f.categories.dress, 2]]);
  });

  it('a chosen size keeps the other sizes', async () => {
    const f = await arrange();

    const body = await facets(`q=${f.token}&size=M`);

    expect(body.total).toBe(2);
    expect(body.sizes).toEqual([
      { size: 'L', count: 1 },
      { size: 'M', count: 2 },
      { size: 'S', count: 1 },
    ]);
    expect(body.brands.map(({ id, count }) => [id, count])).toEqual([[f.brands.a, 2]]);
  });
});

describe('GET /products/facets: total, discounted and price ignore their own filter', () => {
  it('discounted is counted without hasDiscount', async () => {
    const f = await arrange();

    const none = await facets(`q=${f.token}&hasDiscount=false`);
    const some = await facets(`q=${f.token}&hasDiscount=true`);

    expect(none.total).toBe(3);
    expect(none.discounted).toBe(2);
    expect(some.total).toBe(2);
    expect(some.discounted).toBe(2);
    expect(none.discounted).toBe((await list(`q=${f.token}&hasDiscount=true`)).total);
    expect(none.price).toEqual({ min: 80, max: 300 });
  });

  it('discounted keeps the other filters', async () => {
    const f = await arrange();

    const body = await facets(`q=${f.token}&brandId=${f.brands.a}&hasDiscount=false`);

    expect(body.total).toBe(1);
    expect(body.discounted).toBe(1);
  });

  it('price is counted without minPrice and maxPrice', async () => {
    const f = await arrange();

    const body = await facets(`q=${f.token}&minPrice=100&maxPrice=260`);

    expect(body.total).toBe(2);
    expect(body.price).toEqual({ min: 50, max: 300 });
    expect(body.discounted).toBe(1);
  });

  it('price follows the other filters', async () => {
    const f = await arrange();

    const body = await facets(`q=${f.token}&brandId=${f.brands.b}&minPrice=1000`);

    expect(body.total).toBe(0);
    expect(body.price).toEqual({ min: 50, max: 300 });
  });
});

describe('GET /products/facets: which values are listed', () => {
  it('lists a chosen value that has 0 products, and omits an attribute left with no values', async () => {
    const f = await arrange();

    const body = await facets(
      `q=${f.token}&categoryId=${f.categories.empty}&brandId=${f.brands.unused}&attributeValueId=${f.values.red}`,
    );

    expect(body.total).toBe(0);
    expect(body.discounted).toBe(0);
    expect(body.price).toBeNull();
    expect(body.categories.map(({ id, count }) => [id, count])).toEqual([[f.categories.empty, 0]]);
    expect(body.brands.map(({ id, count }) => [id, count])).toEqual([[f.brands.unused, 0]]);
    expect(body.sizes).toEqual([]);
    expect(body.attributes.map(({ id }) => id)).toEqual([f.attributes.color]);
    expect(body.attributes[0]?.values).toEqual([{ id: f.values.red, value: 'red', count: 0 }]);
  });

  it('lists a chosen category and brand with 0 next to those with products', async () => {
    const f = await arrange();

    const body = await facets(
      `q=${f.token}&categoryId=${f.categories.empty},${f.categories.dress}`,
    );

    expect(body.total).toBe(2);
    expect(body.categories.map(({ id, count }) => [id, count])).toEqual([
      [f.categories.empty, 0],
      [f.categories.shirt, 3],
      [f.categories.dress, 2],
    ]);
  });

  it('does not list a value with 0 products that is not chosen', async () => {
    const f = await arrange();

    const body = await facets(`q=${f.token}`);

    expect(body.categories.map(({ id }) => id)).not.toContain(f.categories.empty);
    expect(body.brands.map(({ id }) => id)).not.toContain(f.brands.unused);
    expect(body.attributes.flatMap((a) => a.values.map((v) => v.id))).not.toContain(f.values.red);
    expect(body.sizes.map(({ size }) => size)).not.toContain('XS');
  });

  it('counts only sizes in stock', async () => {
    const f = await arrange();

    const body = await facets(`q=${f.token}`);

    expect(body.sizes.map(({ size }) => size)).toEqual(['L', 'M', 'S']);
    expect(body.sizes.find(({ size }) => size === 'L')?.count).toBe(1);
    expect(body.sizes.find(({ size }) => size === 'S')?.count).toBe(1);
  });

  it('lists a chosen size that no product has in stock, with 0', async () => {
    const f = await arrange();

    const soldOut = await facets(`q=${f.token}&size=XS`);
    const unknown = await facets(`q=${f.token}&size=XXL,M`);

    expect(soldOut.total).toBe(0);
    expect(soldOut.price).toBeNull();
    expect(soldOut.sizes).toEqual([
      { size: 'L', count: 1 },
      { size: 'M', count: 2 },
      { size: 'S', count: 1 },
      { size: 'XS', count: 0 },
    ]);
    expect(unknown.total).toBe(2);
    expect(unknown.sizes.at(-1)).toEqual({ size: 'XXL', count: 0 });
  });

  it('an unknown well-formed attribute value empties everything', async () => {
    const f = await arrange();

    const alone = await facets(`q=${f.token}&attributeValueId=${randomUUID()}`);
    const beside = await facets(`q=${f.token}&attributeValueId=${f.values.black},${randomUUID()}`);

    const empty = {
      total: 0,
      discounted: 0,
      price: null,
      categories: [],
      brands: [],
      sizes: [],
    };
    expect(alone).toEqual({ ...empty, attributes: [] });
    // The chosen known value stays listed, with 0.
    expect(beside).toEqual({
      ...empty,
      attributes: [
        {
          id: f.attributes.color,
          name: `Color ${f.token}`,
          values: [{ id: f.values.black, value: 'black', count: 0 }],
        },
      ],
    });
  });

  it('an unknown category is not listed, for it has no name', async () => {
    const f = await arrange();

    const body = await facets(`q=${f.token}&categoryId=${randomUUID()}`);

    expect(body.total).toBe(0);
    expect(body.price).toBeNull();
    expect(body.categories.map(({ id }) => id)).toEqual([f.categories.shirt, f.categories.dress]);
    expect(body.categories.map(({ count }) => count)).toEqual([3, 2]);
  });

  it('an unknown brand is not listed either', async () => {
    const f = await arrange();

    const body = await facets(`q=${f.token}&brandId=${randomUUID()}`);

    expect(body.total).toBe(0);
    expect(body.brands.map(({ id }) => id)).toEqual([f.brands.a, f.brands.b, f.brands.c]);
  });

  it('a scope that matches no product gives zeros, null and empty lists', async () => {
    const body = await facets(`q=${randomUUID()}`);

    expect(body).toEqual({
      total: 0,
      discounted: 0,
      price: null,
      categories: [],
      brands: [],
      sizes: [],
      attributes: [],
    });
  });
});

describe('GET /products/facets: order', () => {
  it('sorts categories by sortOrder, then name, then id; brands, attributes and values by name', async () => {
    const f = await arrange();
    const body = await facets(`q=${f.token}&categoryId=${f.categories.empty}`);

    expect(body.categories.map(({ id }) => id)).toEqual([
      f.categories.empty,
      f.categories.shirt,
      f.categories.dress,
    ]);
    expect(body.brands.map(({ id }) => id)).toEqual([]);

    const all = await facets(`q=${f.token}`);
    expect(all.brands.map(({ id }) => id)).toEqual([f.brands.a, f.brands.b, f.brands.c]);
    expect(all.attributes.map(({ id }) => id)).toEqual([f.attributes.color, f.attributes.material]);
    expect(all.attributes.map((a) => a.values.map((v) => v.value))).toEqual([
      ['black', 'white'],
      ['cotton', 'silk'],
    ]);
  });

  it('breaks a tie of sort orders by name', async () => {
    const f = await arrange();
    await testApp.prisma.category.update({
      where: { id: f.categories.shirt },
      data: { sortOrder: 2 },
    });

    const body = await facets(`q=${f.token}`);

    expect(body.categories.map(({ id }) => id)).toEqual([f.categories.dress, f.categories.shirt]);
  });
});

describe('GET /products/facets: q', () => {
  it('treats %, _ and a backslash as plain characters, as the list does', async () => {
    const f = await arrange();
    const { brandId, categoryId } = {
      brandId: f.brands.a,
      categoryId: f.categories.dress,
    };
    for (const name of ['50% off', '500 off', 'a_b', 'axb', String.raw`a\b`, 'ab']) {
      await newProduct(f.token, { name, categoryId, brandId, price: 10 });
    }

    // No other product of this file has these characters in its name.
    const texts = [`${f.token} 50%`, `${f.token} a_b`, String.raw`${f.token} a\b`, '%', '_', '\\'];
    for (const q of texts) {
      const body = await facets(`q=${encodeURIComponent(q)}`);
      const expected = (await list(`q=${encodeURIComponent(q)}`)).total;

      expect(body.total, q).toBe(expected);
      expect(body.total, q).toBe(1);
    }
    const percentOnly = await facets(`q=${encodeURIComponent(`${f.token} 50%`)}`);
    expect(percentOnly.categories).toEqual([
      { id: f.categories.dress, name: `Dress-${f.token}`, count: 1 },
    ]);
  });
});

describe('GET /products/facets: the counts equal the list totals', () => {
  const combos = (f: Fixture): [string, Choice][] => [
    ['no filters', {}],
    ['a brand', { brandId: [f.brands.a] }],
    ['two brands', { brandId: [f.brands.a, f.brands.b] }],
    ['a category', { categoryId: [f.categories.shirt] }],
    ['a colour', { attributeValueId: [f.values.black] }],
    ['two colours', { attributeValueId: [f.values.black, f.values.white] }],
    ['colour and material', { attributeValueId: [f.values.black, f.values.cotton] }],
    [
      'two colours and a material',
      { attributeValueId: [f.values.black, f.values.white, f.values.silk] },
    ],
    ['a size', { size: ['M'] }],
    ['a size out of stock', { size: ['XS'] }],
    ['sizes', { size: ['L', 'S'] }],
    ['q', { q: `${f.token} red` }],
    ['q on shirts', { q: `${f.token} shirt` }],
    ['a price range', { minPrice: 60, maxPrice: 260 }],
    ['hasDiscount true', { hasDiscount: true }],
    ['hasDiscount false', { hasDiscount: false }],
    ['an unknown colour', { attributeValueId: [randomUUID()] }],
    ['an unused colour', { attributeValueId: [f.values.red] }],
    [
      'everything',
      {
        categoryId: [f.categories.shirt, f.categories.empty],
        brandId: [f.brands.b],
        size: ['L'],
        attributeValueId: [f.values.black, f.values.silk],
        minPrice: 10,
        maxPrice: 100,
        hasDiscount: true,
      },
    ],
  ];

  it('holds for every listed value, and every value with products is listed', async () => {
    const f = await arrange();
    const allValues = Object.values(f.values);
    const sizes = ['XS', 'S', 'M', 'L', 'XXL'];
    const categories = Object.values(f.categories);
    const brands = Object.values(f.brands);
    const withoutPrice = (choice: Choice): Choice => ({
      ...choice,
      minPrice: undefined,
      maxPrice: undefined,
    });
    const scoped = (choice: Choice): Choice => ({ q: f.token, ...choice });
    const totalOf = async (choice: Choice) => (await list(toQuery(scoped(choice)))).total;

    for (const [label, choice] of combos(f)) {
      const body = await facets(toQuery(scoped(choice)));

      expect(body.total, `${label}: total`).toBe(await totalOf(choice));
      expect(body.discounted, `${label}: discounted`).toBe(
        await totalOf({ ...choice, hasDiscount: true }),
      );
      const priced = (await list(toQuery(scoped(withoutPrice(choice))))).items.map(
        (item) => item.price,
      );
      expect(body.price, `${label}: price`).toEqual(
        priced.length === 0 ? null : { min: Math.min(...priced), max: Math.max(...priced) },
      );

      const listed = (rows: { id: string; count: number }[]) =>
        new Map(rows.map((row) => [row.id, row.count]));
      const check = async (
        kind: string,
        key: string,
        actual: Map<string, number>,
        chosen: string[] | undefined,
        replace: (id: string) => Choice,
      ) => {
        const expected = await totalOf(replace(key));
        const isListed = actual.has(key);
        expect(isListed, `${label}: ${kind} ${key} listed`).toBe(
          expected > 0 || (chosen ?? []).includes(key),
        );
        if (isListed) expect(actual.get(key), `${label}: ${kind} ${key}`).toBe(expected);
      };

      const categoryCounts = listed(body.categories);
      for (const id of categories) {
        await check('category', id, categoryCounts, choice.categoryId, (value) => ({
          ...choice,
          categoryId: [value],
        }));
      }
      const brandCounts = listed(body.brands);
      for (const id of brands) {
        await check('brand', id, brandCounts, choice.brandId, (value) => ({
          ...choice,
          brandId: [value],
        }));
      }
      const sizeCounts = new Map(body.sizes.map((row) => [row.size, row.count]));
      for (const size of sizes) {
        await check('size', size, sizeCounts, choice.size, (value) => ({
          ...choice,
          size: [value],
        }));
      }
      const valueCounts = listed(body.attributes.flatMap((attribute) => attribute.values));
      for (const id of allValues) {
        await check('value', id, valueCounts, choice.attributeValueId, (value) => {
          const attributeId = f.valueAttribute.get(value);
          const others = (choice.attributeValueId ?? []).filter(
            (other) => f.valueAttribute.get(other) !== attributeId,
          );
          return { ...choice, attributeValueId: [...others, value] };
        });
      }
    }
  });
});

describe('GET /products/facets: repeated and odd values', () => {
  it('counts a size once however it is written: a list, a repeated key, duplicates', async () => {
    const f = await arrange();
    const query = `q=${f.token}&size=M,S,M&size=M`;

    const body = await facets(query);

    expect(body.total).toBe(2);
    expect(body.total).toBe((await list(query)).total);
    expect(body.total).toBe((await list(`q=${f.token}&size=M,S`)).total);
    expect(body.sizes).toEqual([
      { size: 'L', count: 1 },
      { size: 'M', count: 2 },
      { size: 'S', count: 1 },
    ]);
  });

  it('takes one brand uuid in upper and lower case as one value', async () => {
    const f = await arrange();
    const query = `q=${f.token}&brandId=${f.brands.a.toLowerCase()},${f.brands.a.toUpperCase()}`;

    const body = await facets(query);

    expect(body.total).toBe(2);
    expect(body.total).toBe((await list(query)).total);
    expect(body.brands.filter(({ id }) => id === f.brands.a)).toEqual([
      { id: f.brands.a, name: `A-${f.token}`, count: 2 },
    ]);
    expect(body.brands).toHaveLength(3);
  });

  it('takes an attribute value uuid in upper case as the same value: OR in the list', async () => {
    const f = await arrange();
    const lower = `q=${f.token}&attributeValueId=${f.values.black},${f.values.white}`;
    const mixed = `q=${f.token}&attributeValueId=${f.values.black.toUpperCase()},${f.values.white}`;

    expect((await list(lower)).total).toBe(4);
    expect((await list(mixed)).total).toBe(4);
    expect(
      (await list(`q=${f.token}&attributeValueId=${f.values.black.toUpperCase()}`)).total,
    ).toBe(3);
  });

  it('keeps the other colours counts when the chosen colour is in upper case', async () => {
    const f = await arrange();
    const query = `q=${f.token}&attributeValueId=${f.values.black.toUpperCase()}`;

    const body = await facets(query);

    expect(body.total).toBe(3);
    expect(body.total).toBe((await list(query)).total);
    const [color, material] = body.attributes;
    expect(color?.values.map(({ id, count }) => [id, count])).toEqual([
      [f.values.black, 3],
      [f.values.white, 1],
    ]);
    expect(material?.values.map(({ id, count }) => [id, count])).toEqual([
      [f.values.cotton, 2],
      [f.values.silk, 1],
    ]);
  });

  it('a valid category beside an unknown one still matches (OR), and only real categories are listed', async () => {
    const f = await arrange();
    const query = `q=${f.token}&categoryId=${f.categories.dress},${randomUUID()}`;

    const body = await facets(query);

    expect(body.total).toBe(2);
    expect(body.total).toBe((await list(query)).total);
    expect(body.categories.map(({ id, count }) => [id, count])).toEqual([
      [f.categories.shirt, 3],
      [f.categories.dress, 2],
    ]);
  });

  it('matches a size case-sensitively: m finds nothing and is listed with 0', async () => {
    const f = await arrange();
    const query = `q=${f.token}&size=m`;

    const body = await facets(query);

    expect(body.total).toBe(0);
    expect((await list(query)).total).toBe(0);
    // The position of `m` among the others depends on the database collation, so it is not checked.
    expect(body.sizes).toHaveLength(4);
    expect(body.sizes).toEqual(
      expect.arrayContaining([
        { size: 'L', count: 1 },
        { size: 'M', count: 2 },
        { size: 'S', count: 1 },
        { size: 'm', count: 0 },
      ]),
    );
  });

  it('lists the unknown ones of 50 chosen sizes with 0 and keeps the real counts, beside a brand', async () => {
    const f = await arrange();
    const unknown = Array.from({ length: 47 }, (_, n) => `Z${n}`);
    const chosen = ['M', 'S', 'L', ...unknown];
    const query = `q=${f.token}&brandId=${f.brands.a}&size=${chosen.join(',')}`;

    const body = await facets(query);

    expect(chosen).toHaveLength(50);
    expect(body.total).toBe((await list(query)).total);
    const counts = new Map(body.sizes.map(({ size, count }) => [size, count]));
    expect(body.sizes).toHaveLength(50);
    for (const size of unknown) expect(counts.get(size), size).toBe(0);
    for (const size of ['M', 'S', 'L']) {
      const expected = (await list(`q=${f.token}&brandId=${f.brands.a}&size=${size}`)).total;
      expect(counts.get(size), size).toBe(expected);
    }
    expect(counts.get('M')).toBe(2);
    expect(counts.get('S')).toBe(1);
    expect(counts.get('L')).toBe(0);
  });
});

describe('GET /products/facets: 400 VALIDATION_FAILED', () => {
  const uuids = (n: number): string[] => Array.from({ length: n }, () => randomUUID());

  it('refuses limit, offset and sort: the counts are not paged or sorted', async () => {
    expectInvalid(await http().get('/products/facets?limit=10'));
    expectInvalid(await http().get('/products/facets?offset=0'));
    expectInvalid(await http().get('/products/facets?sort=new'));
  });

  it('refuses an unknown parameter', async () => {
    expectInvalid(await http().get('/products/facets?color=red'));
  });

  it('accepts 50 values and refuses 51', async () => {
    for (const key of ['categoryId', 'brandId', 'attributeValueId']) {
      const ok = await http().get(`/products/facets?${key}=${uuids(50).join(',')}`);
      expect(ok.status, key).toBe(200);

      expectInvalid(await http().get(`/products/facets?${key}=${uuids(51).join(',')}`));
    }
    const sizes = Array.from({ length: 51 }, (_, n) => `S${n}`);
    expectInvalid(await http().get(`/products/facets?size=${sizes.join(',')}`));
  });

  it('refuses an id that is not a uuid', async () => {
    expectInvalid(await http().get('/products/facets?categoryId=abc'));
    expectInvalid(await http().get('/products/facets?brandId=1'));
    expectInvalid(await http().get('/products/facets?attributeValueId=abc'));
  });

  it('refuses minPrice above maxPrice and a repeated q', async () => {
    expectInvalid(await http().get('/products/facets?minPrice=10&maxPrice=5'));
    expectInvalid(await http().get('/products/facets?q=a&q=b'));
  });

  it('refuses hasDiscount other than true or false', async () => {
    expectInvalid(await http().get('/products/facets?hasDiscount=yes'));
  });
});
