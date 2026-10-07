import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Prisma, PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestDatabase } from '../support/test-database.js';
import { expectViolation } from '../support/violation.js';

let db: PrismaClient;
let counter = 0;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.$disconnect();
});

const next = (): number => ++counter;

function newCategory(overrides: Partial<Prisma.CategoryUncheckedCreateInput> = {}) {
  const n = next();
  return db.category.create({
    data: { name: `Category ${n}`, slug: `category-${n}`, isActive: true, ...overrides },
  });
}

function newBrand(overrides: Partial<Prisma.BrandUncheckedCreateInput> = {}) {
  return db.brand.create({ data: { name: `Brand ${next()}`, ...overrides } });
}

// Product data with its own brand and category, so a test only names what it checks.
async function productData(
  overrides: Partial<Prisma.ProductUncheckedCreateInput> = {},
): Promise<Prisma.ProductUncheckedCreateInput> {
  const [brand, category] = await Promise.all([newBrand(), newCategory()]);
  return {
    article: `ART-${next()}`,
    name: `Product ${counter}`,
    price: '1990.00',
    brandId: brand.id,
    categoryId: category.id,
    ...overrides,
  };
}

async function newProduct(overrides: Partial<Prisma.ProductUncheckedCreateInput> = {}) {
  return db.product.create({ data: await productData(overrides) });
}

function newAttribute(overrides: Partial<Prisma.AttributeCreateInput> = {}) {
  return db.attribute.create({ data: { name: `Attribute ${next()}`, ...overrides } });
}

async function newAttributeValue(
  overrides: Partial<Prisma.AttributeValueUncheckedCreateInput> = {},
) {
  const attributeId = overrides.attributeId ?? (await newAttribute()).id;
  return db.attributeValue.create({
    data: { value: `Value ${next()}`, ...overrides, attributeId },
  });
}

async function uuidVersion(table: string, id: string): Promise<number> {
  // The table name is one of our constants below, never user input.
  const rows = await db.$queryRawUnsafe<{ version: number }[]>(
    `SELECT uuid_extract_version(id) AS version FROM ${table} WHERE id = $1::uuid`,
    id,
  );
  return Number(rows[0]?.version);
}

describe('catalog: ids and timestamps (AC3)', () => {
  const rows: [string, () => Promise<{ id: string; createdAt: Date; updatedAt: Date }>][] = [
    ['categories', () => newCategory()],
    ['brands', () => newBrand()],
    ['products', () => newProduct()],
    [
      'product_images',
      async () => {
        const product = await newProduct();
        return db.productImage.create({ data: { productId: product.id, imageKey: 'a/b.jpg' } });
      },
    ],
    [
      'product_variations',
      async () => {
        const product = await newProduct();
        return db.productVariation.create({ data: { productId: product.id, size: 'M', stock: 1 } });
      },
    ],
    ['attributes', () => newAttribute()],
    ['attribute_values', () => newAttributeValue()],
  ];

  it.each(rows)('%s: a UUID v7 and both timestamps', async (table, create) => {
    const row = await create();
    expect(await uuidVersion(table, row.id)).toBe(7);
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.updatedAt).toBeInstanceOf(Date);
  });

  it('brands: the database fills id and timestamps on a raw INSERT, without the Prisma client', async () => {
    const rows = await db.$queryRaw<
      { version: number; created_at: Date | null; updated_at: Date | null }[]
    >`INSERT INTO brands (name) VALUES (${`Raw brand ${next()}`})
      RETURNING uuid_extract_version(id) AS version, created_at, updated_at`;
    expect(Number(rows[0]?.version)).toBe(7);
    expect(rows[0]?.created_at).not.toBeNull();
    expect(rows[0]?.updated_at).not.toBeNull();
  });

  it('product_attribute_values: both timestamps (the key is the pair, no id)', async () => {
    const product = await newProduct();
    const value = await newAttributeValue();
    const link = await db.productAttributeValue.create({
      data: { productId: product.id, attributeValueId: value.id },
    });
    expect(link.createdAt).toBeInstanceOf(Date);
    expect(link.updatedAt).toBeInstanceOf(Date);
  });
});

describe('categories (AC4, AC5)', () => {
  it('accepts a valid row', async () => {
    await expect(newCategory({ description: 'Shoes', sortOrder: 0 })).resolves.toBeDefined();
  });

  it.each(['a', 'men', 'men-shoes', 'abc123', '1', 'a1-b2-c3'])(
    'accepts the slug %s',
    async (slug) => {
      await expect(newCategory({ slug })).resolves.toBeDefined();
    },
  );

  it.each([
    'Men',
    'men_shoes',
    '-men',
    'men-',
    'men--shoes',
    'men shoes',
    'обувь',
    '',
    'men/shoes',
    'men.shoes',
  ])('rejects the slug %j', async (slug) => {
    await expectViolation(newCategory({ slug }), 'categories_slug_check');
  });

  it.each(['', ' Shoes', 'Shoes '])('rejects the name %j', async (name) => {
    await expectViolation(newCategory({ name }), 'categories_name_check');
  });

  it('accepts sort order 0 and 5, rejects -1', async () => {
    await expect(newCategory({ sortOrder: 0 })).resolves.toBeDefined();
    await expect(newCategory({ sortOrder: 5 })).resolves.toBeDefined();
    await expectViolation(newCategory({ sortOrder: -1 }), 'categories_sort_order_check');
  });

  it('rejects a duplicate name', async () => {
    const first = await newCategory();
    await expectViolation(newCategory({ name: first.name }), 'categories_name_key');
  });

  it('rejects a duplicate slug', async () => {
    const first = await newCategory();
    await expectViolation(newCategory({ slug: first.slug }), 'categories_slug_key');
  });
});

