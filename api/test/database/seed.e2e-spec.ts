import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { CATALOG, imageKeys } from '../../src/seed/catalog.data.js';
import { SeedService } from '../../src/seed/seed.service.js';
import { createTestDatabase } from '../support/test-database.js';

let db: PrismaClient;
let seed: SeedService;

beforeAll(async () => {
  db = await createTestDatabase();
  seed = new SeedService(db);
});

afterAll(async () => {
  await db.$disconnect();
});

function pick(index: number) {
  const product = CATALOG.products[index];
  if (!product) throw new Error(`no catalog product at ${index}`);
  return product;
}

const sum = (numbers: number[]): number => numbers.reduce((a, b) => a + b, 0);

async function counts() {
  const [
    categories,
    brands,
    attributes,
    attributeValues,
    products,
    images,
    variations,
    links,
    users,
  ] = await Promise.all([
    db.category.count(),
    db.brand.count(),
    db.attribute.count(),
    db.attributeValue.count(),
    db.product.count(),
    db.productImage.count(),
    db.productVariation.count(),
    db.productAttributeValue.count(),
    db.user.count(),
  ]);
  return {
    categories,
    brands,
    attributes,
    attributeValues,
    products,
    images,
    variations,
    links,
    users,
  };
}

describe('catalog data (C22)', () => {
  it('has the sizes the acceptance criteria ask for', () => {
    expect(CATALOG.categories.length).toBeGreaterThanOrEqual(5);
    expect(CATALOG.brands.length).toBeGreaterThanOrEqual(5);
    expect(CATALOG.products.length).toBeGreaterThanOrEqual(30);
  });

  it('uses articles of letters, digits and hyphens, at most 50 characters', () => {
    for (const { article } of CATALOG.products) {
      expect(article).toMatch(/^[A-Za-z0-9][A-Za-z0-9-]*$/);
      expect(article.length).toBeLessThanOrEqual(50);
    }
  });

  it('has unique articles', () => {
    const articles = CATALOG.products.map((p) => p.article);
    expect(new Set(articles).size).toBe(articles.length);
  });

  it('gives every product an image, a size and an attribute', () => {
    for (const product of CATALOG.products) {
      expect(product.imageCount).toBeGreaterThanOrEqual(1);
      expect(product.sizes.length).toBeGreaterThanOrEqual(1);
      expect(Object.keys(product.attributes).length).toBeGreaterThanOrEqual(1);
    }
  });
});

