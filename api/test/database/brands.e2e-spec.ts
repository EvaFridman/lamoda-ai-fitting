import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp } from '../support/test-app.js';

const ADMIN_TOKEN = 'test-admin-token-0123456789abcdef';

interface BrandBody {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

let testApp: TestApp;

beforeAll(async () => {
  testApp = await createTestApp();
});

afterAll(async () => {
  await testApp.close();
});

const http = () => request(testApp.app.getHttpServer());
const admin = { 'X-Admin-Token': ADMIN_TOKEN };

async function create(name = `Brand ${randomUUID()}`): Promise<BrandBody> {
  const response = await http().post('/brands').set(admin).send({ name });
  expect(response.status).toBe(201);
  return response.body as BrandBody;
}

async function listAll(): Promise<BrandBody[]> {
  const items: BrandBody[] = [];
  for (let offset = 0; ; offset += 100) {
    const response = await http().get(`/brands?limit=100&offset=${offset}`);
    expect(response.status).toBe(200);
    const page = response.body as { items: BrandBody[]; total: number };
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

describe('brands: access (AC1)', () => {
  it('lists and reads without a token', async () => {
    const brand = await create();

    expect((await http().get('/brands')).status).toBe(200);
    expect((await http().get(`/brands/${brand.id}`)).status).toBe(200);
  });

  it('refuses a write without a token with 401 UNAUTHORIZED', async () => {
    const brand = await create();

    expectError(await http().post('/brands').send({ name: 'x' }), 401, 'UNAUTHORIZED');
    expectError(await http().patch(`/brands/${brand.id}`).send({ name: 'x' }), 401, 'UNAUTHORIZED');
    expectError(await http().delete(`/brands/${brand.id}`), 401, 'UNAUTHORIZED');
  });

  it('answers 401, not 400, for a malformed id without a valid token', async () => {
    expectError(await http().patch('/brands/not-a-uuid').send({ name: 'x' }), 401, 'UNAUTHORIZED');
    expectError(await http().delete('/brands/not-a-uuid'), 401, 'UNAUTHORIZED');
    expectError(
      await http().delete('/brands/not-a-uuid').set({ 'X-Admin-Token': 'wrong-token' }),
      401,
      'UNAUTHORIZED',
    );
  });

  it('refuses a write with a wrong token with 401 UNAUTHORIZED', async () => {
    const brand = await create();
    const wrong = { 'X-Admin-Token': 'wrong-token' };

    expectError(await http().post('/brands').set(wrong).send({ name: 'x' }), 401, 'UNAUTHORIZED');
    expectError(
      await http().patch(`/brands/${brand.id}`).set(wrong).send({ name: 'x' }),
      401,
      'UNAUTHORIZED',
    );
    expectError(await http().delete(`/brands/${brand.id}`).set(wrong), 401, 'UNAUTHORIZED');
    expect(await testApp.prisma.brand.count({ where: { id: brand.id } })).toBe(1);
  });
});

describe('brands: create, read, update, delete (AC2)', () => {
  it('creates with 201 and returns the own columns only', async () => {
    const name = `Brand ${randomUUID()}`;
    const response = await http().post('/brands').set(admin).send({ name });

    expect(response.status).toBe(201);
    expect(Object.keys(response.body as object).sort()).toEqual([
      'createdAt',
      'id',
      'name',
      'updatedAt',
    ]);
    expect((response.body as BrandBody).name).toBe(name);
  });

  it('reads one by id with 200', async () => {
    const brand = await create();
    const response = await http().get(`/brands/${brand.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(brand);
  });

  it('updates the name with 200 and returns the record', async () => {
    const brand = await create();
    const name = `Renamed ${randomUUID()}`;
    const response = await http().patch(`/brands/${brand.id}`).set(admin).send({ name });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: brand.id, name });
  });

  it('answers 200 with the record unchanged, updatedAt included, for an empty body', async () => {
    const brand = await create();
    const response = await http().patch(`/brands/${brand.id}`).set(admin).send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual(brand);
  });

  it('deletes with 204 and an empty body, then answers 404 NOT_FOUND', async () => {
    const brand = await create();
    const response = await http().delete(`/brands/${brand.id}`).set(admin);

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expectError(await http().get(`/brands/${brand.id}`), 404, 'NOT_FOUND');
  });
});

describe('brands: list (AC3, E39)', () => {
  it('answers { items, total } and pages with limit and offset', async () => {
    await Promise.all([create(), create(), create()]);
    const all = await listAll();
    const response = await http().get('/brands?limit=2&offset=1');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: all.slice(1, 3), total: all.length });
  });

  it('defaults to 60 items from offset 0', async () => {
    await testApp.prisma.brand.createMany({
      data: Array.from({ length: 61 }, () => ({ name: `Bulk ${randomUUID()}` })),
    });
    const response = await http().get('/brands');
    const body = response.body as { items: BrandBody[]; total: number };

    expect(body.items).toHaveLength(60);
    expect(body.total).toBeGreaterThanOrEqual(61);
  });

  it('refuses limit 101 with 400 VALIDATION_FAILED', async () => {
    expectError(await http().get('/brands?limit=101'), 400, 'VALIDATION_FAILED', 'limit');
  });

  it('refuses limit 1.5 with 400 VALIDATION_FAILED', async () => {
    expectError(await http().get('/brands?limit=1.5'), 400, 'VALIDATION_FAILED', 'limit');
  });

  it.each(['isActive=true', 'foo=1'])(
    'refuses the unknown parameter ?%s with 400 VALIDATION_FAILED',
    async (query) => {
      expectError(
        await http().get(`/brands?${query}`),
        400,
        'VALIDATION_FAILED',
        query.split('=')[0],
      );
    },
  );

  it('orders by name', async () => {
    const tag = randomUUID();
    const c = await create(`c ${tag}`);
    const a = await create(`a ${tag}`);
    const b = await create(`b ${tag}`);

    const ids = (await listAll()).filter((item) => item.name.endsWith(tag)).map((item) => item.id);

    expect(ids).toEqual([a.id, b.id, c.id]);
  });
});

describe('brands: rules (E40)', () => {
  it.each(['', ' padded ', 'a\u0000b', 'x'.repeat(256)])('refuses the name %j', async (name) => {
    expectError(
      await http().post('/brands').set(admin).send({ name }),
      400,
      'VALIDATION_FAILED',
      'name',
    );
  });

  it('refuses a missing name', async () => {
    expectError(await http().post('/brands').set(admin).send({}), 400, 'VALIDATION_FAILED', 'name');
  });

  it('refuses an unknown field', async () => {
    expectError(
      await http().post('/brands').set(admin).send({ name: 'Ok', extra: 1 }),
      400,
      'VALIDATION_FAILED',
      'extra',
    );
  });

  it('refuses a null name on update', async () => {
    const brand = await create();

    expectError(
      await http().patch(`/brands/${brand.id}`).set(admin).send({ name: null }),
      400,
      'VALIDATION_FAILED',
      'name',
    );
  });
});

describe('brands: errors', () => {
  it('refuses a duplicate name on create with 409 ALREADY_EXISTS', async () => {
    const brand = await create();

    expectError(
      await http().post('/brands').set(admin).send({ name: brand.name }),
      409,
      'ALREADY_EXISTS',
      'name',
    );
  });

  it('refuses a duplicate name on update with 409 ALREADY_EXISTS', async () => {
    const [one, other] = [await create(), await create()];

    expectError(
      await http().patch(`/brands/${other.id}`).set(admin).send({ name: one.name }),
      409,
      'ALREADY_EXISTS',
      'name',
    );
  });

  it('refuses to delete a brand with a product with 409 IN_USE and keeps it (AC6)', async () => {
    const brand = await create();
    const category = await testApp.prisma.category.create({
      data: { name: `Category ${randomUUID()}`, slug: randomUUID(), isActive: true },
    });
    await testApp.prisma.product.create({
      data: {
        article: `ART-${randomUUID()}`,
        name: 'Product',
        price: '10.00',
        brandId: brand.id,
        categoryId: category.id,
      },
    });

    expectError(await http().delete(`/brands/${brand.id}`).set(admin), 409, 'IN_USE');
    expect(await testApp.prisma.brand.count({ where: { id: brand.id } })).toBe(1);
  });

  it('answers 400 INVALID_ID for a malformed id on every id route', async () => {
    expectError(await http().get('/brands/not-a-uuid'), 400, 'INVALID_ID');
    expectError(
      await http().patch('/brands/not-a-uuid').set(admin).send({ name: 'x' }),
      400,
      'INVALID_ID',
    );
    expectError(await http().delete('/brands/not-a-uuid').set(admin), 400, 'INVALID_ID');
  });

  it('answers 404 NOT_FOUND for an unknown id on get, update and delete', async () => {
    const id = randomUUID();

    expectError(await http().get(`/brands/${id}`), 404, 'NOT_FOUND');
    expectError(
      await http().patch(`/brands/${id}`).set(admin).send({ name: 'Anything' }),
      404,
      'NOT_FOUND',
    );
    expectError(await http().delete(`/brands/${id}`).set(admin), 404, 'NOT_FOUND');
  });
});
