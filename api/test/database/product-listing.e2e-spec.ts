import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp } from '../support/test-app.js';

interface ListItem {
  id: string;
  name: string;
  price: number;
  discount: number;
  finalPrice: number;
  rating: number | null;
}

interface Page {
  items: ListItem[];
  total: number;
}

interface Scope {
  brandId: string;
  categoryId: string;
}

interface NewProduct {
  id?: string;
  name?: string;
  article?: string;
  description?: string;
  price?: number;
  discount?: number;
  rating?: number | null;
  createdAt?: Date;
  sizes?: [string, number][];
  valueIds?: string[];
  brandId?: string;
  categoryId?: string;
}

let testApp: TestApp;

beforeAll(async () => {
  testApp = await createTestApp();
});

afterAll(async () => {
  await testApp.close();
});

const http = () => request(testApp.app.getHttpServer());

async function newScope(): Promise<Scope & { query: string }> {
  const brand = await testApp.prisma.brand.create({ data: { name: `Brand ${randomUUID()}` } });
  const category = await testApp.prisma.category.create({
    data: { name: `Category ${randomUUID()}`, slug: randomUUID(), isActive: true },
  });
  return {
    brandId: brand.id,
    categoryId: category.id,
    query: `categoryId=${category.id}&brandId=${brand.id}`,
  };
}

async function newBrand(): Promise<string> {
  return (await testApp.prisma.brand.create({ data: { name: `Brand ${randomUUID()}` } })).id;
}

async function newCategory(): Promise<string> {
  return (
    await testApp.prisma.category.create({
      data: { name: `Category ${randomUUID()}`, slug: randomUUID(), isActive: true },
    })
  ).id;
}

let counter = 0;
// A fixed id, to make ties between products break in a known order. `series` moves on before each
// test, so tests of one file do not reuse an id (n stays below 1000).
let series = 0;
function fixedId(n: number): string {
  return `00000000-0000-4000-8000-${(series * 1000 + n).toString().padStart(12, '0')}`;
}

async function product(scope: Scope, fields: NewProduct = {}): Promise<string> {
  counter += 1;
  const created = await testApp.prisma.product.create({
    data: {
      ...(fields.id === undefined ? {} : { id: fields.id }),
      article: fields.article ?? `ART-${randomUUID()}`,
      name: fields.name ?? `Product ${counter}`,
      description: fields.description,
      price: fields.price ?? 100,
      discount: fields.discount ?? 0,
      rating: fields.rating,
      ...(fields.createdAt === undefined ? {} : { createdAt: fields.createdAt }),
      brandId: fields.brandId ?? scope.brandId,
      categoryId: fields.categoryId ?? scope.categoryId,
      variations: {
        create: (fields.sizes ?? []).map(([size, stock]) => ({ size, stock })),
      },
      attributeValues: {
        create: (fields.valueIds ?? []).map((attributeValueId) => ({ attributeValueId })),
      },
    },
  });
  return created.id;
}

async function get(query: string): Promise<Page> {
  const response = await http().get(`/products?${query}`);
  expect(response.status).toBe(200);
  return response.body as Page;
}

async function ids(query: string): Promise<string[]> {
  return (await get(`${query}&limit=100`)).items.map((item) => item.id);
}

async function idSet(query: string): Promise<string[]> {
  return (await ids(query)).sort();
}

function sorted(...list: string[]): string[] {
  return [...list].sort();
}

function expectInvalid(response: request.Response, field: string | undefined, code?: string): void {
  expect(response.status).toBe(400);
  const { error } = response.body as {
    error: { code: string; details: { field: string; code: string }[] };
  };
  expect(error.code).toBe('VALIDATION_FAILED');
  if (field !== undefined) {
    const detail = error.details.find((candidate) => candidate.field === field);
    expect(detail, `a detail for ${field}`).toBeDefined();
    if (code !== undefined) {
      expect(error.details.filter((d) => d.field === field).map((d) => d.code)).toContain(code);
    }
  }
}

const SECOND = 1000;
const BASE = Date.UTC(2026, 0, 1);
const at = (n: number): Date => new Date(BASE + n * SECOND);

