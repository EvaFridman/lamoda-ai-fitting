import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { signIn } from '../support/sign-in.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

const COLUMNS = [
  'createdAt',
  'description',
  'id',
  'isActive',
  'name',
  'slot',
  'slug',
  'sortOrder',
  'updatedAt',
];

interface CategoryBody {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  description: string | null;
  sortOrder: number;
  slot: string | null;
  createdAt: string;
  updatedAt: string;
}

let testApp: TestApp;

beforeAll(async () => {
  testApp = await createTestApp();
  session = { Cookie: (await signIn(testApp.app)).cookie };
});

afterAll(async () => {
  await testApp.close();
});

const http = () => request(testApp.app.getHttpServer());
// The Cookie header of a signed-in user (the test app lets one through the closed routes).
let session: Record<string, string> = {};

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { name: `Category ${randomUUID()}`, slug: randomUUID(), isActive: true, ...overrides };
}

async function create(overrides: Record<string, unknown> = {}): Promise<CategoryBody> {
  const response = await http().post('/categories').set(session).send(validBody(overrides));
  expect(response.status).toBe(201);
  return response.body as CategoryBody;
}

// Every category of the list, page by page.
async function listAll(query = ''): Promise<CategoryBody[]> {
  const items: CategoryBody[] = [];
  for (let offset = 0; ; offset += 100) {
    const response = await http().get(`/categories?limit=100&offset=${offset}${query}`);
    expect(response.status).toBe(200);
    const page = response.body as { items: CategoryBody[]; total: number };
    items.push(...page.items);
    if (offset + 100 >= page.total) return items;
  }
}

function expectError(
  response: request.Response,
  status: number,
  code: string,
  field?: string,
): void {
  expect(response.status).toBe(status);
  const { error } = response.body as {
    error: { code: string; details: { field: string; code: string }[] };
  };
  expect(error.code).toBe(code);
  if (field !== undefined) {
    expect(error.details.map((detail) => detail.field)).toContain(field);
  }
}

describe('categories: access (AC1)', () => {
  it('lists and reads without a token', async () => {
    const category = await create();

    expect((await http().get('/categories')).status).toBe(200);
    expect((await http().get(`/categories/${category.id}`)).status).toBe(200);
  });

  it('refuses a write without a token with 401 UNAUTHORIZED', async () => {
    const category = await create();

    expectError(await http().post('/categories').send(validBody()), 401, 'UNAUTHORIZED');
    expectError(
      await http().patch(`/categories/${category.id}`).send({ name: 'x' }),
      401,
      'UNAUTHORIZED',
    );
    expectError(await http().delete(`/categories/${category.id}`), 401, 'UNAUTHORIZED');
  });

  it('answers 401, not 400, for a malformed id without a valid token', async () => {
    expectError(
      await http().patch('/categories/not-a-uuid').send({ name: 'x' }),
      401,
      'UNAUTHORIZED',
    );
    expectError(await http().delete('/categories/not-a-uuid'), 401, 'UNAUTHORIZED');
    expectError(
      await http().delete('/categories/not-a-uuid').set({ Cookie: 'lamoda.session_token=garbage' }),
      401,
      'UNAUTHORIZED',
    );
  });

  it('refuses a write with a wrong token with 401 UNAUTHORIZED', async () => {
    const category = await create();
    const wrong = { Cookie: 'lamoda.session_token=garbage' };

    expectError(await http().post('/categories').set(wrong).send(validBody()), 401, 'UNAUTHORIZED');
    expectError(
      await http().patch(`/categories/${category.id}`).set(wrong).send({ name: 'x' }),
      401,
      'UNAUTHORIZED',
    );
    expectError(await http().delete(`/categories/${category.id}`).set(wrong), 401, 'UNAUTHORIZED');
    expect(await testApp.prisma.category.count({ where: { id: category.id } })).toBe(1);
  });
});

