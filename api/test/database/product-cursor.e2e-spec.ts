import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp } from '../support/test-app.js';

interface ListItem {
  id: string;
  price: number;
  discount: number;
  rating: number | null;
}

interface Page {
  items: ListItem[];
  total: number | null;
  nextCursor: string | null;
}

interface Scope {
  brandId: string;
  categoryId: string;
  query: string;
}

interface NewProduct {
  price?: number;
  discount?: number;
  rating?: number | null;
  createdAt?: Date;
}

type Sort = 'new' | 'price_asc' | 'price_desc' | 'discount' | 'rating';
const SORTS: Sort[] = ['new', 'price_asc', 'price_desc', 'discount', 'rating'];

let testApp: TestApp;

beforeAll(async () => {
  testApp = await createTestApp();
});

afterAll(async () => {
  await testApp.close();
});

const http = () => request(testApp.app.getHttpServer());

async function newScope(): Promise<Scope> {
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

async function product(scope: Scope, fields: NewProduct = {}): Promise<string> {
  const created = await testApp.prisma.product.create({
    data: {
      article: `ART-${randomUUID()}`,
      name: 'Product',
      price: fields.price ?? 100,
      discount: fields.discount ?? 0,
      rating: fields.rating,
      ...(fields.createdAt === undefined ? {} : { createdAt: fields.createdAt }),
      brandId: scope.brandId,
      categoryId: scope.categoryId,
    },
  });
  return created.id;
}

async function get(query: string): Promise<Page> {
  const response = await http().get(`/products?${query}`);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body as Page;
}

async function fullOrder(scope: Scope, sort: Sort): Promise<string[]> {
  return (await get(`${scope.query}&sort=${sort}&limit=100`)).items.map((item) => item.id);
}

const BASE = Date.UTC(2026, 0, 1);
const at = (n: number): Date => new Date(BASE + n * 1000);

// Nine products in groups that tie on the sort's key, so a small limit splits a tie. The rating
// has six rated products in pairs and three unrated ones.
function tiedFields(sort: Sort, index: number): NewProduct {
  const group = Math.floor(index / 3);
  switch (sort) {
    case 'new':
      return { createdAt: at(group) };
    case 'price_asc':
    case 'price_desc':
      return { price: [99, 100, 1000.5][group] };
    case 'discount':
      return { discount: [10, 50, 90][group] };
    case 'rating':
      return { rating: index < 6 ? [4.5, 4, 3.5][Math.floor(index / 2)] : null };
  }
}

// A product that sorts after every product of `tiedFields`, and one that sorts before them all.
const LAST: Record<Sort, NewProduct> = {
  new: { createdAt: at(-50) },
  price_asc: { price: 5000 },
  price_desc: { price: 1 },
  discount: { discount: 0 },
  rating: { rating: null },
};
const FIRST: Record<Sort, NewProduct> = {
  new: { createdAt: at(500) },
  price_asc: { price: 1 },
  price_desc: { price: 5000 },
  discount: { discount: 100 },
  rating: { rating: 5 },
};

describe('product list by cursor: paging through changes', () => {
  const cases = SORTS.flatMap((sort) => [2, 3, 4].map((limit) => [sort, limit] as const));

  it.each(cases)(
    'sort %s, limit %i: no product repeats or goes missing while others are added and deleted',
    async (sort, limit) => {
      const scope = await newScope();
      const original: string[] = [];
      for (let index = 0; index < 9; index += 1) {
        original.push(await product(scope, tiedFields(sort, index)));
      }
      const full = await fullOrder(scope, sort);
      expect([...full].sort()).toEqual([...original].sort());

      const seen: string[] = [];
      let ahead: string | undefined;
      let behind: string | undefined;
      const deleted: string[] = [];
      let cursor: string | null = null;
      for (let batch = 0; batch < 20; batch += 1) {
        const page: Page = await get(
          `${scope.query}&sort=${sort}&limit=${limit}${cursor === null ? '' : `&cursor=${cursor}`}`,
        );
        expect(page.items.length).toBeLessThanOrEqual(limit);
        expect(page.total, 'total of a batch after the first').toBe(batch === 0 ? 9 : null);
        seen.push(...page.items.map((item) => item.id));
        cursor = page.nextCursor;
        if (cursor === null) break;
        expect(page.items, 'a batch with a next one is full').toHaveLength(limit);

        if (batch === 0) {
          ahead = await product(scope, LAST[sort]);
          behind = await product(scope, FIRST[sort]);
          // The row right after the cursor and the very last one.
          for (const id of [full[limit], full[8]]) {
            await testApp.prisma.product.delete({ where: { id } });
            deleted.push(id!);
          }
        }
        if (batch === 1) {
          // The row of the cursor itself.
          const last = page.items.at(-1)!.id;
          await testApp.prisma.product.delete({ where: { id: last } });
        }
      }

      expect(cursor, 'ended').toBeNull();
      expect(new Set(seen).size, 'no repeat').toBe(seen.length);
      expect(seen, 'a product added behind the cursor is not met').not.toContain(behind);
      for (const id of deleted) expect(seen, 'a deleted product is not met').not.toContain(id);
      expect(
        seen.filter((id) => id === ahead),
        'a product added ahead is met once',
      ).toEqual([ahead]);
      expect(
        seen.filter((id) => id !== ahead),
        'the rest come in the order of the full list',
      ).toEqual(full.filter((id) => !deleted.includes(id)));
    },
  );

  it.each(SORTS)(
    'sort %s: the last product follows the cursor of the one before, with no next cursor',
    async (sort) => {
      const scope = await newScope();
      for (let index = 0; index < 4; index += 1) await product(scope, tiedFields(sort, index * 2));
      const full = await fullOrder(scope, sort);
      const beforeLast = await get(`${scope.query}&sort=${sort}&limit=${full.length - 1}`);
      expect(beforeLast.nextCursor).not.toBeNull();
      // The cursor of the batch ends at the product before the last: one row is left, then none.
      const rest = await get(`${scope.query}&sort=${sort}&limit=1&cursor=${beforeLast.nextCursor}`);

      expect(rest.items.map((item) => item.id)).toEqual([full.at(-1)]);
      expect(rest.nextCursor).toBeNull();
      expect(rest.total).toBeNull();
    },
  );

  it('pages the new sort over products created with the default createdAt', async () => {
    const scope = await newScope();
    const created: string[] = [];
    for (let index = 0; index < 7; index += 1) created.push(await product(scope));

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: Page = await get(
        `${scope.query}&limit=2${cursor === null ? '' : `&cursor=${cursor}`}`,
      );
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor !== null);

    expect([...seen].sort()).toEqual([...created].sort());
    expect(seen).toEqual(await fullOrder(scope, 'new'));
  });
});