// The tests of this block share one database and run in the order written: the first run, then
// reruns after hand edits.
describe('SeedService on a throwaway database', () => {
  const total = CATALOG.products.length;

  it('loads the whole catalog into an empty database (AC8)', async () => {
    const result = await seed.run();

    expect(result).toEqual({ productsCreated: total, productsSkipped: 0 });
    expect(await counts()).toEqual({
      categories: CATALOG.categories.length,
      brands: CATALOG.brands.length,
      attributes: CATALOG.attributes.length,
      attributeValues: sum(CATALOG.attributes.map((a) => a.values.length)),
      products: total,
      images: sum(CATALOG.products.map((p) => p.imageCount)),
      variations: sum(CATALOG.products.map((p) => p.sizes.length)),
      links: sum(CATALOG.products.map((p) => Object.keys(p.attributes).length)),
      users: 0,
    });
  });

  it('gives every stored product an image, a size and an attribute value (AC8)', async () => {
    const products = await db.product.findMany({
      select: {
        article: true,
        _count: { select: { images: true, variations: true, attributeValues: true } },
      },
    });

    expect(products).toHaveLength(total);
    for (const { article, _count } of products) {
      expect(_count.images, article).toBeGreaterThanOrEqual(1);
      expect(_count.variations, article).toBeGreaterThanOrEqual(1);
      expect(_count.attributeValues, article).toBeGreaterThanOrEqual(1);
    }
  });

  it('stores the image keys of each product in sort order', async () => {
    const stored = await db.product.findMany({
      select: {
        article: true,
        images: { orderBy: { sortOrder: 'asc' }, select: { imageKey: true, sortOrder: true } },
      },
    });
    const byArticle = new Map(stored.map((p) => [p.article, p.images]));

    for (const product of CATALOG.products) {
      const images = byArticle.get(product.article);
      expect(images?.map((i) => i.imageKey)).toEqual(imageKeys(product));
      expect(images?.map((i) => i.sortOrder)).toEqual(images?.map((_, i) => i));
    }
  });

  it('changes nothing on a second run (AC9)', async () => {
    const before = await counts();

    const result = await seed.run();

    expect(result).toEqual({ productsCreated: 0, productsSkipped: total });
    expect(await counts()).toEqual(before);
  });

  it('keeps hand edits of a price, a category name and a stock (C16)', async () => {
    const first = pick(0);
    const second = pick(1);
    const size = second.sizes.map((s) => s.size)[0] ?? '';
    await db.product.update({ where: { article: first.article }, data: { price: '1.23' } });
    await db.category.update({
      where: { slug: first.categorySlug },
      data: { name: 'Renamed by hand' },
    });
    const variation = await db.productVariation.findFirstOrThrow({
      where: { product: { article: second.article }, size },
    });
    await db.productVariation.update({ where: { id: variation.id }, data: { stock: 999 } });

    const result = await seed.run();

    expect(result).toEqual({ productsCreated: 0, productsSkipped: total });
    const product = await db.product.findUniqueOrThrow({ where: { article: first.article } });
    expect(product.price.toString()).toBe('1.23');
    const category = await db.category.findUniqueOrThrow({ where: { slug: first.categorySlug } });
    expect(category.name).toBe('Renamed by hand');
    const edited = await db.productVariation.findUniqueOrThrow({ where: { id: variation.id } });
    expect(edited.stock).toBe(999);
  });

  it('skips a product whose images and sizes were removed by hand, adding nothing under it', async () => {
    const { article } = pick(2);
    await db.productImage.deleteMany({ where: { product: { article } } });
    await db.productVariation.deleteMany({ where: { product: { article } } });
    const before = await counts();

    const result = await seed.run();

    expect(result).toEqual({ productsCreated: 0, productsSkipped: total });
    expect(await counts()).toEqual(before);
    const product = await db.product.findUniqueOrThrow({
      where: { article },
      select: { _count: { select: { images: true, variations: true } } },
    });
    expect(product._count).toEqual({ images: 0, variations: 0 });
  });

  it('recreates a product deleted by hand whole and skips the others (AC9)', async () => {
    const target = pick(3);
    const before = await counts();
    await db.product.delete({ where: { article: target.article } });
    expect((await counts()).products).toBe(total - 1);

    const result = await seed.run();

    expect(result).toEqual({ productsCreated: 1, productsSkipped: total - 1 });
    expect(await counts()).toEqual(before);
    const restored = await db.product.findUniqueOrThrow({
      where: { article: target.article },
      select: {
        images: { orderBy: { sortOrder: 'asc' }, select: { imageKey: true } },
        variations: { select: { size: true, stock: true }, orderBy: { size: 'asc' } },
        _count: { select: { attributeValues: true } },
      },
    });
    expect(restored.images.map((i) => i.imageKey)).toEqual(imageKeys(target));
    expect(restored.variations).toEqual(
      [...target.sizes].sort((a, b) => a.size.localeCompare(b.size)),
    );
    expect(restored._count.attributeValues).toBe(Object.keys(target.attributes).length);
  });

  it('does not add a brand, attribute value or category renamed by hand while all products exist (C16b)', async () => {
    const brand = CATALOG.brands[0] ?? '';
    const attribute = CATALOG.attributes[0];
    const value = attribute?.values[0] ?? '';
    const category = CATALOG.categories.at(-1);
    await db.brand.update({ where: { name: brand }, data: { name: 'Brand by hand' } });
    await db.attributeValue.updateMany({ where: { value }, data: { value: 'value by hand' } });
    await db.category.update({
      where: { slug: category?.slug ?? '' },
      data: { name: 'Category by hand', slug: 'category-by-hand' },
    });
    const before = await counts();

    const result = await seed.run();

    expect(result).toEqual({ productsCreated: 0, productsSkipped: total });
    expect(await counts()).toEqual(before);
    expect(await db.brand.count({ where: { name: brand } })).toBe(0);
    expect(await db.attributeValue.count({ where: { value } })).toBe(0);
    expect(await db.category.count({ where: { slug: category?.slug } })).toBe(0);
  });

  it('recreates a product with its brand under the seed name when the brand was renamed (C16b)', async () => {
    const brand = CATALOG.brands[1] ?? '';
    const target = CATALOG.products.find((p) => p.brand === brand);
    if (!target) throw new Error('no product of the second brand');
    await db.brand.update({ where: { name: brand }, data: { name: 'Second brand by hand' } });
    await db.product.delete({ where: { article: target.article } });
    const brandsBefore = await db.brand.count();

    const result = await seed.run();

    expect(result).toEqual({ productsCreated: 1, productsSkipped: total - 1 });
    expect(await db.brand.count()).toBe(brandsBefore + 1);
    const restored = await db.product.findUniqueOrThrow({
      where: { article: target.article },
      select: { brand: { select: { name: true } } },
    });
    expect(restored.brand.name).toBe(brand);
  });

  it('fails naming the article when only the slug of the category of a missing product was renamed (C16b)', async () => {
    const slug = CATALOG.categories[1]?.slug;
    const target = CATALOG.products.find((p) => p.categorySlug === slug);
    if (!target) throw new Error('no product in the second category');
    await db.product.delete({ where: { article: target.article } });
    await db.category.update({ where: { slug }, data: { slug: 'renamed-by-hand' } });
    const categories = await db.category.count();

    await expect(seed.run()).rejects.toThrow(target.article);

    expect(await db.product.count({ where: { article: target.article } })).toBe(0);
    expect(await db.category.count()).toBe(categories);
  });

  it('creates no reference row that no missing product uses (C16b)', async () => {
    const catalog = {
      categories: [
        { name: 'Custom category', slug: 'custom-category', sortOrder: 0 },
        { name: 'Unused category', slug: 'unused-category', sortOrder: 1 },
      ],
      brands: ['Custom brand', 'Unused brand'],
      attributes: [{ name: 'Custom attribute', values: ['used', 'unused'] }],
      products: [
        {
          article: 'CUSTOM-001',
          name: 'Custom product',
          description: 'Custom',
          kind: 'dress' as const,
          brand: 'Custom brand',
          categorySlug: 'custom-category',
          price: 100,
          discount: 0,
          rating: 4,
          attributes: { 'Custom attribute': 'used' },
          sizes: [{ size: 'M', stock: 1 }],
          imageCount: 1,
        },
      ],
    };

    const result = await seed.run(catalog);

    expect(result).toEqual({ productsCreated: 1, productsSkipped: 0 });
    expect(await db.brand.count({ where: { name: 'Custom brand' } })).toBe(1);
    expect(await db.brand.count({ where: { name: 'Unused brand' } })).toBe(0);
    expect(await db.category.count({ where: { slug: 'unused-category' } })).toBe(0);
    expect(await db.attributeValue.count({ where: { value: 'used' } })).toBe(1);
    expect(await db.attributeValue.count({ where: { value: 'unused' } })).toBe(0);
  });
});
