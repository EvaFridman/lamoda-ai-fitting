import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { CATALOG } from '../../src/seed/catalog.data.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { largeCatalogProduct } from '../../src/seed/large-catalog.data.js';
import { LargeCatalogService } from '../../src/seed/large-catalog.service.js';
import { SeedService } from '../../src/seed/seed.service.js';
import type { StorageService } from '../../src/storage/storage.service.js';
import { createTestDatabase } from '../support/test-database.js';

let db: PrismaClient;
let service: LargeCatalogService;

const FIRST = 1500;
const SECOND = 1700;
const demoTotal = CATALOG.products.length;

// The demo photos are said to be in the bucket already: the development catalog uploads nothing.
const storage = { exists: async () => true, put: vi.fn() } as unknown as StorageService;

beforeAll(async () => {
  db = await createTestDatabase();
  service = new LargeCatalogService(db, new SeedService(db, storage));
});

afterAll(async () => {
  await db.$disconnect();
});

const dev = { article: { startsWith: 'DEV-' } };

function expected(count: number) {
  let images = 0;
  let variations = 0;
  let links = 0;
  for (let n = 1; n <= count; n += 1) {
    const p = largeCatalogProduct(n);
    images += p.imageKeys.length;
    variations += p.sizes.length;
    links += Object.keys(p.attributes).length;
  }
  return { products: count, images, variations, links };
}

async function devCounts() {
  const [products, images, variations, links] = await Promise.all([
    db.product.count({ where: dev }),
    db.productImage.count({ where: { product: dev } }),
    db.productVariation.count({ where: { product: dev } }),
    db.productAttributeValue.count({ where: { product: dev } }),
  ]);
  return { products, images, variations, links };
}

// The tests share one database and run in the order written.
describe('LargeCatalogService on a throwaway database', () => {
  it('creates the demo catalog and the requested products with their rows, in two batches', async () => {
    const result = await service.run(FIRST);

    expect(result).toEqual({ productsCreated: FIRST, productsSkipped: 0 });
    expect(await devCounts()).toEqual(expected(FIRST));
    expect(await db.product.count({ where: { NOT: dev } })).toBe(demoTotal);
  }, 60_000);

  it('stores a product as the data function describes it', async () => {
    const n = 1234;
    const want = largeCatalogProduct(n);

    const stored = await db.product.findUniqueOrThrow({
      where: { article: want.article },
      select: {
        name: true,
        price: true,
        discount: true,
        rating: true,
        createdAt: true,
        brand: { select: { name: true } },
        category: { select: { slug: true } },
        images: { orderBy: { sortOrder: 'asc' }, select: { imageKey: true } },
      },
    });

    expect(stored.name).toBe(want.name);
    expect(stored.brand.name).toBe(want.brand);
    expect(stored.category.slug).toBe(want.categorySlug);
    expect(Number(stored.price)).toBe(want.price);
    expect(stored.discount).toBe(want.discount);
    expect(stored.rating === null ? null : Number(stored.rating)).toBe(want.rating);
    expect(stored.createdAt).toEqual(want.createdAt);
    expect(stored.images.map((i) => i.imageKey)).toEqual(want.imageKeys);
  });

  it('creates nothing on a second run', async () => {
    const before = await devCounts();

    const result = await service.run(FIRST);

    expect(result).toEqual({ productsCreated: 0, productsSkipped: FIRST });
    expect(await devCounts()).toEqual(before);
  }, 60_000);

  it('does not change a product edited by hand when it reruns', async () => {
    const article = 'DEV-00007';
    await db.product.update({ where: { article }, data: { price: '1.23', name: 'By hand' } });

    await service.run(FIRST);

    const product = await db.product.findUniqueOrThrow({ where: { article } });
    expect(product.price.toString()).toBe('1.23');
    expect(product.name).toBe('By hand');
  }, 60_000);

  it('adds only the missing products when the count grows', async () => {
    const result = await service.run(SECOND);

    expect(result).toEqual({ productsCreated: SECOND - FIRST, productsSkipped: FIRST });
    expect(await devCounts()).toEqual(expected(SECOND));
    expect(await db.product.count({ where: { NOT: dev } })).toBe(demoTotal);
  }, 60_000);
});