describe('product list by cursor: ties', () => {
  it.each(SORTS)(
    'sort %s: products that are equal in every key are paged by id desc',
    async (sort) => {
      const scope = await newScope();
      const fields: NewProduct = {
        createdAt: at(1),
        price: 50,
        discount: 20,
        rating: sort === 'rating' ? 4 : null,
      };
      const all: string[] = [];
      for (let index = 0; index < 7; index += 1) all.push(await product(scope, fields));

      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const page: Page = await get(
          `${scope.query}&sort=${sort}&limit=3${cursor === null ? '' : `&cursor=${cursor}`}`,
        );
        seen.push(...page.items.map((item) => item.id));
        cursor = page.nextCursor;
      } while (cursor !== null);

      expect(seen).toEqual([...all].sort().reverse());
    },
  );
});

describe('product list by cursor: null ratings', () => {
  async function rated(): Promise<{ scope: Scope; ratedIds: string[]; unratedIds: string[] }> {
    const scope = await newScope();
    const ratedIds: string[] = [];
    const unratedIds: string[] = [];
    for (const rating of [4.5, 4.5, 3, 3]) ratedIds.push(await product(scope, { rating }));
    for (let index = 0; index < 3; index += 1) unratedIds.push(await product(scope));
    return { scope, ratedIds, unratedIds };
  }

  it('puts the unrated last and pages through the boundary between rated and unrated', async () => {
    const { scope, ratedIds, unratedIds } = await rated();
    const first = await get(`${scope.query}&sort=rating&limit=4`);

    expect(first.items.map((item) => item.id).sort()).toEqual([...ratedIds].sort());
    expect(first.items.every((item) => item.rating !== null)).toBe(true);
    const second = await get(`${scope.query}&sort=rating&limit=4&cursor=${first.nextCursor}`);

    expect(second.items.map((item) => item.id).sort()).toEqual([...unratedIds].sort());
    expect(second.items.every((item) => item.rating === null)).toBe(true);
    expect(second.nextCursor).toBeNull();
  });

  it('fills a batch with the last rated and the first unrated', async () => {
    const { scope, ratedIds, unratedIds } = await rated();
    const first = await get(`${scope.query}&sort=rating&limit=3`);
    const second = await get(`${scope.query}&sort=rating&limit=3&cursor=${first.nextCursor}`);
    const third = await get(`${scope.query}&sort=rating&limit=3&cursor=${second.nextCursor}`);

    expect(second.items.map((item) => item.rating)).toEqual([3, null, null]);
    expect(third.items).toHaveLength(1);
    expect(third.nextCursor).toBeNull();
    const seen = [...first.items, ...second.items, ...third.items].map((item) => item.id);
    expect(seen.sort()).toEqual([...ratedIds, ...unratedIds].sort());
  });

  it('continues from a cursor whose key is null, by id desc among the unrated', async () => {
    const { scope, unratedIds } = await rated();
    const first = await get(`${scope.query}&sort=rating&limit=5`);
    expect(first.items.at(-1)?.rating).toBeNull();
    const second = await get(`${scope.query}&sort=rating&limit=1&cursor=${first.nextCursor}`);

    const unrated = [...unratedIds].sort().reverse();
    expect(first.items.slice(4).map((item) => item.id)).toEqual([unrated[0]]);
    expect(second.items.map((item) => item.id)).toEqual([unrated[1]]);
    expect(second.total).toBeNull();
  });

  it('pages through a list with no rated product at all', async () => {
    const scope = await newScope();
    const all = [await product(scope), await product(scope), await product(scope)];
    const first = await get(`${scope.query}&sort=rating&limit=2`);
    const second = await get(`${scope.query}&sort=rating&limit=2&cursor=${first.nextCursor}`);

    expect([...first.items, ...second.items].map((item) => item.id)).toEqual(
      [...all].sort().reverse(),
    );
    expect(second.nextCursor).toBeNull();
  });
});

