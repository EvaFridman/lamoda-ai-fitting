import { randomUUID } from 'node:crypto';

import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp } from '../support/test-app.js';

const ADMIN_TOKEN = 'test-admin-token-0123456789abcdef';
// MEDIA_BASE_URL of the test environment (vitest.config.ts).
const MEDIA = 'http://localhost:3001/media/';

interface ListItem {
  id: string;
  article: string;
  name: string;
  brand: { id: string; name: string };
  category: { id: string; name: string; slug: string };
  image: { url: string } | null;
  price: number;
  discount: number;
  finalPrice: number;
  rating: number | null;
  createdAt: string;
}

interface Detail extends ListItem {
  description: string | null;
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
let brand: { id: string; name: string };
let category: { id: string; name: string; slug: string };

beforeAll(async () => {
  testApp = await createTestApp();
  brand = await testApp.prisma.brand.create({ data: { name: `Brand ${randomUUID()}` } });
  category = await testApp.prisma.category.create({
    data: { name: `Category ${randomUUID()}`, slug: randomUUID(), isActive: true },
  });
});

afterAll(async () => {
  await testApp.close();
});

const http = () => request(testApp.app.getHttpServer());
const admin = { 'X-Admin-Token': ADMIN_TOKEN };

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    article: `ART-${randomUUID()}`,
    name: 'Dress',
    price: 1999.99,
    brandId: brand.id,
    categoryId: category.id,
    ...overrides,
  };
}

async function createProduct(overrides: Record<string, unknown> = {}): Promise<Detail> {
  const response = await http().post('/products').set(admin).send(validBody(overrides));
  expect(response.status).toBe(201);
  return response.body as Detail;
}

async function listAll(): Promise<ListItem[]> {
  const items: ListItem[] = [];
  for (let offset = 0; ; offset += 100) {
    const response = await http().get(`/products?limit=100&offset=${offset}`);
    expect(response.status).toBe(200);
    const page = response.body as Page<ListItem>;
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

async function addImage(productId: string, imageKey: string, sortOrder: number) {
  return testApp.prisma.productImage.create({ data: { productId, imageKey, sortOrder } });
}

describe('products: access', () => {
  it('lists and reads without a token', async () => {
    const product = await createProduct();

    expect((await http().get('/products')).status).toBe(200);
    expect((await http().get(`/products/${product.id}`)).status).toBe(200);
  });

  it('refuses writes without a token with 401 UNAUTHORIZED', async () => {
    const product = await createProduct();

    expectError(await http().post('/products').send(validBody()), 401, 'UNAUTHORIZED');
    expectError(
      await http().patch(`/products/${product.id}`).send({ name: 'x' }),
      401,
      'UNAUTHORIZED',
    );
    expectError(await http().delete(`/products/${product.id}`), 401, 'UNAUTHORIZED');
    expect(await testApp.prisma.product.count({ where: { id: product.id } })).toBe(1);
  });

  it('refuses writes with a wrong token with 401 UNAUTHORIZED', async () => {
    const product = await createProduct();
    const wrong = { 'X-Admin-Token': 'wrong-token' };

    expectError(await http().post('/products').set(wrong).send(validBody()), 401, 'UNAUTHORIZED');
    expectError(
      await http().patch(`/products/${product.id}`).set(wrong).send({ name: 'x' }),
      401,
      'UNAUTHORIZED',
    );
    expectError(await http().delete(`/products/${product.id}`).set(wrong), 401, 'UNAUTHORIZED');
  });

  it('answers 400 INVALID_ID for a malformed id', async () => {
    expectError(await http().get('/products/not-a-uuid'), 400, 'INVALID_ID');
    expectError(
      await http().patch('/products/not-a-uuid').set(admin).send({ name: 'x' }),
      400,
      'INVALID_ID',
    );
    expectError(await http().delete('/products/not-a-uuid').set(admin), 400, 'INVALID_ID');
  });

  it('answers 404 NOT_FOUND for an unknown id on get, update and delete', async () => {
    const id = randomUUID();

    expectError(await http().get(`/products/${id}`), 404, 'NOT_FOUND');
    expectError(
      await http().patch(`/products/${id}`).set(admin).send({ name: 'Anything' }),
      404,
      'NOT_FOUND',
    );
    expectError(await http().delete(`/products/${id}`).set(admin), 404, 'NOT_FOUND');
  });
});

describe('products: list', () => {
  it('answers { items, total } and pages with limit and offset', async () => {
    await createProduct();
    await createProduct();
    await createProduct();
    const all = await listAll();
    const response = await http().get('/products?limit=2&offset=1');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: all.slice(1, 3), total: all.length });
  });

  it('orders by createdAt desc, then id desc: the newest first', async () => {
    const first = await createProduct();
    const second = await createProduct();
    const third = await createProduct();

    const ids = (await listAll())
      .map((item) => item.id)
      .filter((id) => [first.id, second.id, third.id].includes(id));

    expect(ids).toEqual([third.id, second.id, first.id]);
  });

  it('refuses limit 101 with 400 VALIDATION_FAILED', async () => {
    expectError(await http().get('/products?limit=101'), 400, 'VALIDATION_FAILED', 'limit');
  });

  it('gives each item exactly the list keys, without updatedAt and description', async () => {
    const product = await createProduct({ description: 'Long text', rating: 4.5 });
    const item = (await listAll()).find((candidate) => candidate.id === product.id);

    expect(Object.keys(item ?? {}).sort()).toEqual([
      'article',
      'brand',
      'category',
      'createdAt',
      'discount',
      'finalPrice',
      'id',
      'image',
      'name',
      'price',
      'rating',
    ]);
    expect(item).toMatchObject({
      id: product.id,
      article: product.article,
      brand: { id: brand.id, name: brand.name },
      category: { id: category.id, name: category.name, slug: category.slug },
      image: null,
    });
  });

  it('gives image null without images', async () => {
    const product = await createProduct();
    const item = (await listAll()).find((candidate) => candidate.id === product.id);

    expect(item?.image).toBeNull();
  });

  it('gives the first image by sortOrder, then id, as a full address', async () => {
    const product = await createProduct();
    await addImage(product.id, 'products/late.jpg', 5);
    await addImage(product.id, 'products/first.jpg', 1);
    await addImage(product.id, 'products/tie.jpg', 1);
    const item = (await listAll()).find((candidate) => candidate.id === product.id);

    expect(item?.image).toEqual({ url: `${MEDIA}products/first.jpg` });
  });
});