describe('product list: category and brand', () => {
  it('narrows by categoryId, several categories widen (OR)', async () => {
    const scope = await newScope();
    const other = await newCategory();
    const third = await newCategory();
    const a = await product(scope);
    const b = await product(scope, { categoryId: other });
    const c = await product(scope, { categoryId: third });
    const brand = `brandId=${scope.brandId}`;

    expect(await idSet(`${brand}&categoryId=${scope.categoryId}`)).toEqual([a]);
    expect(await idSet(`${brand}&categoryId=${other}`)).toEqual([b]);
    expect(await idSet(`${brand}&categoryId=${scope.categoryId},${other}`)).toEqual(sorted(a, b));
    expect(await idSet(`${brand}&categoryId=${scope.categoryId}&categoryId=${third}`)).toEqual(
      sorted(a, c),
    );
  });

  it('narrows by brandId, several brands widen (OR)', async () => {
    const scope = await newScope();
    const other = await newBrand();
    const third = await newBrand();
    const a = await product(scope);
    const b = await product(scope, { brandId: other });
    const c = await product(scope, { brandId: third });
    const category = `categoryId=${scope.categoryId}`;

    expect(await idSet(`${category}&brandId=${scope.brandId}`)).toEqual([a]);
    expect(await idSet(`${category}&brandId=${other}`)).toEqual([b]);
    expect(await idSet(`${category}&brandId=${other},${third}`)).toEqual(sorted(b, c));
    expect(await idSet(`${category}&brandId=${scope.brandId},${other}&brandId=${third}`)).toEqual(
      sorted(a, b, c),
    );
  });

  it('counts a repeated id once', async () => {
    const scope = await newScope();
    const a = await product(scope);

    const page = await get(`${scope.query}&brandId=${scope.brandId},${scope.brandId}`);

    expect(page.items.map((item) => item.id)).toEqual([a]);
    expect(page.total).toBe(1);
  });

  it('matches nothing, without an error, for an unknown well-formed id', async () => {
    const scope = await newScope();
    const a = await product(scope);

    const unknownCategory = await get(`categoryId=${randomUUID()}`);
    const unknownBrand = await get(`brandId=${randomUUID()}`);

    expect(unknownCategory).toEqual({ items: [], total: 0 });
    expect(unknownBrand).toEqual({ items: [], total: 0 });
    expect(
      await idSet(`brandId=${scope.brandId}&categoryId=${scope.categoryId},${randomUUID()}`),
    ).toEqual([a]);
  });
});

describe('product list: q', () => {
  it('finds a substring of the name, ignoring case', async () => {
    const scope = await newScope();
    const red = await product(scope, { name: 'Red Dress' });
    const blue = await product(scope, { name: 'blue DRESS shirt' });
    await product(scope, { name: 'Jeans' });

    expect(await idSet(`${scope.query}&q=dress`)).toEqual(sorted(red, blue));
    expect(await idSet(`${scope.query}&q=DrEsS`)).toEqual(sorted(red, blue));
    expect(await idSet(`${scope.query}&q=${encodeURIComponent('e dress s')}`)).toEqual([blue]);
  });

  it('searches the name only, not the article or the description', async () => {
    const scope = await newScope();
    await product(scope, { name: 'Plain', article: 'NEEDLE-1', description: 'needle in text' });
    const named = await product(scope, { name: 'The Needle' });

    expect(await idSet(`${scope.query}&q=needle`)).toEqual([named]);
  });

  it('treats % as a plain character', async () => {
    const scope = await newScope();
    const percent = await product(scope, { name: 'Sale 50% off' });
    await product(scope, { name: 'Sale 500 off' });

    expect(await idSet(`${scope.query}&q=${encodeURIComponent('50%')}`)).toEqual([percent]);
    expect(await idSet(`${scope.query}&q=${encodeURIComponent('%')}`)).toEqual([percent]);
  });

  it('treats _ as a plain character', async () => {
    const scope = await newScope();
    const underscore = await product(scope, { name: 'Item a_b' });
    await product(scope, { name: 'Item axb' });

    expect(await idSet(`${scope.query}&q=a_b`)).toEqual([underscore]);
    expect(await idSet(`${scope.query}&q=_`)).toEqual([underscore]);
  });

  it('treats a backslash as a plain character', async () => {
    const scope = await newScope();
    const slash = await product(scope, { name: String.raw`Item a\b` });
    await product(scope, { name: 'Item ab' });

    expect(await idSet(`${scope.query}&q=${encodeURIComponent('\\')}`)).toEqual([slash]);
    expect(await idSet(`${scope.query}&q=${encodeURIComponent(String.raw`a\b`)}`)).toEqual([slash]);
    expect(await ids(`${scope.query}&q=${encodeURIComponent(String.raw`a\\b`)}`)).toEqual([]);
  });

  it('accepts 100 characters', async () => {
    const response = await http().get(`/products?q=${'a'.repeat(100)}`);

    expect(response.status).toBe(200);
  });
});