describe('product list by cursor: total and the last batch', () => {
  it('counts without a cursor and answers null with one', async () => {
    const scope = await newScope();
    for (let index = 0; index < 5; index += 1) await product(scope, { createdAt: at(index) });

    const first = await get(`${scope.query}&limit=2`);
    const second = await get(`${scope.query}&limit=2&cursor=${first.nextCursor}`);

    expect(first.total).toBe(5);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(second.total).toBeNull();
    expect(second.items).toHaveLength(2);
  });

  it('gives a null next cursor on the last batch, also when the count is a multiple of limit', async () => {
    const scope = await newScope();
    for (let index = 0; index < 4; index += 1) await product(scope, { createdAt: at(index) });

    const first = await get(`${scope.query}&limit=2`);
    const second = await get(`${scope.query}&limit=2&cursor=${first.nextCursor}`);
    const all = await get(`${scope.query}&limit=4`);
    const beyond = await get(`${scope.query}&limit=5`);

    expect(first.nextCursor).not.toBeNull();
    expect(second.items).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    expect(all.nextCursor).toBeNull();
    expect(beyond.nextCursor).toBeNull();
  });

  it('keeps the filters of the first batch in the next ones', async () => {
    const scope = await newScope();
    const withDiscount: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const id = await product(scope, { discount: index < 3 ? 10 : 0, createdAt: at(index) });
      if (index < 3) withDiscount.push(id);
    }
    const query = `${scope.query}&hasDiscount=true&limit=2`;

    const first = await get(query);
    const second = await get(`${query}&cursor=${first.nextCursor}`);

    expect([...first.items, ...second.items].map((item) => item.id)).toEqual(
      [...withDiscount].reverse(),
    );
    expect(second.nextCursor).toBeNull();
  });

  it('answers a cursor of a product that is gone from the list', async () => {
    const scope = await newScope();
    const ids: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      ids.push(await product(scope, { createdAt: at(index) }));
    }
    const first = await get(`${scope.query}&limit=2`);
    for (const item of first.items) await testApp.prisma.product.delete({ where: { id: item.id } });

    const second = await get(`${scope.query}&limit=2&cursor=${first.nextCursor}`);

    expect(second.items.map((item) => item.id)).toEqual([ids[1], ids[0]]);
  });
});