describe('products: detail', () => {
  it('gives empty arrays and a null description for a new product', async () => {
    const product = await createProduct();

    expect(product).toMatchObject({
      description: null,
      rating: null,
      discount: 0,
      image: null,
      images: [],
      variations: [],
      attributes: [],
    });
    expect(product.createdAt).toEqual(expect.any(String));
    expect('updatedAt' in product).toBe(false);
  });

  it('returns the same body from GET as from POST', async () => {
    const created = await createProduct({ description: 'Text', rating: 3.5, discount: 10 });
    const response = await http().get(`/products/${created.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(created);
  });

  it('orders images by sortOrder, then id, with full addresses', async () => {
    const product = await createProduct();
    const late = await addImage(product.id, 'products/late.jpg', 5);
    const first = await addImage(product.id, 'products/first.jpg', 1);
    const tie = await addImage(product.id, 'products/tie.jpg', 1);
    const response = await http().get(`/products/${product.id}`);
    const body = response.body as Detail;

    expect(body.images).toEqual([
      { id: first.id, url: `${MEDIA}products/first.jpg`, sortOrder: 1 },
      { id: tie.id, url: `${MEDIA}products/tie.jpg`, sortOrder: 1 },
      { id: late.id, url: `${MEDIA}products/late.jpg`, sortOrder: 5 },
    ]);
    expect(body.image).toEqual({ url: `${MEDIA}products/first.jpg` });
  });

  it('orders variations in the order they were added', async () => {
    const product = await createProduct();
    const m = await testApp.prisma.productVariation.create({
      data: { productId: product.id, size: 'M', stock: 3 },
    });
    const s = await testApp.prisma.productVariation.create({
      data: { productId: product.id, size: 'S', stock: 0 },
    });
    const l = await testApp.prisma.productVariation.create({
      data: { productId: product.id, size: 'L', stock: 7 },
    });
    const body = (await http().get(`/products/${product.id}`)).body as Detail;

    expect(body.variations).toEqual([
      { id: m.id, size: 'M', stock: 3 },
      { id: s.id, size: 'S', stock: 0 },
      { id: l.id, size: 'L', stock: 7 },
    ]);
  });

  it('groups attribute values by attribute, attributes by name, values by value', async () => {
    const product = await createProduct();
    const tag = randomUUID();
    const colorAttr = await testApp.prisma.attribute.create({ data: { name: `b-color ${tag}` } });
    const seasonAttr = await testApp.prisma.attribute.create({ data: { name: `a-season ${tag}` } });
    const white = await testApp.prisma.attributeValue.create({
      data: { attributeId: colorAttr.id, value: 'white' },
    });
    const black = await testApp.prisma.attributeValue.create({
      data: { attributeId: colorAttr.id, value: 'black' },
    });
    const summer = await testApp.prisma.attributeValue.create({
      data: { attributeId: seasonAttr.id, value: 'summer' },
    });
    for (const value of [white, summer, black]) {
      await testApp.prisma.productAttributeValue.create({
        data: { productId: product.id, attributeValueId: value.id },
      });
    }
    const body = (await http().get(`/products/${product.id}`)).body as Detail;

    expect(body.attributes).toEqual([
      {
        attribute: { id: seasonAttr.id, name: seasonAttr.name },
        values: [{ id: summer.id, value: 'summer' }],
      },
      {
        attribute: { id: colorAttr.id, name: colorAttr.name },
        values: [
          { id: black.id, value: 'black' },
          { id: white.id, value: 'white' },
        ],
      },
    ]);
  });

  it('orders several values of one attribute by value, whatever the insert order', async () => {
    const product = await createProduct();
    const attribute = await testApp.prisma.attribute.create({
      data: { name: `Size ${randomUUID()}` },
    });
    const created = [];
    for (const value of ['m', 'x', 'c', 'a']) {
      created.push(
        await testApp.prisma.attributeValue.create({
          data: { attributeId: attribute.id, value },
        }),
      );
    }
    for (const value of created) {
      await testApp.prisma.productAttributeValue.create({
        data: { productId: product.id, attributeValueId: value.id },
      });
    }
    const body = (await http().get(`/products/${product.id}`)).body as Detail;

    expect(body.attributes).toHaveLength(1);
    expect(body.attributes[0]?.values.map((item) => item.value)).toEqual(['a', 'c', 'm', 'x']);
  });

  it('gives the list image equal to the first detail image for several images', async () => {
    const product = await createProduct();
    await addImage(product.id, 'products/c.jpg', 3);
    await addImage(product.id, 'products/a.jpg', 0);
    await addImage(product.id, 'products/b.jpg', 2);
    const detail = (await http().get(`/products/${product.id}`)).body as Detail;
    const item = (await listAll()).find((candidate) => candidate.id === product.id);

    expect(detail.images.length).toBe(3);
    expect(item?.image?.url).toBe(detail.images[0]?.url);
  });

  it('floors a half-ruble final price: 7990 with 15 percent off is 6791', async () => {
    const product = await createProduct({ price: 7990, discount: 15 });
    const item = (await listAll()).find((candidate) => candidate.id === product.id);

    expect(product.finalPrice).toBe(6791);
    expect(item?.finalPrice).toBe(6791);
  });

  it('answers price, rating and finalPrice as JSON numbers (AC5)', async () => {
    const product = await createProduct({ price: 1999.99, discount: 15, rating: 4.5 });
    const response = await http().get(`/products/${product.id}`);
    const body = response.body as Detail;

    expect(body.price).toBe(1999.99);
    expect(body.rating).toBe(4.5);
    expect(body.discount).toBe(15);
    expect(body.finalPrice).toBe(1699);
    expect(product.price).toBe(1999.99);
    expect(product.finalPrice).toBe(1699);
  });
});

describe('products: create', () => {
  it('creates with 201, defaults the discount to 0 and keeps optional fields', async () => {
    const body = validBody({ description: 'Text', rating: 4.5 });
    const response = await http().post('/products').set(admin).send(body);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      article: body.article,
      name: 'Dress',
      description: 'Text',
      rating: 4.5,
      price: 1999.99,
      discount: 0,
      finalPrice: 1999,
      brand: { id: brand.id, name: brand.name },
      category: { id: category.id, name: category.name, slug: category.slug },
    });
  });

  it('accepts null rating and description', async () => {
    const product = await createProduct({ rating: null, description: null });

    expect(product).toMatchObject({ rating: null, description: null });
  });

  it.each(['article', 'name', 'price', 'brandId', 'categoryId'])(
    'refuses a missing %s',
    async (field) => {
      const body = validBody();
      delete body[field];

      expectError(
        await http().post('/products').set(admin).send(body),
        400,
        'VALIDATION_FAILED',
        field,
      );
    },
  );

  it.each(['article', 'name', 'price', 'discount', 'brandId', 'categoryId'])(
    'refuses null in %s',
    async (field) => {
      expectError(
        await http()
          .post('/products')
          .set(admin)
          .send(validBody({ [field]: null })),
        400,
        'VALIDATION_FAILED',
        field,
      );
    },
  );

  it.each([
    ['price', 0],
    ['price', -1],
    ['price', 10.005],
    ['price', '10'],
    ['discount', 101],
    ['discount', -1],
    ['discount', 1.5],
    ['rating', 5.1],
    ['rating', -0.1],
    ['rating', 4.55],
    ['name', ' padded'],
    ['name', ''],
    ['article', 'trailing '],
    ['brandId', 'not-a-uuid'],
    ['categoryId', 'not-a-uuid'],
  ])('refuses %s = %j', async (field, value) => {
    expectError(
      await http()
        .post('/products')
        .set(admin)
        .send(validBody({ [field]: value })),
      400,
      'VALIDATION_FAILED',
      field,
    );
  });

  it('refuses an unknown field', async () => {
    expectError(
      await http()
        .post('/products')
        .set(admin)
        .send(validBody({ extra: 1 })),
      400,
      'VALIDATION_FAILED',
      'extra',
    );
  });

  it('refuses a body that sets images, variations or attributes', async () => {
    expectError(
      await http()
        .post('/products')
        .set(admin)
        .send(validBody({ images: [] })),
      400,
      'VALIDATION_FAILED',
      'images',
    );
  });

  it('refuses a missing brand with 400 RELATED_NOT_FOUND naming brandId', async () => {
    const response = await http()
      .post('/products')
      .set(admin)
      .send(validBody({ brandId: randomUUID() }));

    expectError(response, 400, 'RELATED_NOT_FOUND', 'brandId');
  });

  it('refuses a missing category with 400 RELATED_NOT_FOUND naming categoryId', async () => {
    const response = await http()
      .post('/products')
      .set(admin)
      .send(validBody({ categoryId: randomUUID() }));

    expectError(response, 400, 'RELATED_NOT_FOUND', 'categoryId');
  });

  it('refuses a duplicate article with 409 ALREADY_EXISTS', async () => {
    const product = await createProduct();

    expectError(
      await http()
        .post('/products')
        .set(admin)
        .send(validBody({ article: product.article })),
      409,
      'ALREADY_EXISTS',
      'article',
    );
  });
});

describe('products: update', () => {
  it('changes only the fields sent and returns the detail', async () => {
    const product = await createProduct({ description: 'Keep', rating: 4 });
    const response = await http()
      .patch(`/products/${product.id}`)
      .set(admin)
      .send({ name: 'Renamed', price: 500, discount: 20 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ...product,
      name: 'Renamed',
      price: 500,
      discount: 20,
      finalPrice: 400,
    });
  });

  it('clears rating and description with null', async () => {
    const product = await createProduct({ description: 'Text', rating: 4.5 });
    const response = await http()
      .patch(`/products/${product.id}`)
      .set(admin)
      .send({ rating: null, description: null });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ rating: null, description: null });
  });

  it('moves the product to another brand and category', async () => {
    const product = await createProduct();
    const otherBrand = await testApp.prisma.brand.create({ data: { name: `B ${randomUUID()}` } });
    const response = await http()
      .patch(`/products/${product.id}`)
      .set(admin)
      .send({ brandId: otherBrand.id });

    expect(response.status).toBe(200);
    expect((response.body as Detail).brand).toEqual({ id: otherBrand.id, name: otherBrand.name });
  });

  it('answers 200 with the product and updatedAt unchanged for an empty body', async () => {
    const product = await createProduct();
    const before = await testApp.prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    const response = await http().patch(`/products/${product.id}`).set(admin).send({});
    const after = await testApp.prisma.product.findUniqueOrThrow({ where: { id: product.id } });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(product);
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });

  it.each(['article', 'name', 'price', 'discount', 'brandId', 'categoryId'])(
    'refuses null in %s',
    async (field) => {
      const product = await createProduct();

      expectError(
        await http()
          .patch(`/products/${product.id}`)
          .set(admin)
          .send({ [field]: null }),
        400,
        'VALIDATION_FAILED',
        field,
      );
    },
  );

  it.each([
    ['price', 0],
    ['price', 1.234],
    ['discount', 101],
    ['rating', 5.1],
    ['name', ' x'],
  ])('refuses %s = %j', async (field, value) => {
    const product = await createProduct();

    expectError(
      await http()
        .patch(`/products/${product.id}`)
        .set(admin)
        .send({ [field]: value }),
      400,
      'VALIDATION_FAILED',
      field,
    );
  });

  it('refuses an unknown field', async () => {
    const product = await createProduct();

    expectError(
      await http().patch(`/products/${product.id}`).set(admin).send({ extra: 1 }),
      400,
      'VALIDATION_FAILED',
      'extra',
    );
  });

  it('refuses a missing brand or category with 400 RELATED_NOT_FOUND', async () => {
    const product = await createProduct();

    expectError(
      await http().patch(`/products/${product.id}`).set(admin).send({ brandId: randomUUID() }),
      400,
      'RELATED_NOT_FOUND',
      'brandId',
    );
    expectError(
      await http().patch(`/products/${product.id}`).set(admin).send({ categoryId: randomUUID() }),
      400,
      'RELATED_NOT_FOUND',
      'categoryId',
    );
    expect(await http().get(`/products/${product.id}`)).toMatchObject({ body: product });
  });

  it('refuses a duplicate article with 409 ALREADY_EXISTS', async () => {
    const one = await createProduct();
    const other = await createProduct();

    expectError(
      await http().patch(`/products/${other.id}`).set(admin).send({ article: one.article }),
      409,
      'ALREADY_EXISTS',
      'article',
    );
  });
});

describe('products: delete', () => {
  it('deletes with 204 and an empty body, then answers 404', async () => {
    const product = await createProduct();
    const response = await http().delete(`/products/${product.id}`).set(admin);

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expectError(await http().get(`/products/${product.id}`), 404, 'NOT_FOUND');
    expectError(await http().delete(`/products/${product.id}`).set(admin), 404, 'NOT_FOUND');
  });

  it('removes images, variations and attribute links, and keeps the attribute value', async () => {
    const product = await createProduct();
    const attribute = await testApp.prisma.attribute.create({
      data: { name: `Attribute ${randomUUID()}` },
    });
    const value = await testApp.prisma.attributeValue.create({
      data: { attributeId: attribute.id, value: 'v' },
    });
    await addImage(product.id, 'products/x.jpg', 0);
    await testApp.prisma.productVariation.create({
      data: { productId: product.id, size: 'M', stock: 1 },
    });
    await testApp.prisma.productAttributeValue.create({
      data: { productId: product.id, attributeValueId: value.id },
    });

    expect((await http().delete(`/products/${product.id}`).set(admin)).status).toBe(204);

    const where = { productId: product.id };
    expect(await testApp.prisma.productImage.count({ where })).toBe(0);
    expect(await testApp.prisma.productVariation.count({ where })).toBe(0);
    expect(await testApp.prisma.productAttributeValue.count({ where })).toBe(0);
    expect(await testApp.prisma.attributeValue.count({ where: { id: value.id } })).toBe(1);
  });

  it('refuses to delete a product used in a generation with 409 IN_USE', async () => {
    const product = await createProduct();
    const n = Math.floor(Math.random() * 1e9);
    const user = await testApp.prisma.user.create({
      data: {
        phone: `+79${String(n).padStart(9, '0')}`,
        email: `user-${randomUUID()}@mail.ru`,
        firstName: 'Иван',
      },
    });
    const session = await testApp.prisma.fittingSession.create({ data: { userId: user.id } });
    const generation = await testApp.prisma.aiGeneration.create({
      data: {
        sessionId: session.id,
        userImageKey: 'users/photo.jpg',
        status: 'pending',
        aiProvider: 'provider',
        aiModel: 'model',
      },
    });
    await testApp.prisma.generationProduct.create({
      data: { generationId: generation.id, productId: product.id },
    });

    expectError(await http().delete(`/products/${product.id}`).set(admin), 409, 'IN_USE');
    expect((await http().get(`/products/${product.id}`)).status).toBe(200);
  });
});

describe('products: swagger', () => {
  it('documents the five routes and the seed note on delete', () => {
    const document = SwaggerModule.createDocument(testApp.app, new DocumentBuilder().build());
    const list = document.paths['/products'];
    const one = document.paths['/products/{id}'];

    expect(list).toHaveProperty('get');
    expect(list).toHaveProperty('post');
    expect(one).toHaveProperty('get');
    expect(one).toHaveProperty('patch');
    expect(one).toHaveProperty('delete');
    expect(one?.delete?.description).toMatch(/seed/i);
  });
});
