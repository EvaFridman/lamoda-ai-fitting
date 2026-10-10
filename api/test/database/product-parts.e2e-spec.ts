import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp } from '../support/test-app.js';

const ADMIN_TOKEN = 'test-admin-token-0123456789abcdef';
// MEDIA_BASE_URL of the test environment (vitest.config.ts).
const MEDIA = 'http://localhost:3001/media/';

interface Image {
  id: string;
  productId: string;
  imageKey: string;
  url: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface Size {
  id: string;
  productId: string;
  size: string;
  stock: number;
  createdAt: string;
  updatedAt: string;
}

interface Link {
  productId: string;
  attributeValueId: string;
  attribute: { id: string; name: string };
  value: { id: string; value: string };
  createdAt: string;
}

interface Detail {
  id: string;
  images: { id: string; url: string; sortOrder: number }[];
  variations: { id: string; size: string; stock: number }[];
  attributes: {
    attribute: { id: string; name: string };
    values: { id: string; value: string }[];
  }[];
}

interface Page<T> {
  items: T[];
  total: number;
}

let testApp: TestApp;
let brandId: string;
let categoryId: string;

beforeAll(async () => {
  testApp = await createTestApp();
  const brand = await testApp.prisma.brand.create({ data: { name: `Brand ${randomUUID()}` } });
  const category = await testApp.prisma.category.create({
    data: { name: `Category ${randomUUID()}`, slug: randomUUID(), isActive: true },
  });
  brandId = brand.id;
  categoryId = category.id;
});

afterAll(async () => {
  await testApp.close();
});

const http = () => request(testApp.app.getHttpServer());
const admin = { 'X-Admin-Token': ADMIN_TOKEN };

async function createProduct(): Promise<{ id: string }> {
  const response = await http()
    .post('/products')
    .set(admin)
    .send({ article: `ART-${randomUUID()}`, name: 'Dress', price: 100, brandId, categoryId });
  expect(response.status).toBe(201);
  return response.body as { id: string };
}

async function createImage(productId: string, body: Record<string, unknown> = {}): Promise<Image> {
  const response = await http()
    .post(`/products/${productId}/images`)
    .set(admin)
    .send({ imageKey: `p/${randomUUID()}.jpg`, ...body });
  expect(response.status).toBe(201);
  return response.body as Image;
}

async function createSize(
  productId: string,
  size = randomUUID().slice(0, 8),
  stock = 3,
): Promise<Size> {
  const response = await http()
    .post(`/products/${productId}/variations`)
    .set(admin)
    .send({ size, stock });
  expect(response.status).toBe(201);
  return response.body as Size;
}

async function createValue(name = `Attr ${randomUUID()}`, value = `Val ${randomUUID()}`) {
  const attribute = await testApp.prisma.attribute.create({ data: { name } });
  const row = await testApp.prisma.attributeValue.create({
    data: { attributeId: attribute.id, value },
  });
  return { attribute, value: row };
}

async function link(productId: string, attributeValueId: string): Promise<Link> {
  const response = await http()
    .post(`/products/${productId}/attribute-values`)
    .set(admin)
    .send({ attributeValueId });
  expect(response.status).toBe(201);
  return response.body as Link;
}

async function detail(productId: string): Promise<Detail> {
  const response = await http().get(`/products/${productId}`);
  expect(response.status).toBe(200);
  return response.body as Detail;
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
    expect(error.details.map((d) => d.field)).toContain(field);
  }
}

const keys = (body: unknown) => Object.keys(body as object).sort();