describe('product list by cursor: keys compare as numbers', () => {
  const prices = [99, 100, 1000.5, 9.99, 10];

  it.each(['price_asc', 'price_desc'] as const)(
    '%s pages 99, 100 and 1000.5 by value, not as text',
    async (sort) => {
      const scope = await newScope();
      for (const price of prices) await product(scope, { price });

      const seen: number[] = [];
      let cursor: string | null = null;
      do {
        const page: Page = await get(
          `${scope.query}&sort=${sort}&limit=2${cursor === null ? '' : `&cursor=${cursor}`}`,
        );
        seen.push(...page.items.map((item) => item.price));
        cursor = page.nextCursor;
      } while (cursor !== null);

      const expected = [...prices].sort((a, b) => a - b);
      expect(seen).toEqual(sort === 'price_asc' ? expected : expected.reverse());
    },
  );

  it('pages the discount of 9 before 10 and 100 by value', async () => {
    const scope = await newScope();
    for (const discount of [9, 10, 100, 55]) await product(scope, { discount });

    const first = await get(`${scope.query}&sort=discount&limit=2`);
    const second = await get(`${scope.query}&sort=discount&limit=2&cursor=${first.nextCursor}`);

    expect([...first.items, ...second.items].map((item) => item.discount)).toEqual([
      100, 55, 10, 9,
    ]);
  });
});

describe('product list by cursor: offset', () => {
  it('still pages by offset with the total, and gives a next cursor that continues the list', async () => {
    const scope = await newScope();
    const created: string[] = [];
    for (let index = 0; index < 6; index += 1) {
      created.push(await product(scope, { createdAt: at(index) }));
    }
    const order = [...created].reverse();

    const byOffset = await get(`${scope.query}&limit=2&offset=2`);
    const next = await get(`${scope.query}&limit=2&cursor=${byOffset.nextCursor}`);

    expect(byOffset.total).toBe(6);
    expect(byOffset.items.map((item) => item.id)).toEqual(order.slice(2, 4));
    expect(next.items.map((item) => item.id)).toEqual(order.slice(4, 6));
    expect(next.total).toBeNull();
  });

  it('gives no next cursor on the last offset batch', async () => {
    const scope = await newScope();
    for (let index = 0; index < 3; index += 1) await product(scope, { createdAt: at(index) });

    const page = await get(`${scope.query}&limit=2&offset=2`);

    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
    expect(page.total).toBe(3);
  });

  it('accepts offset=0 without a cursor', async () => {
    expect((await get('limit=1&offset=0')).total).toEqual(expect.any(Number));
  });
});