describe('categories: create, read, update, delete (AC2)', () => {
  it('creates with 201 and returns the own columns only', async () => {
    const body = validBody({ description: 'About', sortOrder: 7, isActive: false });
    const response = await http().post('/categories').set(session).send(body);

    expect(response.status).toBe(201);
    expect(Object.keys(response.body as object).sort()).toEqual(COLUMNS);
    expect(response.body).toMatchObject({
      name: body.name,
      slug: body.slug,
      isActive: false,
      description: 'About',
      sortOrder: 7,
    });
  });

  it('defaults sortOrder to 0 and description to null', async () => {
    const category = await create();

    expect(category.sortOrder).toBe(0);
    expect(category.description).toBeNull();
  });

  it('reads one by id with 200', async () => {
    const category = await create();
    const response = await http().get(`/categories/${category.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(category);
  });

  it('updates only the sent fields with 200 and returns the record', async () => {
    const category = await create({ description: 'Keep', sortOrder: 3 });
    const response = await http()
      .patch(`/categories/${category.id}`)
      .set(session)
      .send({ isActive: false });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: 'Keep',
      sortOrder: 3,
      isActive: false,
    });
    expect(Object.keys(response.body as object).sort()).toEqual(COLUMNS);
  });

  it('deletes with 204 and an empty body, then answers 404 NOT_FOUND', async () => {
    const category = await create();
    const response = await http().delete(`/categories/${category.id}`).set(session);

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expectError(await http().get(`/categories/${category.id}`), 404, 'NOT_FOUND');
  });
});

describe('categories: list (AC3, E39)', () => {
  it('answers { items, total } and pages with limit and offset', async () => {
    await Promise.all([create(), create(), create()]);
    const all = await listAll();
    const response = await http().get('/categories?limit=2&offset=1');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: all.slice(1, 3), total: all.length });
  });

  it('defaults to 60 items from offset 0', async () => {
    await testApp.prisma.category.createMany({
      data: Array.from({ length: 61 }, () => ({
        name: `Bulk ${randomUUID()}`,
        slug: randomUUID(),
        isActive: true,
      })),
    });
    const response = await http().get('/categories');
    const body = response.body as { items: CategoryBody[]; total: number };

    expect(body.items).toHaveLength(60);
    expect(body.total).toBeGreaterThanOrEqual(61);
    expect(body.items.map((item) => item.id)).toEqual(
      (await listAll()).slice(0, 60).map((i) => i.id),
    );
  });

  it('refuses limit 101 with 400 VALIDATION_FAILED', async () => {
    expectError(await http().get('/categories?limit=101'), 400, 'VALIDATION_FAILED', 'limit');
  });

  it('orders by sortOrder, then name', async () => {
    const tag = randomUUID();
    const base = 1_000_000;
    const late = await create({ name: `a ${tag}`, sortOrder: base + 2 });
    const second = await create({ name: `b ${tag}`, sortOrder: base + 2 });
    const first = await create({ name: `z ${tag}`, sortOrder: base + 1 });

    const ids = (await listAll()).filter((item) => item.name.endsWith(tag)).map((item) => item.id);

    expect(ids).toEqual([first.id, late.id, second.id]);
  });

  it('filters by ?isActive and total follows the filter', async () => {
    await create({ isActive: true });
    await create({ isActive: false });
    const [active, inactive, everything] = await Promise.all([
      testApp.prisma.category.count({ where: { isActive: true } }),
      testApp.prisma.category.count({ where: { isActive: false } }),
      testApp.prisma.category.count(),
    ]);

    const onlyActive = await http().get('/categories?isActive=true&limit=100');
    const onlyInactive = await http().get('/categories?isActive=false&limit=100');
    const unfiltered = await http().get('/categories?limit=100');

    expect((onlyActive.body as { total: number }).total).toBe(active);
    expect((onlyInactive.body as { total: number }).total).toBe(inactive);
    expect((unfiltered.body as { total: number }).total).toBe(everything);
    expect(
      (onlyActive.body as { items: CategoryBody[] }).items.every((item) => item.isActive),
    ).toBe(true);
    expect(
      (onlyInactive.body as { items: CategoryBody[] }).items.every((item) => !item.isActive),
    ).toBe(true);
  });

  it('refuses limit 1.5 with 400 VALIDATION_FAILED', async () => {
    expectError(await http().get('/categories?limit=1.5'), 400, 'VALIDATION_FAILED', 'limit');
  });

  it.each([
    'isActive=yes',
    'isActive=TRUE',
    'isActive=1',
    'isActive=',
    'isActive=true&isActive=false',
  ])('refuses ?%s with 400 VALIDATION_FAILED on isActive', async (query) => {
    expectError(await http().get(`/categories?${query}`), 400, 'VALIDATION_FAILED', 'isActive');
  });
});

describe('categories: create rules (E40)', () => {
  it('requires isActive', async () => {
    const { isActive: _omitted, ...body } = validBody();

    expectError(
      await http().post('/categories').set(session).send(body),
      400,
      'VALIDATION_FAILED',
      'isActive',
    );
  });

  it('refuses a null sortOrder', async () => {
    expectError(
      await http()
        .post('/categories')
        .set(session)
        .send(validBody({ sortOrder: null })),
      400,
      'VALIDATION_FAILED',
      'sortOrder',
    );
  });

  it('refuses a negative sortOrder', async () => {
    expectError(
      await http()
        .post('/categories')
        .set(session)
        .send(validBody({ sortOrder: -1 })),
      400,
      'VALIDATION_FAILED',
      'sortOrder',
    );
  });

  it('accepts a null description', async () => {
    const category = await create({ description: null });

    expect(category.description).toBeNull();
  });

  it('keeps line breaks and outer spaces in a description', async () => {
    const description = '  first\nsecond  ';
    const category = await create({ description });

    expect(category.description).toBe(description);
  });

  it('accepts a description of 5000 code points and refuses 5001', async () => {
    const wide = (n: number): string => String.fromCodePoint(0x1f600).repeat(n);

    expect((await create({ description: wide(5000) })).description).toBe(wide(5000));
    expectError(
      await http()
        .post('/categories')
        .set(session)
        .send(validBody({ description: wide(5001) })),
      400,
      'VALIDATION_FAILED',
      'description',
    );
  });

  it('refuses NUL in a description', async () => {
    expectError(
      await http()
        .post('/categories')
        .set(session)
        .send(validBody({ description: 'a\u0000b' })),
      400,
      'VALIDATION_FAILED',
      'description',
    );
  });

  it.each(['', ' padded ', 'a\u0000b'])('refuses the name %j', async (name) => {
    expectError(
      await http().post('/categories').set(session).send(validBody({ name })),
      400,
      'VALIDATION_FAILED',
      'name',
    );
  });

  it.each(['', 'Upper', 'a_b', 'a--b', '-a', 'бренд'])('refuses the slug %j', async (slug) => {
    expectError(
      await http().post('/categories').set(session).send(validBody({ slug })),
      400,
      'VALIDATION_FAILED',
      'slug',
    );
  });

  it('refuses an unknown field', async () => {
    expectError(
      await http()
        .post('/categories')
        .set(session)
        .send(validBody({ extra: 1 })),
      400,
      'VALIDATION_FAILED',
      'extra',
    );
  });
});

describe('categories: update rules (E40)', () => {
  it.each(['name', 'slug', 'isActive', 'sortOrder'])('refuses null in %s', async (field) => {
    const category = await create();

    expectError(
      await http()
        .patch(`/categories/${category.id}`)
        .set(session)
        .send({ [field]: null }),
      400,
      'VALIDATION_FAILED',
      field,
    );
  });

  it('clears the description with null', async () => {
    const category = await create({ description: 'Something' });
    const response = await http()
      .patch(`/categories/${category.id}`)
      .set(session)
      .send({ description: null });

    expect(response.status).toBe(200);
    expect((response.body as CategoryBody).description).toBeNull();
  });

  it('answers 200 with the record unchanged, updatedAt included, for an empty body', async () => {
    const category = await create();
    const response = await http().patch(`/categories/${category.id}`).set(session).send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual(category);
  });

  it('answers 404 NOT_FOUND for an unknown id, with an empty body too', async () => {
    const id = randomUUID();

    expectError(
      await http().patch(`/categories/${id}`).set(session).send({ name: 'Anything' }),
      404,
      'NOT_FOUND',
    );
    expectError(await http().patch(`/categories/${id}`).set(session).send({}), 404, 'NOT_FOUND');
  });

  it('refuses an unknown field', async () => {
    const category = await create();

    expectError(
      await http().patch(`/categories/${category.id}`).set(session).send({ extra: 1 }),
      400,
      'VALIDATION_FAILED',
      'extra',
    );
  });
});

describe('categories: read by slug (spec 0014 T7)', () => {
  it('reads an active category by slug with the same body as by id', async () => {
    const category = await create({ isActive: true });
    const response = await http().get(`/categories/by-slug/${category.slug}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(category);
    expect(response.body).toEqual((await http().get(`/categories/${category.id}`)).body);
  });

  it('reads an inactive category by slug too', async () => {
    const category = await create({ isActive: false });
    const response = await http().get(`/categories/by-slug/${category.slug}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(category);
  });

  it('answers 200 to an anonymous request with a broken session cookie', async () => {
    const category = await create();
    const response = await http()
      .get(`/categories/by-slug/${category.slug}`)
      .set({ Cookie: 'lamoda.session_token=garbage' });

    expect(response.status).toBe(200);
  });

  it('answers 404 NOT_FOUND for a valid unknown slug', async () => {
    expectError(await http().get(`/categories/by-slug/unknown-${randomUUID()}`), 404, 'NOT_FOUND');
  });

  it('passes validation for a 255-character slug and answers 404 NOT_FOUND', async () => {
    expectError(await http().get(`/categories/by-slug/${'a'.repeat(255)}`), 404, 'NOT_FOUND');
  });

  it.each([
    ['an encoded slash', 'a%2Fb'],
    ['an encoded NUL', 'a%00b'],
    ['an encoded space', 'a%20b'],
  ])('refuses a slug with %s with 400 VALIDATION_FAILED on slug', async (_label, slug) => {
    expectError(await http().get(`/categories/by-slug/${slug}`), 400, 'VALIDATION_FAILED', 'slug');
  });

  it('answers 200 to HEAD on an existing slug', async () => {
    const category = await create();

    expect((await http().head(`/categories/by-slug/${category.slug}`)).status).toBe(200);
  });

  it('answers 404 ROUTE_NOT_FOUND for a slug with a further segment', async () => {
    expectError(await http().get('/categories/by-slug/a/b'), 404, 'ROUTE_NOT_FOUND');
  });

  it.each([
    ['upper case', 'Dresses'],
    ['a double hyphen', 'a--b'],
    ['a leading hyphen', '-a'],
    ['a trailing hyphen', 'a-'],
    ['256 characters', 'a'.repeat(256)],
    ['non-Latin letters', encodeURIComponent('платья')],
    ['an underscore', 'a_b'],
  ])('refuses a slug with %s with 400 VALIDATION_FAILED on slug', async (_label, slug) => {
    expectError(await http().get(`/categories/by-slug/${slug}`), 400, 'VALIDATION_FAILED', 'slug');
  });
});

describe('categories: errors', () => {
  it('refuses a duplicate name on create with 409 ALREADY_EXISTS', async () => {
    const category = await create();

    expectError(
      await http()
        .post('/categories')
        .set(session)
        .send(validBody({ name: category.name })),
      409,
      'ALREADY_EXISTS',
      'name',
    );
  });

  it('refuses a duplicate slug on create with 409 ALREADY_EXISTS', async () => {
    const category = await create();

    expectError(
      await http()
        .post('/categories')
        .set(session)
        .send(validBody({ slug: category.slug })),
      409,
      'ALREADY_EXISTS',
      'slug',
    );
  });

  it('refuses a duplicate name and slug on update with 409 ALREADY_EXISTS', async () => {
    const [one, other] = [await create(), await create()];

    expectError(
      await http().patch(`/categories/${other.id}`).set(session).send({ name: one.name }),
      409,
      'ALREADY_EXISTS',
      'name',
    );
    expectError(
      await http().patch(`/categories/${other.id}`).set(session).send({ slug: one.slug }),
      409,
      'ALREADY_EXISTS',
      'slug',
    );
  });

  it('refuses to delete a category with a product with 409 IN_USE and keeps it (AC6)', async () => {
    const category = await create();
    const brand = await testApp.prisma.brand.create({ data: { name: `Brand ${randomUUID()}` } });
    await testApp.prisma.product.create({
      data: {
        article: `ART-${randomUUID()}`,
        name: 'Product',
        price: '10.00',
        brandId: brand.id,
        categoryId: category.id,
      },
    });

    expectError(await http().delete(`/categories/${category.id}`).set(session), 409, 'IN_USE');
    expect(await testApp.prisma.category.count({ where: { id: category.id } })).toBe(1);
  });

  it('answers 400 INVALID_ID for a malformed id on every id route', async () => {
    expectError(await http().get('/categories/not-a-uuid'), 400, 'INVALID_ID');
    expectError(
      await http().patch('/categories/not-a-uuid').set(session).send({ name: 'x' }),
      400,
      'INVALID_ID',
    );
    expectError(await http().delete('/categories/not-a-uuid').set(session), 400, 'INVALID_ID');
  });

  it('answers 404 NOT_FOUND for an unknown id on get and delete', async () => {
    const id = randomUUID();

    expectError(await http().get(`/categories/${id}`), 404, 'NOT_FOUND');
    expectError(await http().delete(`/categories/${id}`).set(session), 404, 'NOT_FOUND');
  });
});