describe('product list: price and discount', () => {
  it('filters by minPrice and maxPrice inclusively on the price before the discount', async () => {
    const scope = await newScope();
    const cheap = await product(scope, { price: 10 });
    const middle = await product(scope, { price: 20.5 });
    const dear = await product(scope, { price: 30 });

    expect(await idSet(`${scope.query}&minPrice=20.5`)).toEqual(sorted(middle, dear));
    expect(await idSet(`${scope.query}&maxPrice=20.5`)).toEqual(sorted(cheap, middle));
    expect(await idSet(`${scope.query}&minPrice=15&maxPrice=25`)).toEqual([middle]);
    expect(await idSet(`${scope.query}&minPrice=20.5&maxPrice=20.5`)).toEqual([middle]);
    expect(await idSet(`${scope.query}&minPrice=0`)).toEqual(sorted(cheap, middle, dear));
    expect(await ids(`${scope.query}&minPrice=31`)).toEqual([]);
  });

  it('uses the price, not the final price', async () => {
    const scope = await newScope();
    const discounted = await product(scope, { price: 100, discount: 90 });

    expect(await ids(`${scope.query}&maxPrice=50`)).toEqual([]);
    expect(await ids(`${scope.query}&minPrice=100`)).toEqual([discounted]);
    expect((await get(`${scope.query}&minPrice=100`)).items[0]?.finalPrice).toBe(10);
  });

  it('hasDiscount=true keeps discount > 0, false keeps discount = 0', async () => {
    const scope = await newScope();
    const none = await product(scope, { discount: 0 });
    const one = await product(scope, { discount: 1 });
    const half = await product(scope, { discount: 50 });

    expect(await idSet(`${scope.query}&hasDiscount=true`)).toEqual(sorted(one, half));
    expect(await idSet(`${scope.query}&hasDiscount=false`)).toEqual([none]);
    expect(await idSet(scope.query)).toEqual(sorted(none, one, half));
  });
});

describe('product list: size', () => {
  it('matches a size in stock and skips a size out of stock', async () => {
    const scope = await newScope();
    const inStock = await product(scope, { sizes: [['M', 5]] });
    const soldOut = await product(scope, {
      sizes: [
        ['M', 0],
        ['L', 3],
      ],
    });
    const none = await product(scope);

    expect(await idSet(`${scope.query}&size=M`)).toEqual([inStock]);
    expect(await idSet(`${scope.query}&size=L`)).toEqual([soldOut]);
    expect(await ids(`${scope.query}&size=XXL`)).toEqual([]);
    expect(await idSet(scope.query)).toEqual(sorted(inStock, soldOut, none));
  });

  it('several sizes widen (OR)', async () => {
    const scope = await newScope();
    const m = await product(scope, { sizes: [['M', 1]] });
    const l = await product(scope, { sizes: [['L', 1]] });
    await product(scope, { sizes: [['S', 1]] });

    expect(await idSet(`${scope.query}&size=M,L`)).toEqual(sorted(m, l));
    expect(await idSet(`${scope.query}&size=M&size=L`)).toEqual(sorted(m, l));
  });

  it('matches exactly, case included', async () => {
    const scope = await newScope();
    const upper = await product(scope, { sizes: [['M', 1]] });
    const lower = await product(scope, { sizes: [['m', 1]] });
    await product(scope, { sizes: [['MM', 1]] });

    expect(await idSet(`${scope.query}&size=M`)).toEqual([upper]);
    expect(await idSet(`${scope.query}&size=m`)).toEqual([lower]);
  });

  it('keeps a product that has the size in stock among several sizes', async () => {
    const scope = await newScope();
    const mixed = await product(scope, {
      sizes: [
        ['S', 0],
        ['M', 2],
      ],
    });

    expect(await ids(`${scope.query}&size=S`)).toEqual([]);
    expect(await ids(`${scope.query}&size=S,M`)).toEqual([mixed]);
  });
});