describe('product list by cursor: 400 VALIDATION_FAILED', () => {
  interface Detail {
    field: string;
    code: string;
    message: string;
  }

  async function refused(path: string): Promise<Detail[]> {
    const response = await http().get(path);
    expect(response.status, path).toBe(400);
    const { error } = response.body as { error: { code: string; details: Detail[] } };
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(JSON.stringify(response.body), 'the answer does not repeat the cursor').not.toContain(
      path.split('cursor=')[1]?.split('&')[0] || '\u0000',
    );
    return error.details;
  }

  const b64 = (value: unknown): string =>
    Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
  const ID = randomUUID();

  async function validCursor(sort: Sort): Promise<string> {
    const scope = await newScope();
    await product(scope);
    await product(scope);
    return (await get(`${scope.query}&sort=${sort}&limit=1`)).nextCursor!;
  }

  it('accepts a cursor of the same sort', async () => {
    for (const sort of SORTS) {
      const cursor = await validCursor(sort);

      expect((await http().get(`/products?sort=${sort}&cursor=${cursor}`)).status, sort).toBe(200);
    }
  });

  it.each([
    ['malformed base64', '!!!!'],
    ['a plus and a slash', 'ab+/'],
    ['not JSON', b64('not json')],
    ['JSON of the wrong shape', b64([1, 2])],
    ['an unknown sort', b64({ s: 'cheap', k: 1, id: ID })],
    ['an extra key', b64({ s: 'discount', k: 1, id: ID, extra: 1 })],
    ['a missing id', b64({ s: 'discount', k: 1 })],
    ['a key of the wrong type', b64({ s: 'discount', k: 'x', id: ID })],
    ['an id that is not a uuid', b64({ s: 'discount', k: 1, id: 'abc' })],
  ])('answers one INVALID_CURSOR detail on cursor for %s', async (_name, cursor) => {
    const details = await refused(`/products?sort=discount&cursor=${cursor}`);

    expect(details).toEqual([
      { field: 'cursor', code: 'INVALID_CURSOR', message: expect.any(String) as string },
    ]);
  });

  it('refuses a cursor made for another sort', async () => {
    const cursor = await validCursor('price_asc');

    for (const sort of SORTS.filter((candidate) => candidate !== 'price_asc')) {
      expect(await refused(`/products?sort=${sort}&cursor=${cursor}`), sort).toEqual([
        { field: 'cursor', code: 'INVALID_CURSOR', message: expect.any(String) as string },
      ]);
    }
  });

  it('answers one IS_IN detail on sort, and none on cursor, for an unknown sort with a valid cursor', async () => {
    const cursor = await validCursor('new');

    expect(await refused(`/products?sort=foo&cursor=${cursor}`)).toEqual([
      { field: 'sort', code: 'IS_IN', message: expect.any(String) as string },
    ]);
  });

  it('still answers INVALID_CURSOR for a bad cursor with a valid sort', async () => {
    expect(await refused('/products?sort=new&cursor=!!!!')).toEqual([
      { field: 'cursor', code: 'INVALID_CURSOR', message: expect.any(String) as string },
    ]);
  });

  it('refuses a cursor of another sort than the default one', async () => {
    const cursor = await validCursor('discount');

    expect(await refused(`/products?cursor=${cursor}`)).toEqual([
      { field: 'cursor', code: 'INVALID_CURSOR', message: expect.any(String) as string },
    ]);
  });

  it('refuses an empty cursor', async () => {
    expect(await refused('/products?cursor=')).toEqual([
      { field: 'cursor', code: 'INVALID_CURSOR', message: expect.any(String) as string },
    ]);
  });

  it('refuses a repeated cursor', async () => {
    const cursor = await validCursor('new');
    const response = await http().get(`/products?cursor=${cursor}&cursor=${cursor}`);

    expect(response.status).toBe(400);
    const { error } = response.body as { error: { code: string; details: Detail[] } };
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details).toEqual([
      { field: 'cursor', code: 'INVALID_CURSOR', message: expect.any(String) as string },
    ]);
  });

  it('refuses a cursor over 256 characters', async () => {
    const long = b64({ s: 'discount', k: 1, id: ID, pad: 'x'.repeat(300) });

    expect(long.length).toBeGreaterThan(256);
    expect(await refused(`/products?sort=discount&cursor=${long}`)).toEqual([
      { field: 'cursor', code: 'INVALID_CURSOR', message: expect.any(String) as string },
    ]);
  });

  it('refuses a cursor of 5000 characters', async () => {
    expect(await refused(`/products?cursor=${'A'.repeat(5000)}`)).toEqual([
      { field: 'cursor', code: 'INVALID_CURSOR', message: expect.any(String) as string },
    ]);
  });

  it('refuses a new-sort cursor dated in year 0000 and accepts years 0001 and 9999', async () => {
    const id = '01a13c9c-e97f-7b92-ad24-eadcc24d8aa5';
    const dated = (k: string): string => b64({ s: 'new', k, id });

    expect(await refused(`/products?cursor=${dated('0000-01-01T00:00:00.000Z')}`)).toEqual([
      { field: 'cursor', code: 'INVALID_CURSOR', message: expect.any(String) as string },
    ]);
    for (const key of ['0001-01-01T00:00:00.000Z', '9999-12-31T23:59:59.999Z']) {
      const response = await http().get(`/products?cursor=${dated(key)}&limit=1`);
      expect(response.status, key).toBe(200);
    }
  });

  it.each(['5.1', '5.9'])('refuses a rating cursor with the key %s', async (k) => {
    expect(
      await refused(`/products?sort=rating&cursor=${b64({ s: 'rating', k, id: ID })}`),
    ).toEqual([{ field: 'cursor', code: 'INVALID_CURSOR', message: expect.any(String) as string }]);
  });

  it.each(['5.0', '5', '0', '4.9'])('accepts a rating cursor with the key %s', async (k) => {
    const response = await http().get(
      `/products?sort=rating&limit=1&cursor=${b64({ s: 'rating', k, id: ID })}`,
    );

    expect(response.status).toBe(200);
  });

  it.each([
    ['99999999.99', 200],
    ['1290', 200],
    ['1290.5', 200],
    ['100000000.00', 400],
    ['1290.555', 400],
  ])('price cursor key %s answers %i', async (k, status) => {
    for (const sort of ['price_asc', 'price_desc']) {
      const response = await http().get(
        `/products?sort=${sort}&limit=1&cursor=${b64({ s: sort, k, id: ID })}`,
      );

      expect(response.status, `${sort} ${JSON.stringify(response.body)}`).toBe(status);
    }
  });

  it('accepts an uppercase uuid in a cursor and refuses one without hyphens or in braces', async () => {
    const cursorWith = (id: string): string => b64({ s: 'discount', k: 10, id });

    const upper = await http().get(
      `/products?sort=discount&cursor=${cursorWith(ID.toUpperCase())}`,
    );
    expect(upper.status).toBe(200);
    for (const id of [ID.replaceAll('-', ''), `{${ID}}`]) {
      expect(await refused(`/products?sort=discount&cursor=${cursorWith(id)}`), id).toEqual([
        { field: 'cursor', code: 'INVALID_CURSOR', message: expect.any(String) as string },
      ]);
    }
  });

  it('answers an empty list to a rating cursor with a null key when no product is unrated', async () => {
    const scope = await newScope();
    await product(scope, { rating: 4 });
    await product(scope, { rating: 3 });

    const page = await get(
      `${scope.query}&sort=rating&cursor=${b64({ s: 'rating', k: null, id: ID })}`,
    );

    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
    expect(page.total).toBeNull();
  });

  it('never repeats the cursor in a message', async () => {
    const cursor = b64({ s: 'discount', k: 'secret-marker', id: ID });
    const response = await http().get(`/products?sort=discount&cursor=${cursor}`);

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).not.toContain(cursor);
    expect(JSON.stringify(response.body)).not.toContain('secret-marker');
  });

  it('refuses an offset sent with a cursor, with a detail on offset', async () => {
    const cursor = await validCursor('new');

    for (const offset of [0, 5]) {
      expect(await refused(`/products?cursor=${cursor}&offset=${offset}`), String(offset)).toEqual([
        { field: 'offset', code: 'NOT_WITH_CURSOR', message: expect.any(String) as string },
      ]);
    }
  });

  it('refuses a bad cursor and an offset together with both details', async () => {
    const details = await refused('/products?cursor=!!!!&offset=1');

    expect(details.map((detail) => `${detail.field}:${detail.code}`).sort()).toEqual([
      'cursor:INVALID_CURSOR',
      'offset:NOT_WITH_CURSOR',
    ]);
  });

  it('does not take a cursor on the facets', async () => {
    const cursor = await validCursor('new');
    const response = await http().get(`/products/facets?cursor=${cursor}`);

    expect(response.status).toBe(400);
    const { error } = response.body as { error: { code: string } };
    expect(error.code).toBe('VALIDATION_FAILED');
  });
});
