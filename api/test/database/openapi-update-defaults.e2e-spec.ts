import { randomUUID } from 'node:crypto';

import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { LEFT_OUT_IS_ZERO } from '../../src/common/validation/rules.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

const ADMIN_TOKEN = 'test-admin-token-0123456789abcdef';
const admin = { 'X-Admin-Token': ADMIN_TOKEN };

interface Schema {
  properties?: Record<string, { default?: unknown; description?: string }>;
}

let testApp: TestApp;
let schemas: Record<string, Schema>;
let brandId: string;
let categoryId: string;

beforeAll(async () => {
  testApp = await createTestApp();
  const document = SwaggerModule.createDocument(testApp.app, new DocumentBuilder().build());
  schemas = (document.components?.schemas ?? {}) as Record<string, Schema>;
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

describe('OpenAPI document', () => {
  it('has the update schemas to check', () => {
    const names = Object.keys(schemas).filter((name) => name.startsWith('Update'));

    expect(names).toEqual(
      expect.arrayContaining([
        'UpdateCategoryDto',
        'UpdateProductDto',
        'UpdateProductImageDto',
        'UpdateProductVariationDto',
      ]),
    );
  });

  it('gives no property of any Update* schema a default', () => {
    const withDefault: string[] = [];
    for (const [name, schema] of Object.entries(schemas)) {
      if (!name.startsWith('Update')) {
        continue;
      }
      for (const [property, definition] of Object.entries(schema.properties ?? {})) {
        if ('default' in definition) {
          withDefault.push(`${name}.${property}`);
        }
      }
    }

    expect(withDefault).toEqual([]);
  });

  it.each([
    ['CreateCategoryDto', 'sortOrder'],
    ['CreateProductDto', 'discount'],
    ['CreateProductImageDto', 'sortOrder'],
  ])('describes %s.%s as left out is zero, without a default', (schema, property) => {
    const definition = schemas[schema]?.properties?.[property];

    expect(definition?.description).toBe(LEFT_OUT_IS_ZERO);
    expect(definition).not.toHaveProperty('default');
  });

  it.each([
    ['UpdateCategoryDto', 'sortOrder'],
    ['UpdateProductDto', 'discount'],
    ['UpdateProductImageDto', 'sortOrder'],
  ])('keeps the same description on %s.%s', (schema, property) => {
    expect(schemas[schema]?.properties?.[property]?.description).toBe(LEFT_OUT_IS_ZERO);
  });
});

describe('fields left out', () => {
  async function createProduct(extra: Record<string, unknown> = {}) {
    const response = await http()
      .post('/products')
      .set(admin)
      .send({
        article: `ART-${randomUUID()}`,
        name: 'Dress',
        price: 100,
        brandId,
        categoryId,
        ...extra,
      });
    expect(response.status).toBe(201);
    return response.body as { id: string; discount: number };
  }

  it('create without sortOrder gives 0; PATCH without it keeps the value (category)', async () => {
    const created = await http()
      .post('/categories')
      .set(admin)
      .send({ name: `Cat ${randomUUID()}`, slug: randomUUID(), isActive: true });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ sortOrder: 0 });
    const path = `/categories/${(created.body as { id: string }).id}`;

    expect((await http().patch(path).set(admin).send({ sortOrder: 4 })).body).toMatchObject({
      sortOrder: 4,
    });
    const renamed = await http()
      .patch(path)
      .set(admin)
      .send({ name: `Renamed ${randomUUID()}` });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ sortOrder: 4 });
  });

  it('create without discount gives 0; PATCH without it keeps the value (product)', async () => {
    const product = await createProduct();
    expect(product.discount).toBe(0);
    const path = `/products/${product.id}`;

    expect((await http().patch(path).set(admin).send({ discount: 15 })).body).toMatchObject({
      discount: 15,
    });
    const renamed = await http().patch(path).set(admin).send({ name: 'Skirt' });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ name: 'Skirt', discount: 15 });
  });

  it('create without sortOrder gives 0; PATCH without it keeps the value (image)', async () => {
    const product = await createProduct();
    const created = await http()
      .post(`/products/${product.id}/images`)
      .set(admin)
      .send({ imageKey: 'a.jpg' });
    expect(created.body).toMatchObject({ sortOrder: 0 });
    const path = `/products/${product.id}/images/${(created.body as { id: string }).id}`;

    await http().patch(path).set(admin).send({ sortOrder: 6 });
    const response = await http().patch(path).set(admin).send({ imageKey: 'b.jpg' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ imageKey: 'b.jpg', sortOrder: 6 });
  });
});

describe('a parent deleted during the insert', () => {
  it('answers 404 NOT_FOUND "Product not found" for an image', async () => {
    const response = await http()
      .post('/products')
      .set(admin)
      .send({ article: `ART-${randomUUID()}`, name: 'Dress', price: 100, brandId, categoryId });
    const productId = (response.body as { id: string }).id;
    const create = testApp.prisma.productImage.create.bind(testApp.prisma.productImage);
    const spy = vi
      .spyOn(testApp.prisma.productImage, 'create')
      .mockImplementationOnce(((args: Parameters<typeof create>[0]) =>
        testApp.prisma.product
          .delete({ where: { id: productId } })
          .then(() => create(args))) as unknown as typeof create);

    const result = await http()
      .post(`/products/${productId}/images`)
      .set(admin)
      .send({ imageKey: 'a.jpg' });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(404);
    expect(result.body).toMatchObject({
      error: { code: 'NOT_FOUND', message: 'Product not found' },
    });
  });
});