describe('product list: attribute values', () => {
  async function arrange() {
    const scope = await newScope();
    const color = await testApp.prisma.attribute.create({
      data: { name: `Color ${randomUUID()}` },
    });
    const occasion = await testApp.prisma.attribute.create({
      data: { name: `Occasion ${randomUUID()}` },
    });
    const value = async (attributeId: string, text: string) =>
      (await testApp.prisma.attributeValue.create({ data: { attributeId, value: text } })).id;
    const black = await value(color.id, 'black');
    const white = await value(color.id, 'white');
    const evening = await value(occasion.id, 'evening');
    const daily = await value(occasion.id, 'daily');
    const blackEvening = await product(scope, { valueIds: [black, evening] });
    const whiteDaily = await product(scope, { valueIds: [white, daily] });
    const blackDaily = await product(scope, { valueIds: [black, daily] });
    const bare = await product(scope);
    return {
      scope,
      black,
      white,
      evening,
      daily,
      blackEvening,
      whiteDaily,
      blackDaily,
      bare,
    };
  }

  it('one value narrows the list', async () => {
    const a = await arrange();

    expect(await idSet(`${a.scope.query}&attributeValueId=${a.black}`)).toEqual(
      sorted(a.blackEvening, a.blackDaily),
    );
    expect(await idSet(`${a.scope.query}&attributeValueId=${a.evening}`)).toEqual([a.blackEvening]);
  });

  it('two values of one attribute widen (OR)', async () => {
    const a = await arrange();

    expect(await idSet(`${a.scope.query}&attributeValueId=${a.black},${a.white}`)).toEqual(
      sorted(a.blackEvening, a.whiteDaily, a.blackDaily),
    );
    expect(
      await idSet(`${a.scope.query}&attributeValueId=${a.black}&attributeValueId=${a.white}`),
    ).toEqual(sorted(a.blackEvening, a.whiteDaily, a.blackDaily));
  });

  it('values of two attributes narrow (AND)', async () => {
    const a = await arrange();

    expect(await idSet(`${a.scope.query}&attributeValueId=${a.black},${a.evening}`)).toEqual([
      a.blackEvening,
    ]);
    expect(await idSet(`${a.scope.query}&attributeValueId=${a.black},${a.daily}`)).toEqual([
      a.blackDaily,
    ]);
  });

  it('combines OR inside an attribute with AND across attributes', async () => {
    const a = await arrange();

    expect(
      await idSet(`${a.scope.query}&attributeValueId=${a.black},${a.white},${a.daily}`),
    ).toEqual(sorted(a.whiteDaily, a.blackDaily));
  });

  it('counts a repeated value once', async () => {
    const a = await arrange();

    expect(await idSet(`${a.scope.query}&attributeValueId=${a.evening},${a.evening}`)).toEqual([
      a.blackEvening,
    ]);
  });

  it('an unknown well-formed value id empties the list, also next to a known one', async () => {
    const a = await arrange();
    const unknown = randomUUID();

    expect(await get(`${a.scope.query}&attributeValueId=${unknown}`)).toEqual({
      items: [],
      total: 0,
    });
    expect(await ids(`${a.scope.query}&attributeValueId=${a.black},${unknown}`)).toEqual([]);
    expect(await ids(`${a.scope.query}&attributeValueId=${unknown},${randomUUID()}`)).toEqual([]);
  });
});