describe('product images', () => {
  it('creates with 201, exact keys, url from the media base and sortOrder 0 by default', async () => {
    const product = await createProduct();
    const imageKey = `products/${randomUUID()}.jpg`;
    const response = await http()
      .post(`/products/${product.id}/images`)
      .set(admin)
      .send({ imageKey });

    expect(response.status).toBe(201);
    expect(keys(response.body)).toEqual([
      'createdAt',
      'id',
      'imageKey',
      'productId',
      'sortOrder',
      'updatedAt',
      'url',
    ]);
    expect(response.body).toMatchObject({
      productId: product.id,
      imageKey,
      url: `${MEDIA}${imageKey}`,
      sortOrder: 0,
    });
  });

  it('allows repeated sortOrder and imageKey', async () => {
    const product = await createProduct();
    const first = await createImage(product.id, { imageKey: 'same.jpg', sortOrder: 1 });
    const second = await createImage(product.id, { imageKey: 'same.jpg', sortOrder: 1 });

    expect(second.id).not.toBe(first.id);
  });

  it('reads one, lists ordered by sortOrder then id, and pages', async () => {
    const product = await createProduct();
    const c = await createImage(product.id, { sortOrder: 5 });
    const a = await createImage(product.id, { sortOrder: 1 });
    const b = await createImage(product.id, { sortOrder: 1 });
    const [first, second] = [a, b].sort((x, y) => x.id.localeCompare(y.id));

    expect((await http().get(`/products/${product.id}/images/${c.id}`)).body).toEqual(c);
    const all = await http().get(`/products/${product.id}/images`);
    expect(all.status).toBe(200);
    expect(all.body).toEqual({ items: [first, second, c], total: 3 });
    const page = await http().get(`/products/${product.id}/images?limit=1&offset=2`);
    expect(page.body).toEqual({ items: [c], total: 3 });
  });

  it('updates every field with 200', async () => {
    const product = await createProduct();
    const image = await createImage(product.id);
    const response = await http()
      .patch(`/products/${product.id}/images/${image.id}`)
      .set(admin)
      .send({ imageKey: 'new/key.png', sortOrder: 7 });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: image.id,
      imageKey: 'new/key.png',
      url: `${MEDIA}new/key.png`,
      sortOrder: 7,
    });
  });

  it('answers 200 with the record unchanged for an empty body', async () => {
    const product = await createProduct();
    const image = await createImage(product.id);
    const response = await http()
      .patch(`/products/${product.id}/images/${image.id}`)
      .set(admin)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual(image);
  });

  it('deletes with 204 and then answers 404', async () => {
    const product = await createProduct();
    const image = await createImage(product.id);
    const path = `/products/${product.id}/images/${image.id}`;
    const response = await http().delete(path).set(admin);

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expectError(await http().get(path), 404, 'NOT_FOUND');
  });

  it.each(['../x', '/abs', '', 'a/../b'])('refuses the imageKey %j', async (imageKey) => {
    const product = await createProduct();
    const image = await createImage(product.id);

    expectError(
      await http().post(`/products/${product.id}/images`).set(admin).send({ imageKey }),
      400,
      'VALIDATION_FAILED',
      'imageKey',
    );
    expectError(
      await http()
        .patch(`/products/${product.id}/images/${image.id}`)
        .set(admin)
        .send({ imageKey }),
      400,
      'VALIDATION_FAILED',
      'imageKey',
    );
  });

  it('refuses a negative or non-integer sortOrder, nulls, a missing key and productId', async () => {
    const product = await createProduct();
    const image = await createImage(product.id);
    const base = `/products/${product.id}/images`;

    expectError(
      await http().post(base).set(admin).send({ imageKey: 'a.jpg', sortOrder: -1 }),
      400,
      'VALIDATION_FAILED',
      'sortOrder',
    );
    expectError(
      await http().post(base).set(admin).send({ imageKey: 'a.jpg', sortOrder: 1.5 }),
      400,
      'VALIDATION_FAILED',
      'sortOrder',
    );
    expectError(await http().post(base).set(admin).send({}), 400, 'VALIDATION_FAILED', 'imageKey');
    expectError(
      await http().post(base).set(admin).send({ imageKey: 'a.jpg', sortOrder: null }),
      400,
      'VALIDATION_FAILED',
      'sortOrder',
    );
    expectError(
      await http().patch(`${base}/${image.id}`).set(admin).send({ imageKey: null }),
      400,
      'VALIDATION_FAILED',
      'imageKey',
    );
    expectError(
      await http().patch(`${base}/${image.id}`).set(admin).send({ sortOrder: null }),
      400,
      'VALIDATION_FAILED',
      'sortOrder',
    );
    expectError(
      await http().post(base).set(admin).send({ imageKey: 'a.jpg', productId: randomUUID() }),
      400,
      'VALIDATION_FAILED',
      'productId',
    );
    expectError(
      await http().patch(`${base}/${image.id}`).set(admin).send({ productId: randomUUID() }),
      400,
      'VALIDATION_FAILED',
      'productId',
    );
  });

  it('refuses writes without a token and reads without one', async () => {
    const product = await createProduct();
    const image = await createImage(product.id);
    const base = `/products/${product.id}/images`;

    expect((await http().get(base)).status).toBe(200);
    expect((await http().get(`${base}/${image.id}`)).status).toBe(200);
    expectError(await http().post(base).send({ imageKey: 'a.jpg' }), 401, 'UNAUTHORIZED');
    expectError(
      await http().patch(`${base}/${image.id}`).send({ sortOrder: 2 }),
      401,
      'UNAUTHORIZED',
    );
    expectError(await http().delete(`${base}/${image.id}`), 401, 'UNAUTHORIZED');
    expect(await testApp.prisma.productImage.count({ where: { id: image.id } })).toBe(1);
  });

  it('answers 404 for a missing product on list, create and get', async () => {
    const base = `/products/${randomUUID()}/images`;

    expectError(await http().get(base), 404, 'NOT_FOUND');
    expectError(await http().post(base).set(admin).send({ imageKey: 'a.jpg' }), 404, 'NOT_FOUND');
    expectError(await http().get(`${base}/${randomUUID()}`), 404, 'NOT_FOUND');
  });

  it('answers 404 for an image of another product and leaves it untouched', async () => {
    const owner = await createProduct();
    const other = await createProduct();
    const image = await createImage(owner.id, { sortOrder: 2 });
    const path = `/products/${other.id}/images/${image.id}`;

    expectError(await http().get(path), 404, 'NOT_FOUND');
    expectError(await http().patch(path).set(admin).send({ sortOrder: 9 }), 404, 'NOT_FOUND');
    expectError(await http().patch(path).set(admin).send({}), 404, 'NOT_FOUND');
    expectError(await http().delete(path).set(admin), 404, 'NOT_FOUND');
    expect(await testApp.prisma.productImage.findUnique({ where: { id: image.id } })).toMatchObject(
      { productId: owner.id, sortOrder: 2 },
    );
  });

  it('answers 400 INVALID_ID for a malformed id', async () => {
    const product = await createProduct();

    expectError(await http().get('/products/not-a-uuid/images'), 400, 'INVALID_ID');
    expectError(await http().get(`/products/${product.id}/images/not-a-uuid`), 400, 'INVALID_ID');
    expectError(
      await http().delete(`/products/${product.id}/images/not-a-uuid`).set(admin),
      400,
      'INVALID_ID',
    );
  });

  it('shows changes in the product detail', async () => {
    const product = await createProduct();
    const image = await createImage(product.id, { sortOrder: 3 });
    expect((await detail(product.id)).images).toEqual([
      { id: image.id, url: image.url, sortOrder: 3 },
    ]);

    await http().delete(`/products/${product.id}/images/${image.id}`).set(admin);
    expect((await detail(product.id)).images).toEqual([]);
  });
});