describe('brands (AC4, AC5)', () => {
  it.each(['', ' Nike', 'Nike '])('rejects the name %j', async (name) => {
    await expectViolation(newBrand({ name }), 'brands_name_check');
  });

  it('accepts a name with inner spaces', async () => {
    await expect(newBrand({ name: `Hugo Boss ${next()}` })).resolves.toBeDefined();
  });

  it('rejects a duplicate name', async () => {
    const first = await newBrand();
    await expectViolation(newBrand({ name: first.name }), 'brands_name_key');
  });
});

describe('products (AC4, AC5)', () => {
  it('accepts a valid row with NULL rating and description', async () => {
    const product = await newProduct({ rating: null, description: null });
    expect(product.discount).toBe(0);
    expect(product.rating).toBeNull();
  });

  it.each(['', ' ART', 'ART '])('rejects the article %j', async (article) => {
    await expectViolation(
      db.product.create({ data: await productData({ article }) }),
      'products_article_check',
    );
  });

  it.each(['', ' Shirt', 'Shirt '])('rejects the name %j', async (name) => {
    await expectViolation(
      db.product.create({ data: await productData({ name }) }),
      'products_name_check',
    );
  });

  it('accepts price 0.01 and rejects 0 and -1', async () => {
    await expect(newProduct({ price: '0.01' })).resolves.toBeDefined();
    await expectViolation(
      db.product.create({ data: await productData({ price: '0' }) }),
      'products_price_check',
    );
    await expectViolation(
      db.product.create({ data: await productData({ price: '-1' }) }),
      'products_price_check',
    );
  });

  it.each([0, 1, 100])('accepts discount %i', async (discount) => {
    await expect(newProduct({ discount })).resolves.toBeDefined();
  });

  it.each([-1, 101])('rejects discount %i', async (discount) => {
    await expectViolation(
      db.product.create({ data: await productData({ discount }) }),
      'products_discount_check',
    );
  });

  it.each(['0', '2.5', '5'])('accepts rating %s', async (rating) => {
    await expect(newProduct({ rating })).resolves.toBeDefined();
  });

  it.each(['-0.1', '5.1'])('rejects rating %s', async (rating) => {
    await expectViolation(
      db.product.create({ data: await productData({ rating }) }),
      'products_rating_check',
    );
  });

  it('rejects a duplicate article', async () => {
    const first = await newProduct();
    await expectViolation(
      db.product.create({ data: await productData({ article: first.article }) }),
      'products_article_key',
    );
  });

  it('rejects an unknown brand and an unknown category', async () => {
    await expectViolation(
      db.product.create({ data: await productData({ brandId: randomUUID() }) }),
      'products_brand_id_fkey',
    );
    await expectViolation(
      db.product.create({ data: await productData({ categoryId: randomUUID() }) }),
      'products_category_id_fkey',
    );
  });
});

describe('product images (AC4, C22)', () => {
  const create = async (imageKey: string, sortOrder = 0) => {
    const product = await newProduct();
    return db.productImage.create({ data: { productId: product.id, imageKey, sortOrder } });
  };

  it.each([
    'products/abc-1/main_01.jpg',
    'a',
    'A1/b-c_d.e.png',
    'a.b/c',
    'seed/products/ART-1/1.webp',
  ])('accepts %s', async (key) => {
    await expect(create(key)).resolves.toBeDefined();
  });

  it.each([
    '/a/b',
    'a/../b',
    'a..b',
    '..',
    'https://x/y',
    '\\host/x',
    ' a',
    'a b',
    '%2e%2e/x',
    'a//b',
    'a/',
    'фото/a.jpg',
    '.hidden',
    'a/.b',
    '-a',
    'a/b\n',
    '',
  ])('rejects %j', async (key) => {
    await expectViolation(create(key), 'product_images_image_key_check');
  });

  it('accepts sort order 0 and rejects -1', async () => {
    await expect(create('a/b.jpg', 0)).resolves.toBeDefined();
    await expectViolation(create('a/b.jpg', -1), 'product_images_sort_order_check');
  });
});