describe('product list: combining and paging', () => {
  it('filters combine with AND', async () => {
    const scope = await newScope();
    const other = await newCategory();
    const match = await product(scope, {
      name: 'Blue dress',
      price: 50,
      discount: 10,
      sizes: [['M', 1]],
    });
    await product(scope, { name: 'Red dress', price: 50, discount: 10, sizes: [['M', 1]] });
    await product(scope, { name: 'Blue dress', price: 500, discount: 10, sizes: [['M', 1]] });
    await product(scope, { name: 'Blue dress', price: 50, discount: 0, sizes: [['M', 1]] });
    await product(scope, { name: 'Blue dress', price: 50, discount: 10, sizes: [['M', 0]] });
    await product(scope, {
      name: 'Blue dress',
      price: 50,
      discount: 10,
      sizes: [['M', 1]],
      categoryId: other,
    });

    const query = `${scope.query}&q=blue&maxPrice=100&hasDiscount=true&size=M`;

    expect(await ids(query)).toEqual([match]);
  });

  it('total is the filtered count and limit and offset page through it', async () => {
    const scope = await newScope();
    const withDiscount: string[] = [];
    for (let n = 0; n < 5; n += 1) {
      const id = await product(scope, { discount: n < 3 ? 10 : 0, createdAt: at(n) });
      if (n < 3) withDiscount.push(id);
    }
    const expected = [...withDiscount].reverse();
    const query = `${scope.query}&hasDiscount=true`;

    const first = await get(`${query}&limit=2&offset=0`);
    const second = await get(`${query}&limit=2&offset=2`);
    const beyond = await get(`${query}&limit=2&offset=4`);

    expect(first.total).toBe(3);
    expect(first.items.map((item) => item.id)).toEqual(expected.slice(0, 2));
    expect(second.total).toBe(3);
    expect(second.items.map((item) => item.id)).toEqual(expected.slice(2));
    expect(beyond).toEqual({ items: [], total: 3 });
  });
});

describe('product list: sorts', () => {
  beforeEach(() => {
    series += 1;
  });

  it('new orders by createdAt desc, then id desc', async () => {
    const scope = await newScope();
    const oldest = await product(scope, { id: fixedId(900), createdAt: at(1) });
    const tieLow = await product(scope, { id: fixedId(100), createdAt: at(5) });
    const tieHigh = await product(scope, { id: fixedId(200), createdAt: at(5) });
    const newest = await product(scope, { id: fixedId(50), createdAt: at(9) });

    expect(await ids(`${scope.query}&sort=new`)).toEqual([newest, tieHigh, tieLow, oldest]);
  });

  it('the default sort is new', async () => {
    const scope = await newScope();
    await product(scope, { createdAt: at(1) });
    await product(scope, { createdAt: at(3) });
    await product(scope, { createdAt: at(2) });

    const withSort = await ids(`${scope.query}&sort=new`);

    expect(await ids(scope.query)).toEqual(withSort);
    expect(withSort).toHaveLength(3);
  });

  it('price_asc and price_desc order by the price before the discount, ties by id desc', async () => {
    const scope = await newScope();
    const cheapDiscounted = await product(scope, { id: fixedId(1), price: 100, discount: 90 });
    const mid = await product(scope, { id: fixedId(2), price: 60 });
    const tieA = await product(scope, { id: fixedId(3), price: 20 });
    const tieB = await product(scope, { id: fixedId(4), price: 20 });

    expect(await ids(`${scope.query}&sort=price_asc`)).toEqual([tieB, tieA, mid, cheapDiscounted]);
    expect(await ids(`${scope.query}&sort=price_desc`)).toEqual([cheapDiscounted, mid, tieB, tieA]);
  });

  it('discount orders by the percent desc, ties by id desc', async () => {
    const scope = await newScope();
    const none = await product(scope, { id: fixedId(1), discount: 0 });
    const small = await product(scope, { id: fixedId(2), discount: 10 });
    const bigA = await product(scope, { id: fixedId(3), discount: 50 });
    const bigB = await product(scope, { id: fixedId(4), discount: 50 });

    expect(await ids(`${scope.query}&sort=discount`)).toEqual([bigB, bigA, small, none]);
  });

  it('rating orders desc with no rating last, ties by id desc', async () => {
    const scope = await newScope();
    const unratedLow = await product(scope, { id: fixedId(1), rating: null });
    const low = await product(scope, { id: fixedId(2), rating: 3 });
    const topA = await product(scope, { id: fixedId(3), rating: 4.5 });
    const topB = await product(scope, { id: fixedId(4), rating: 4.5 });
    const unratedHigh = await product(scope, { id: fixedId(5), rating: null });

    expect(await ids(`${scope.query}&sort=rating`)).toEqual([
      topB,
      topA,
      low,
      unratedHigh,
      unratedLow,
    ]);
  });

  it('the same request returns the same ids every time', async () => {
    const scope = await newScope();
    for (let n = 0; n < 6; n += 1) {
      await product(scope, { price: 10, discount: 5, rating: 4, createdAt: at(0) });
    }

    for (const sort of ['new', 'price_asc', 'price_desc', 'discount', 'rating']) {
      const first = await ids(`${scope.query}&sort=${sort}`);
      const second = await ids(`${scope.query}&sort=${sort}`);

      expect(second).toEqual(first);
      expect(first).toEqual([...first].sort().reverse());
    }
  });

  it('pages of a sort with ties neither repeat nor skip a product', async () => {
    const scope = await newScope();
    const all: string[] = [];
    for (let n = 0; n < 7; n += 1) {
      all.push(await product(scope, { price: n % 2 === 0 ? 10 : 20 }));
    }

    const full = await ids(`${scope.query}&sort=price_asc`);
    const paged: string[] = [];
    for (let offset = 0; offset < 7; offset += 3) {
      const page = await get(`${scope.query}&sort=price_asc&limit=3&offset=${offset}`);
      paged.push(...page.items.map((item) => item.id));
    }

    expect(paged).toEqual(full);
    expect(sorted(...paged)).toEqual(sorted(...all));
  });
});

