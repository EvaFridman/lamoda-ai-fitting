import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp } from '../support/test-app.js';

const ADMIN_TOKEN = 'test-admin-token-0123456789abcdef';

interface AttributeBody {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface ValueBody {
  id: string;
  attributeId: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

interface Page<T> {
  items: T[];
  total: number;
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

async function createAttribute(name = `Attribute ${randomUUID()}`): Promise<AttributeBody> {
  const response = await http().post('/attributes').set(admin).send({ name });
  expect(response.status).toBe(201);
  return response.body as AttributeBody;
}

async function createValue(
  attributeId: string,
  value = `Value ${randomUUID()}`,
): Promise<ValueBody> {
  const response = await http()
    .post(`/attributes/${attributeId}/values`)
    .set(admin)
    .send({ value });
  expect(response.status).toBe(201);
  return response.body as ValueBody;
}

async function listAllAttributes(): Promise<AttributeBody[]> {
  const items: AttributeBody[] = [];
  for (let offset = 0; ; offset += 100) {
    const response = await http().get(`/attributes?limit=100&offset=${offset}`);
    expect(response.status).toBe(200);
    const page = response.body as Page<AttributeBody>;
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

describe('attributes: access', () => {
  it('lists and reads attributes and values without a token', async () => {
    const attribute = await createAttribute();
    const value = await createValue(attribute.id);

    expect((await http().get('/attributes')).status).toBe(200);
    expect((await http().get(`/attributes/${attribute.id}`)).status).toBe(200);
    expect((await http().get(`/attributes/${attribute.id}/values`)).status).toBe(200);
    expect((await http().get(`/attributes/${attribute.id}/values/${value.id}`)).status).toBe(200);
  });

  it('refuses attribute writes without a token with 401 UNAUTHORIZED', async () => {
    const attribute = await createAttribute();

    expectError(await http().post('/attributes').send({ name: 'x' }), 401, 'UNAUTHORIZED');
    expectError(
      await http().patch(`/attributes/${attribute.id}`).send({ name: 'x' }),
      401,
      'UNAUTHORIZED',
    );
    expectError(await http().delete(`/attributes/${attribute.id}`), 401, 'UNAUTHORIZED');
    expect(await testApp.prisma.attribute.count({ where: { id: attribute.id } })).toBe(1);
  });

  it('refuses value writes without a token or with a wrong one', async () => {
    const attribute = await createAttribute();
    const value = await createValue(attribute.id);
    const base = `/attributes/${attribute.id}/values`;
    const wrong = { 'X-Admin-Token': 'wrong-token' };

    expectError(await http().post(base).send({ value: 'x' }), 401, 'UNAUTHORIZED');
    expectError(await http().post(base).set(wrong).send({ value: 'x' }), 401, 'UNAUTHORIZED');
    expectError(
      await http().patch(`${base}/${value.id}`).send({ value: 'x' }),
      401,
      'UNAUTHORIZED',
    );
    expectError(await http().delete(`${base}/${value.id}`).set(wrong), 401, 'UNAUTHORIZED');
    expect(await testApp.prisma.attributeValue.count({ where: { id: value.id } })).toBe(1);
  });

  it('answers 401, not 400, for a malformed id without a valid token', async () => {
    expectError(
      await http().patch('/attributes/not-a-uuid').send({ name: 'x' }),
      401,
      'UNAUTHORIZED',
    );
    expectError(
      await http().delete('/attributes/not-a-uuid/values/not-a-uuid'),
      401,
      'UNAUTHORIZED',
    );
  });
});

describe('attributes: create, read, update, delete', () => {
  it('creates with 201 and returns exactly the own columns', async () => {
    const name = `Attribute ${randomUUID()}`;
    const response = await http().post('/attributes').set(admin).send({ name });

    expect(response.status).toBe(201);
    expect(Object.keys(response.body as object).sort()).toEqual([
      'createdAt',
      'id',
      'name',
      'updatedAt',
    ]);
    expect((response.body as AttributeBody).name).toBe(name);
  });

  it('reads one by id without values', async () => {
    const attribute = await createAttribute();
    await createValue(attribute.id);
    const response = await http().get(`/attributes/${attribute.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(attribute);
  });

  it('updates the name with 200', async () => {
    const attribute = await createAttribute();
    const name = `Renamed ${randomUUID()}`;
    const response = await http().patch(`/attributes/${attribute.id}`).set(admin).send({ name });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: attribute.id, name });
  });

  it('answers 200 with the record unchanged, updatedAt included, for an empty body', async () => {
    const attribute = await createAttribute();
    const response = await http().patch(`/attributes/${attribute.id}`).set(admin).send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual(attribute);
  });

  it('deletes with 204 and an empty body, then answers 404', async () => {
    const attribute = await createAttribute();
    const response = await http().delete(`/attributes/${attribute.id}`).set(admin);

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expectError(await http().get(`/attributes/${attribute.id}`), 404, 'NOT_FOUND');
  });
});

describe('attributes: list', () => {
  it('answers { items, total } and pages with limit and offset', async () => {
    await Promise.all([createAttribute(), createAttribute(), createAttribute()]);
    const all = await listAllAttributes();
    const response = await http().get('/attributes?limit=2&offset=1');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: all.slice(1, 3), total: all.length });
  });

  it('orders by name', async () => {
    const tag = randomUUID();
    const c = await createAttribute(`c ${tag}`);
    const a = await createAttribute(`a ${tag}`);
    const b = await createAttribute(`b ${tag}`);

    const ids = (await listAllAttributes())
      .filter((item) => item.name.endsWith(tag))
      .map((item) => item.id);

    expect(ids).toEqual([a.id, b.id, c.id]);
  });

  it('refuses limit 101 with 400 VALIDATION_FAILED', async () => {
    expectError(await http().get('/attributes?limit=101'), 400, 'VALIDATION_FAILED', 'limit');
  });
});

describe('attributes: name rules', () => {
  it.each(['', ' padded ', 'a\u0000b', 'x'.repeat(101), '\u{1F600}'.repeat(101)])(
    'refuses the name %j',
    async (name) => {
      expectError(
        await http().post('/attributes').set(admin).send({ name }),
        400,
        'VALIDATION_FAILED',
        'name',
      );
    },
  );

  it('accepts a name of 100 code points', async () => {
    const response = await http()
      .post('/attributes')
      .set(admin)
      .send({ name: '\u{1F600}'.repeat(100) });

    expect(response.status).toBe(201);
  });

  it('refuses a missing name and an unknown field', async () => {
    expectError(
      await http().post('/attributes').set(admin).send({}),
      400,
      'VALIDATION_FAILED',
      'name',
    );
    expectError(
      await http().post('/attributes').set(admin).send({ name: 'Ok', extra: 1 }),
      400,
      'VALIDATION_FAILED',
      'extra',
    );
  });

  it('refuses a null name on create and update', async () => {
    const attribute = await createAttribute();

    expectError(
      await http().post('/attributes').set(admin).send({ name: null }),
      400,
      'VALIDATION_FAILED',
      'name',
    );
    expectError(
      await http().patch(`/attributes/${attribute.id}`).set(admin).send({ name: null }),
      400,
      'VALIDATION_FAILED',
      'name',
    );
  });

  it('refuses an invalid name on update', async () => {
    const attribute = await createAttribute();

    expectError(
      await http().patch(`/attributes/${attribute.id}`).set(admin).send({ name: ' x' }),
      400,
      'VALIDATION_FAILED',
      'name',
    );
  });
});

describe('attributes: errors', () => {
  it('refuses a duplicate name on create and update with 409 ALREADY_EXISTS', async () => {
    const one = await createAttribute();
    const other = await createAttribute();

    expectError(
      await http().post('/attributes').set(admin).send({ name: one.name }),
      409,
      'ALREADY_EXISTS',
      'name',
    );
    expectError(
      await http().patch(`/attributes/${other.id}`).set(admin).send({ name: one.name }),
      409,
      'ALREADY_EXISTS',
      'name',
    );
  });

  it('refuses to delete an attribute that has values with 409 IN_USE, then deletes it', async () => {
    const attribute = await createAttribute();
    const value = await createValue(attribute.id);

    expectError(await http().delete(`/attributes/${attribute.id}`).set(admin), 409, 'IN_USE');
    expect(await testApp.prisma.attribute.count({ where: { id: attribute.id } })).toBe(1);

    expect(
      (await http().delete(`/attributes/${attribute.id}/values/${value.id}`).set(admin)).status,
    ).toBe(204);
    expect((await http().delete(`/attributes/${attribute.id}`).set(admin)).status).toBe(204);
  });

  it('answers 400 INVALID_ID for a malformed id', async () => {
    expectError(await http().get('/attributes/not-a-uuid'), 400, 'INVALID_ID');
    expectError(
      await http().patch('/attributes/not-a-uuid').set(admin).send({ name: 'x' }),
      400,
      'INVALID_ID',
    );
    expectError(await http().delete('/attributes/not-a-uuid').set(admin), 400, 'INVALID_ID');
  });

  it('answers 404 NOT_FOUND for an unknown id on get, update and delete', async () => {
    const id = randomUUID();

    expectError(await http().get(`/attributes/${id}`), 404, 'NOT_FOUND');
    expectError(
      await http().patch(`/attributes/${id}`).set(admin).send({ name: 'Anything' }),
      404,
      'NOT_FOUND',
    );
    expectError(await http().delete(`/attributes/${id}`).set(admin), 404, 'NOT_FOUND');
  });
});

describe('attribute values: create, read, update, delete', () => {
  it('creates with 201 and returns exactly the own columns', async () => {
    const attribute = await createAttribute();
    const value = `Value ${randomUUID()}`;
    const response = await http()
      .post(`/attributes/${attribute.id}/values`)
      .set(admin)
      .send({ value });

    expect(response.status).toBe(201);
    expect(Object.keys(response.body as object).sort()).toEqual([
      'attributeId',
      'createdAt',
      'id',
      'updatedAt',
      'value',
    ]);
    expect(response.body).toMatchObject({ attributeId: attribute.id, value });
  });

  it('reads one by id', async () => {
    const attribute = await createAttribute();
    const value = await createValue(attribute.id);
    const response = await http().get(`/attributes/${attribute.id}/values/${value.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(value);
  });

  it('updates the value with 200', async () => {
    const attribute = await createAttribute();
    const value = await createValue(attribute.id);
    const next = `Renamed ${randomUUID()}`;
    const response = await http()
      .patch(`/attributes/${attribute.id}/values/${value.id}`)
      .set(admin)
      .send({ value: next });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: value.id, attributeId: attribute.id, value: next });
  });

  it('answers 200 with the record unchanged, updatedAt included, for an empty body', async () => {
    const attribute = await createAttribute();
    const value = await createValue(attribute.id);
    const response = await http()
      .patch(`/attributes/${attribute.id}/values/${value.id}`)
      .set(admin)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual(value);
  });

  it('deletes with 204 and an empty body, then answers 404', async () => {
    const attribute = await createAttribute();
    const value = await createValue(attribute.id);
    const path = `/attributes/${attribute.id}/values/${value.id}`;
    const response = await http().delete(path).set(admin);

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expectError(await http().get(path), 404, 'NOT_FOUND');
  });
});

describe('attribute values: list', () => {
  it('lists only the values of the attribute, ordered by value, and pages them', async () => {
    const attribute = await createAttribute();
    const other = await createAttribute();
    const c = await createValue(attribute.id, 'c');
    const a = await createValue(attribute.id, 'a');
    const b = await createValue(attribute.id, 'b');
    await createValue(other.id, 'a');
    await createValue(other.id, 'z');

    const all = await http().get(`/attributes/${attribute.id}/values`);
    expect(all.status).toBe(200);
    expect(all.body).toEqual({ items: [a, b, c], total: 3 });

    const page = await http().get(`/attributes/${attribute.id}/values?limit=1&offset=1`);
    expect(page.body).toEqual({ items: [b], total: 3 });
  });

  it('answers an empty page for an attribute without values', async () => {
    const attribute = await createAttribute();
    const response = await http().get(`/attributes/${attribute.id}/values`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [], total: 0 });
  });

  it('refuses limit 101 with 400 VALIDATION_FAILED', async () => {
    const attribute = await createAttribute();

    expectError(
      await http().get(`/attributes/${attribute.id}/values?limit=101`),
      400,
      'VALIDATION_FAILED',
      'limit',
    );
  });
});

describe('attribute values: rules', () => {
  it.each(['', ' padded ', 'a\u0000b', 'x'.repeat(256), '\u{1F600}'.repeat(256)])(
    'refuses the value %j on create and update',
    async (value) => {
      const attribute = await createAttribute();
      const existing = await createValue(attribute.id);

      expectError(
        await http().post(`/attributes/${attribute.id}/values`).set(admin).send({ value }),
        400,
        'VALIDATION_FAILED',
        'value',
      );
      expectError(
        await http()
          .patch(`/attributes/${attribute.id}/values/${existing.id}`)
          .set(admin)
          .send({ value }),
        400,
        'VALIDATION_FAILED',
        'value',
      );
    },
  );

  it('accepts a value of 255 code points', async () => {
    const attribute = await createAttribute();
    const response = await http()
      .post(`/attributes/${attribute.id}/values`)
      .set(admin)
      .send({ value: '\u{1F600}'.repeat(255) });

    expect(response.status).toBe(201);
  });

  it('refuses a missing value and a null value', async () => {
    const attribute = await createAttribute();
    const existing = await createValue(attribute.id);
    const base = `/attributes/${attribute.id}/values`;

    expectError(await http().post(base).set(admin).send({}), 400, 'VALIDATION_FAILED', 'value');
    expectError(
      await http().post(base).set(admin).send({ value: null }),
      400,
      'VALIDATION_FAILED',
      'value',
    );
    expectError(
      await http().patch(`${base}/${existing.id}`).set(admin).send({ value: null }),
      400,
      'VALIDATION_FAILED',
      'value',
    );
  });

  it('refuses attributeId in a create or update body', async () => {
    const attribute = await createAttribute();
    const other = await createAttribute();
    const existing = await createValue(attribute.id);
    const base = `/attributes/${attribute.id}/values`;

    expectError(
      await http().post(base).set(admin).send({ value: 'Ok', attributeId: other.id }),
      400,
      'VALIDATION_FAILED',
      'attributeId',
    );
    expectError(
      await http().patch(`${base}/${existing.id}`).set(admin).send({ attributeId: other.id }),
      400,
      'VALIDATION_FAILED',
      'attributeId',
    );
    expect(
      await testApp.prisma.attributeValue.count({
        where: { id: existing.id, attributeId: attribute.id },
      }),
    ).toBe(1);
  });
});

describe('attribute values: errors', () => {
  it('refuses a duplicate value within one attribute on create and rename', async () => {
    const attribute = await createAttribute();
    const one = await createValue(attribute.id);
    const other = await createValue(attribute.id);
    const base = `/attributes/${attribute.id}/values`;

    expectError(
      await http().post(base).set(admin).send({ value: one.value }),
      409,
      'ALREADY_EXISTS',
      'value',
    );
    expectError(
      await http().patch(`${base}/${other.id}`).set(admin).send({ value: one.value }),
      409,
      'ALREADY_EXISTS',
      'value',
    );
  });

  it('allows the same value under two attributes', async () => {
    const first = await createAttribute();
    const second = await createAttribute();
    const text = `Shared ${randomUUID()}`;

    await createValue(first.id, text);
    const response = await http()
      .post(`/attributes/${second.id}/values`)
      .set(admin)
      .send({ value: text });

    expect(response.status).toBe(201);
  });

  it('refuses to delete a value linked to a product with 409 IN_USE, then deletes it', async () => {
    const attribute = await createAttribute();
    const value = await createValue(attribute.id);
    const brand = await testApp.prisma.brand.create({ data: { name: `Brand ${randomUUID()}` } });
    const category = await testApp.prisma.category.create({
      data: { name: `Category ${randomUUID()}`, slug: randomUUID(), isActive: true },
    });
    const product = await testApp.prisma.product.create({
      data: {
        article: `ART-${randomUUID()}`,
        name: 'Product',
        price: '10.00',
        brandId: brand.id,
        categoryId: category.id,
      },
    });
    await testApp.prisma.productAttributeValue.create({
      data: { productId: product.id, attributeValueId: value.id },
    });
    const path = `/attributes/${attribute.id}/values/${value.id}`;

    expectError(await http().delete(path).set(admin), 409, 'IN_USE');
    expect(await testApp.prisma.attributeValue.count({ where: { id: value.id } })).toBe(1);

    await testApp.prisma.productAttributeValue.deleteMany({
      where: { attributeValueId: value.id },
    });
    expect((await http().delete(path).set(admin)).status).toBe(204);
  });

  it('answers 400 INVALID_ID for a malformed attribute id or value id', async () => {
    const attribute = await createAttribute();

    expectError(await http().get('/attributes/not-a-uuid/values'), 400, 'INVALID_ID');
    expectError(
      await http().post('/attributes/not-a-uuid/values').set(admin).send({ value: 'x' }),
      400,
      'INVALID_ID',
    );
    expectError(
      await http().get(`/attributes/${attribute.id}/values/not-a-uuid`),
      400,
      'INVALID_ID',
    );
    expectError(
      await http()
        .patch(`/attributes/${attribute.id}/values/not-a-uuid`)
        .set(admin)
        .send({ value: 'x' }),
      400,
      'INVALID_ID',
    );
    expectError(
      await http().delete(`/attributes/${attribute.id}/values/not-a-uuid`).set(admin),
      400,
      'INVALID_ID',
    );
  });

  it('answers 404 NOT_FOUND, not RELATED_NOT_FOUND, for a missing attribute', async () => {
    const id = randomUUID();

    expectError(await http().get(`/attributes/${id}/values`), 404, 'NOT_FOUND');
    expectError(
      await http().post(`/attributes/${id}/values`).set(admin).send({ value: 'x' }),
      404,
      'NOT_FOUND',
    );
  });

  it('answers 404 NOT_FOUND for an unknown value id on get, update and delete', async () => {
    const attribute = await createAttribute();
    const path = `/attributes/${attribute.id}/values/${randomUUID()}`;

    expectError(await http().get(path), 404, 'NOT_FOUND');
    expectError(await http().patch(path).set(admin).send({ value: 'x' }), 404, 'NOT_FOUND');
    expectError(await http().delete(path).set(admin), 404, 'NOT_FOUND');
  });

  it('answers 404 for a value under another attribute and leaves it untouched', async () => {
    const owner = await createAttribute();
    const other = await createAttribute();
    const value = await createValue(owner.id);
    const path = `/attributes/${other.id}/values/${value.id}`;

    expectError(await http().get(path), 404, 'NOT_FOUND');
    expectError(await http().patch(path).set(admin).send({ value: 'Changed' }), 404, 'NOT_FOUND');
    expectError(await http().delete(path).set(admin), 404, 'NOT_FOUND');

    const stored = await testApp.prisma.attributeValue.findUnique({ where: { id: value.id } });
    expect(stored).toMatchObject({ attributeId: owner.id, value: value.value });
  });
});