describe('product sizes', () => {
  it('creates with 201 and exact keys', async () => {
    const product = await createProduct();
    const response = await http()
      .post(`/products/${product.id}/variations`)
      .set(admin)
      .send({ size: 'M', stock: 4 });

    expect(response.status).toBe(201);
    expect(keys(response.body)).toEqual([
      'createdAt',
      'id',
      'productId',
      'size',
      'stock',
      'updatedAt',
    ]);
    expect(response.body).toMatchObject({ productId: product.id, size: 'M', stock: 4 });
  });

  it('reads one, lists by id and pages', async () => {
    const product = await createProduct();
    const first = await createSize(product.id);
    const sizes = [first, await createSize(product.id), await createSize(product.id)];
    const ordered = [...sizes].sort((x, y) => x.id.localeCompare(y.id));
    const base = `/products/${product.id}/variations`;

    expect((await http().get(`${base}/${first.id}`)).body).toEqual(first);
    expect((await http().get(base)).body).toEqual({ items: ordered, total: 3 });
    expect((await http().get(`${base}?limit=1&offset=1`)).body).toEqual({
      items: [ordered[1]],
      total: 3,
    });
  });

  it('updates every field with 200', async () => {
    const product = await createProduct();
    const size = await createSize(product.id);
    const response = await http()
      .patch(`/products/${product.id}/variations/${size.id}`)
      .set(admin)
      .send({ size: 'XL', stock: 0 });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: size.id, size: 'XL', stock: 0 });
  });

  it('answers 200 with the record unchanged for an empty body', async () => {
    const product = await createProduct();
    const size = await createSize(product.id);
    const response = await http()
      .patch(`/products/${product.id}/variations/${size.id}`)
      .set(admin)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual(size);
  });

  it('deletes with 204 and then answers 404', async () => {
    const product = await createProduct();
    const size = await createSize(product.id);
    const path = `/products/${product.id}/variations/${size.id}`;
    const response = await http().delete(path).set(admin);

    expect(response.status).toBe(204);
    expectError(await http().get(path), 404, 'NOT_FOUND');
  });

  it('refuses a duplicate size on create and rename, allows it on another product', async () => {
    const product = await createProduct();
    const other = await createProduct();
    const taken = await createSize(product.id, 'S');
    const second = await createSize(product.id, 'L');
    const base = `/products/${product.id}/variations`;

    expectError(
      await http().post(base).set(admin).send({ size: taken.size, stock: 1 }),
      409,
      'ALREADY_EXISTS',
      'size',
    );
    expectError(
      await http().patch(`${base}/${second.id}`).set(admin).send({ size: taken.size }),
      409,
      'ALREADY_EXISTS',
      'size',
    );
    expect((await createSize(other.id, 'S')).size).toBe('S');
  });

  it.each([' M', 'M ', '', 'x'.repeat(21)])('refuses the size %j', async (size) => {
    const product = await createProduct();
    const existing = await createSize(product.id);

    expectError(
      await http().post(`/products/${product.id}/variations`).set(admin).send({ size, stock: 1 }),
      400,
      'VALIDATION_FAILED',
      'size',
    );
    expectError(
      await http()
        .patch(`/products/${product.id}/variations/${existing.id}`)
        .set(admin)
        .send({ size }),
      400,
      'VALIDATION_FAILED',
      'size',
    );
  });

  it('accepts a size of 20 characters', async () => {
    const product = await createProduct();

    expect((await createSize(product.id, 'x'.repeat(20))).size).toHaveLength(20);
  });

  it('refuses negative stock, missing fields, nulls and productId', async () => {
    const product = await createProduct();
    const existing = await createSize(product.id);
    const base = `/products/${product.id}/variations`;

    expectError(
      await http().post(base).set(admin).send({ size: 'Q', stock: -1 }),
      400,
      'VALIDATION_FAILED',
      'stock',
    );
    expectError(
      await http().patch(`${base}/${existing.id}`).set(admin).send({ stock: -1 }),
      400,
      'VALIDATION_FAILED',
      'stock',
    );
    expectError(
      await http().post(base).set(admin).send({ size: 'Q' }),
      400,
      'VALIDATION_FAILED',
      'stock',
    );
    expectError(
      await http().post(base).set(admin).send({ stock: 1 }),
      400,
      'VALIDATION_FAILED',
      'size',
    );
    expectError(
      await http().patch(`${base}/${existing.id}`).set(admin).send({ size: null }),
      400,
      'VALIDATION_FAILED',
      'size',
    );
    expectError(
      await http().patch(`${base}/${existing.id}`).set(admin).send({ stock: null }),
      400,
      'VALIDATION_FAILED',
      'stock',
    );
    expectError(
      await http().post(base).set(admin).send({ size: 'Q', stock: 1, productId: randomUUID() }),
      400,
      'VALIDATION_FAILED',
      'productId',
    );
    expectError(
      await http().patch(`${base}/${existing.id}`).set(admin).send({ productId: randomUUID() }),
      400,
      'VALIDATION_FAILED',
      'productId',
    );
  });

  it('refuses writes without a token and reads without one', async () => {
    const product = await createProduct();
    const size = await createSize(product.id);
    const base = `/products/${product.id}/variations`;

    expect((await http().get(base)).status).toBe(200);
    expect((await http().get(`${base}/${size.id}`)).status).toBe(200);
    expectError(await http().post(base).send({ size: 'Z', stock: 1 }), 401, 'UNAUTHORIZED');
    expectError(await http().patch(`${base}/${size.id}`).send({ stock: 2 }), 401, 'UNAUTHORIZED');
    expectError(await http().delete(`${base}/${size.id}`), 401, 'UNAUTHORIZED');
  });

  it('answers 404 for a missing product on list, create and get', async () => {
    const base = `/products/${randomUUID()}/variations`;

    expectError(await http().get(base), 404, 'NOT_FOUND');
    expectError(await http().post(base).set(admin).send({ size: 'M', stock: 1 }), 404, 'NOT_FOUND');
    expectError(await http().get(`${base}/${randomUUID()}`), 404, 'NOT_FOUND');
  });

  it('answers 404 for a size of another product and leaves it untouched', async () => {
    const owner = await createProduct();
    const other = await createProduct();
    const size = await createSize(owner.id, 'S', 2);
    const path = `/products/${other.id}/variations/${size.id}`;

    expectError(await http().get(path), 404, 'NOT_FOUND');
    expectError(await http().patch(path).set(admin).send({ stock: 9 }), 404, 'NOT_FOUND');
    expectError(await http().delete(path).set(admin), 404, 'NOT_FOUND');
    expect(
      await testApp.prisma.productVariation.findUnique({ where: { id: size.id } }),
    ).toMatchObject({ productId: owner.id, stock: 2 });
  });

  it('answers 400 INVALID_ID for a malformed id', async () => {
    const product = await createProduct();

    expectError(await http().get('/products/not-a-uuid/variations'), 400, 'INVALID_ID');
    expectError(
      await http().get(`/products/${product.id}/variations/not-a-uuid`),
      400,
      'INVALID_ID',
    );
  });

  it('shows changes in the product detail', async () => {
    const product = await createProduct();
    const size = await createSize(product.id, 'M', 5);

    expect((await detail(product.id)).variations).toEqual([{ id: size.id, size: 'M', stock: 5 }]);
    await http()
      .patch(`/products/${product.id}/variations/${size.id}`)
      .set(admin)
      .send({ stock: 8 });
    expect((await detail(product.id)).variations[0]).toMatchObject({ stock: 8 });
  });
});