describe('product list: 400 VALIDATION_FAILED', () => {
  const uuids = (n: number): string[] => Array.from({ length: n }, () => randomUUID());

  it('accepts 50 values and refuses 51, as a comma list or repeated keys', async () => {
    for (const key of ['categoryId', 'brandId', 'attributeValueId']) {
      const ok = await http().get(`/products?${key}=${uuids(50).join(',')}`);
      expect(ok.status, key).toBe(200);

      expectInvalid(
        await http().get(`/products?${key}=${uuids(51).join(',')}`),
        key,
        'ARRAY_MAX_SIZE',
      );
      expectInvalid(
        await http().get(
          `/products?${uuids(51)
            .map((id) => `${key}=${id}`)
            .join('&')}`,
        ),
        key,
        'ARRAY_MAX_SIZE',
      );
    }
    const sizes = Array.from({ length: 51 }, (_, n) => `S${n}`);
    expectInvalid(await http().get(`/products?size=${sizes.join(',')}`), 'size', 'ARRAY_MAX_SIZE');
  });

  it('counts values after splitting a mix of comma lists and repeated keys', async () => {
    const response = await http().get(
      `/products?brandId=${uuids(26).join(',')}&brandId=${uuids(25).join(',')}`,
    );

    expectInvalid(response, 'brandId', 'ARRAY_MAX_SIZE');
  });

  it('refuses an id that is not a uuid', async () => {
    expectInvalid(await http().get('/products?categoryId=abc'), 'categoryId', 'IS_UUID');
    expectInvalid(await http().get('/products?brandId=1'), 'brandId', 'IS_UUID');
    expectInvalid(
      await http().get('/products?attributeValueId=abc'),
      'attributeValueId',
      'IS_UUID',
    );
    expectInvalid(await http().get(`/products?brandId=${randomUUID()},abc`), 'brandId', 'IS_UUID');
  });

  it('refuses an empty item of a list', async () => {
    const id = randomUUID();

    expectInvalid(await http().get('/products?brandId='), 'brandId');
    expectInvalid(await http().get(`/products?brandId=${id},,${id}`), 'brandId');
    expectInvalid(await http().get(`/products?categoryId=${id},`), 'categoryId');
    expectInvalid(
      await http().get(`/products?attributeValueId=&attributeValueId=${id}`),
      'attributeValueId',
    );
    expectInvalid(await http().get('/products?size='), 'size');
    expectInvalid(await http().get('/products?size=M,,L'), 'size');
  });

  it('refuses an empty scalar parameter', async () => {
    expectInvalid(await http().get('/products?q='), 'q');
    expectInvalid(await http().get('/products?minPrice='), 'minPrice');
    expectInvalid(await http().get('/products?maxPrice='), 'maxPrice');
    expectInvalid(await http().get('/products?sort='), 'sort');
    expectInvalid(await http().get('/products?hasDiscount='), 'hasDiscount');
  });

  it('refuses an unknown sort', async () => {
    expectInvalid(await http().get('/products?sort=cheap'), 'sort', 'IS_IN');
    expectInvalid(await http().get('/products?sort=PRICE_ASC'), 'sort', 'IS_IN');
  });

  it('refuses a q with outer spaces or over 100 characters', async () => {
    expectInvalid(await http().get('/products?q=%20dress'), 'q', 'MATCHES');
    expectInvalid(await http().get('/products?q=dress%20'), 'q', 'MATCHES');
    expectInvalid(await http().get(`/products?q=${'a'.repeat(101)}`), 'q', 'MAX_LENGTH');
  });

  it('refuses minPrice above maxPrice on maxPrice', async () => {
    expectInvalid(await http().get('/products?minPrice=10&maxPrice=5'), 'maxPrice', 'IS_NOT_BELOW');
  });

  it('refuses a price that is not plain digits, negative, too large or has 3 decimals', async () => {
    expectInvalid(await http().get('/products?minPrice=1.234'), 'minPrice', 'MAX_DECIMAL_PLACES');
    expectInvalid(await http().get('/products?maxPrice=1.234'), 'maxPrice', 'MAX_DECIMAL_PLACES');
    expectInvalid(await http().get('/products?minPrice=-1'), 'minPrice');
    expectInvalid(await http().get('/products?maxPrice=1e2'), 'maxPrice');
    expectInvalid(await http().get('/products?minPrice=0x10'), 'minPrice');
    expectInvalid(await http().get('/products?minPrice=abc'), 'minPrice');
    expectInvalid(await http().get('/products?maxPrice=100000000'), 'maxPrice', 'MAX');
  });

  it('refuses bracket and object syntax for a list', async () => {
    const id = randomUUID();

    expectInvalid(await http().get(`/products?brandId[]=${id}`), undefined);
    expectInvalid(await http().get(`/products?brandId[0]=${id}`), undefined);
    expectInvalid(await http().get(`/products?brandId[a]=${id}`), undefined);
  });

  it('accepts a size of 20 characters and refuses 21', async () => {
    expect((await http().get(`/products?size=${'a'.repeat(20)}`)).status).toBe(200);
    expectInvalid(await http().get(`/products?size=${'a'.repeat(21)}`), 'size', 'MAX_LENGTH');
  });

  it('refuses a repeated q or sort', async () => {
    expectInvalid(await http().get('/products?q=a&q=b'), 'q');
    expectInvalid(await http().get('/products?sort=new&sort=new'), 'sort');
    expectInvalid(await http().get('/products?sort=new&sort=price_asc'), 'sort');
  });

  it('does not match a double space in q with a single space in a name', async () => {
    const scope = await newScope();
    const single = await product(scope, { name: 'Red dress' });
    const double = await product(scope, { name: 'Red  dress double' });

    expect(await ids(`${scope.query}&q=${encodeURIComponent('Red  dress')}`)).toEqual([double]);
    expect(await ids(`${scope.query}&q=${encodeURIComponent('Red dress')}`)).toEqual([single]);
  });

  it('refuses an unknown parameter', async () => {
    expectInvalid(await http().get('/products?color=red'), undefined);
  });

  it('refuses hasDiscount other than true or false', async () => {
    expectInvalid(await http().get('/products?hasDiscount=yes'), 'hasDiscount', 'IS_BOOLEAN');
    expectInvalid(await http().get('/products?hasDiscount=1'), 'hasDiscount', 'IS_BOOLEAN');
  });
});