describe('product variations (AC4, AC5)', () => {
  const create = async (size: string, stock: number, productId?: string) =>
    db.productVariation.create({
      data: { productId: productId ?? (await newProduct()).id, size, stock },
    });

  it.each([
    ['M', 0],
    ['42', 1],
    ['XL 2', 100],
  ])('accepts size %s with stock %i', async (size, stock) => {
    await expect(create(size, stock)).resolves.toBeDefined();
  });

  it('rejects stock -1', async () => {
    await expectViolation(create('M', -1), 'product_variations_stock_check');
  });

  it.each(['', ' M', 'M '])('rejects the size %j', async (size) => {
    await expectViolation(create(size, 1), 'product_variations_size_check');
  });

  it('rejects the same size twice for one product, allows it for another', async () => {
    const product = await newProduct();
    await create('M', 1, product.id);
    await expectViolation(create('M', 2, product.id), 'product_variations_product_id_size_key');
    await expect(create('M', 2)).resolves.toBeDefined();
  });
});

describe('attributes and values (AC4, AC5)', () => {
  it.each(['', ' Color', 'Color '])('rejects the attribute name %j', async (name) => {
    await expectViolation(newAttribute({ name }), 'attributes_name_check');
  });

  it('rejects a duplicate attribute name', async () => {
    const first = await newAttribute();
    await expectViolation(newAttribute({ name: first.name }), 'attributes_name_key');
  });

  it.each(['', ' red', 'red '])('rejects the value %j', async (value) => {
    await expectViolation(newAttributeValue({ value }), 'attribute_values_value_check');
  });

  it('accepts a value with inner spaces', async () => {
    await expect(newAttributeValue({ value: 'dark blue' })).resolves.toBeDefined();
  });

  it('rejects the same value twice for one attribute, allows it for another', async () => {
    const attribute = await newAttribute();
    await newAttributeValue({ attributeId: attribute.id, value: 'red' });
    await expectViolation(
      newAttributeValue({ attributeId: attribute.id, value: 'red' }),
      'attribute_values_attribute_id_value_key',
    );
    await expect(newAttributeValue({ value: 'red' })).resolves.toBeDefined();
  });

  it('rejects the same value linked twice to one product', async () => {
    const product = await newProduct();
    const value = await newAttributeValue();
    const data = { productId: product.id, attributeValueId: value.id };
    await db.productAttributeValue.create({ data });
    await expectViolation(
      db.productAttributeValue.create({ data }),
      'product_attribute_values_pkey',
    );
  });
});

describe('deletes (AC6, C8)', () => {
  it('deleting a product removes its images, sizes and attribute links, and keeps the value', async () => {
    const product = await newProduct();
    const value = await newAttributeValue();
    await db.productImage.create({ data: { productId: product.id, imageKey: 'a/b.jpg' } });
    await db.productVariation.create({ data: { productId: product.id, size: 'M', stock: 1 } });
    await db.productAttributeValue.create({
      data: { productId: product.id, attributeValueId: value.id },
    });

    await db.product.delete({ where: { id: product.id } });

    expect(await db.productImage.count({ where: { productId: product.id } })).toBe(0);
    expect(await db.productVariation.count({ where: { productId: product.id } })).toBe(0);
    expect(await db.productAttributeValue.count({ where: { productId: product.id } })).toBe(0);
    expect(await db.attributeValue.count({ where: { id: value.id } })).toBe(1);
  });

  it('refuses to delete a brand that has products', async () => {
    const product = await newProduct();
    await expectViolation(
      db.brand.delete({ where: { id: product.brandId } }),
      'products_brand_id_fkey',
    );
  });

  it('refuses to delete a category that has products', async () => {
    const product = await newProduct();
    await expectViolation(
      db.category.delete({ where: { id: product.categoryId } }),
      'products_category_id_fkey',
    );
  });

  it('deletes a brand and a category without products', async () => {
    const brand = await newBrand();
    const category = await newCategory();
    await expect(db.brand.delete({ where: { id: brand.id } })).resolves.toBeDefined();
    await expect(db.category.delete({ where: { id: category.id } })).resolves.toBeDefined();
  });

  it('refuses to delete an attribute value used by a product', async () => {
    const product = await newProduct();
    const value = await newAttributeValue();
    await db.productAttributeValue.create({
      data: { productId: product.id, attributeValueId: value.id },
    });
    await expectViolation(
      db.attributeValue.delete({ where: { id: value.id } }),
      'product_attribute_values_attribute_value_id_fkey',
    );
  });

  it('refuses to delete an attribute that has values', async () => {
    const value = await newAttributeValue();
    await expectViolation(
      db.attribute.delete({ where: { id: value.attributeId } }),
      'attribute_values_attribute_id_fkey',
    );
  });

  it('deletes an attribute value no product uses, then its attribute', async () => {
    const value = await newAttributeValue();
    await db.attributeValue.delete({ where: { id: value.id } });
    await expect(db.attribute.delete({ where: { id: value.attributeId } })).resolves.toBeDefined();
  });
});