describe('product attribute values', () => {
  it('links with 201 and exact keys', async () => {
    const product = await createProduct();
    const { attribute, value } = await createValue();
    const response = await http()
      .post(`/products/${product.id}/attribute-values`)
      .set(admin)
      .send({ attributeValueId: value.id });

    expect(response.status).toBe(201);
    expect(keys(response.body)).toEqual([
      'attribute',
      'attributeValueId',
      'createdAt',
      'productId',
      'value',
    ]);
    expect(keys((response.body as Link).attribute)).toEqual(['id', 'name']);
    expect(keys((response.body as Link).value)).toEqual(['id', 'value']);
    expect(response.body).toMatchObject({
      productId: product.id,
      attributeValueId: value.id,
      attribute: { id: attribute.id, name: attribute.name },
      value: { id: value.id, value: value.value },
    });
  });

  it('reads one, lists by attribute name then value and pages', async () => {
    const product = await createProduct();
    const tag = randomUUID();
    const b1 = await createValue(`b ${tag}`, 'y');
    const a2 = await createValue(`a ${tag}`, 'z');
    const sameAttribute = await testApp.prisma.attributeValue.create({
      data: { attributeId: a2.attribute.id, value: 'a' },
    });
    const l1 = await link(product.id, a2.value.id);
    const l2 = await link(product.id, b1.value.id);
    const l0 = await link(product.id, sameAttribute.id);
    const base = `/products/${product.id}/attribute-values`;

    expect((await http().get(`${base}/${b1.value.id}`)).body).toEqual(l2);
    const all = await http().get(base);
    expect(all.status).toBe(200);
    const page = all.body as Page<Link>;
    expect(page).toEqual({ items: [l0, l1, l2], total: 3 });
    expect((await http().get(`${base}?limit=1&offset=1`)).body).toEqual({
      items: [l1],
      total: 3,
    });
  });

  it('refuses a missing attribute value with 400 RELATED_NOT_FOUND', async () => {
    const product = await createProduct();

    expectError(
      await http()
        .post(`/products/${product.id}/attribute-values`)
        .set(admin)
        .send({ attributeValueId: randomUUID() }),
      400,
      'RELATED_NOT_FOUND',
      'attributeValueId',
    );
  });

  it('refuses a repeated link with 409 ALREADY_EXISTS', async () => {
    const product = await createProduct();
    const { value } = await createValue();
    await link(product.id, value.id);

    expectError(
      await http()
        .post(`/products/${product.id}/attribute-values`)
        .set(admin)
        .send({ attributeValueId: value.id }),
      409,
      'ALREADY_EXISTS',
      'attributeValueId',
    );
  });

  it('refuses a missing, null, malformed or extra body field', async () => {
    const product = await createProduct();
    const base = `/products/${product.id}/attribute-values`;

    expectError(await http().post(base).set(admin).send({}), 400, 'VALIDATION_FAILED');
    expectError(
      await http().post(base).set(admin).send({ attributeValueId: null }),
      400,
      'VALIDATION_FAILED',
      'attributeValueId',
    );
    expectError(
      await http().post(base).set(admin).send({ attributeValueId: 'nope' }),
      400,
      'VALIDATION_FAILED',
      'attributeValueId',
    );
    expectError(
      await http().post(base).set(admin).send({ attributeValueId: randomUUID(), productId: 'x' }),
      400,
      'VALIDATION_FAILED',
      'productId',
    );
  });

  it('removes a link with 204; an unlinked value answers 404 on get and delete', async () => {
    const product = await createProduct();
    const { value } = await createValue();
    const unlinked = await createValue();
    const base = `/products/${product.id}/attribute-values`;
    await link(product.id, value.id);

    const response = await http().delete(`${base}/${value.id}`).set(admin);
    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expectError(await http().get(`${base}/${value.id}`), 404, 'NOT_FOUND');
    expectError(await http().get(`${base}/${unlinked.value.id}`), 404, 'NOT_FOUND');
    expectError(await http().delete(`${base}/${unlinked.value.id}`).set(admin), 404, 'NOT_FOUND');
    expect(await testApp.prisma.attributeValue.count({ where: { id: value.id } })).toBe(1);
  });

  it('has no PATCH', async () => {
    const product = await createProduct();
    const { value } = await createValue();
    await link(product.id, value.id);
    const response = await http()
      .patch(`/products/${product.id}/attribute-values/${value.id}`)
      .set(admin)
      .send({});

    expect(response.status).toBe(404);
  });

  it('refuses writes without a token and reads without one', async () => {
    const product = await createProduct();
    const { value } = await createValue();
    await link(product.id, value.id);
    const base = `/products/${product.id}/attribute-values`;

    expect((await http().get(base)).status).toBe(200);
    expect((await http().get(`${base}/${value.id}`)).status).toBe(200);
    expectError(await http().post(base).send({ attributeValueId: value.id }), 401, 'UNAUTHORIZED');
    expectError(await http().delete(`${base}/${value.id}`), 401, 'UNAUTHORIZED');
    expect(
      await testApp.prisma.productAttributeValue.count({ where: { productId: product.id } }),
    ).toBe(1);
  });

  it('answers 404 for a missing product on list, create and get', async () => {
    const base = `/products/${randomUUID()}/attribute-values`;
    const { value } = await createValue();

    expectError(await http().get(base), 404, 'NOT_FOUND');
    expectError(
      await http().post(base).set(admin).send({ attributeValueId: value.id }),
      404,
      'NOT_FOUND',
    );
    expectError(await http().get(`${base}/${value.id}`), 404, 'NOT_FOUND');
  });

  it('answers 404 for a link of another product and leaves it', async () => {
    const owner = await createProduct();
    const other = await createProduct();
    const { value } = await createValue();
    await link(owner.id, value.id);
    const path = `/products/${other.id}/attribute-values/${value.id}`;

    expectError(await http().get(path), 404, 'NOT_FOUND');
    expectError(await http().delete(path).set(admin), 404, 'NOT_FOUND');
    expect(
      await testApp.prisma.productAttributeValue.count({ where: { productId: owner.id } }),
    ).toBe(1);
  });

  it('answers 400 INVALID_ID for a malformed id', async () => {
    const product = await createProduct();

    expectError(await http().get('/products/not-a-uuid/attribute-values'), 400, 'INVALID_ID');
    expectError(
      await http().get(`/products/${product.id}/attribute-values/not-a-uuid`),
      400,
      'INVALID_ID',
    );
  });

  it('shows changes in the product detail', async () => {
    const product = await createProduct();
    const { attribute, value } = await createValue();
    await link(product.id, value.id);

    expect((await detail(product.id)).attributes).toEqual([
      {
        attribute: { id: attribute.id, name: attribute.name },
        values: [{ id: value.id, value: value.value }],
      },
    ]);
    await http().delete(`/products/${product.id}/attribute-values/${value.id}`).set(admin);
    expect((await detail(product.id)).attributes).toEqual([]);
  });

  it('keeps a linked value from being deleted with 409 IN_USE', async () => {
    const product = await createProduct();
    const { attribute, value } = await createValue();
    await link(product.id, value.id);

    expectError(
      await http().delete(`/attributes/${attribute.id}/values/${value.id}`).set(admin),
      409,
      'IN_USE',
    );
  });
});
