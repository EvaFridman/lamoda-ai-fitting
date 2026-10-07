import { existsSync, readFileSync, readdirSync, type Dirent } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { CATALOG, COLOUR, imageKeys } from '../../src/seed/catalog.data.js';
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

// Reads the pixel size from the header of a WebP file (VP8 lossy, VP8L lossless, VP8X extended).
// Throws on anything it cannot read, so an unknown format fails the test instead of passing.
function webpSize(bytes: Buffer): { width: number; height: number } {
  if (bytes.length < 30) throw new Error('too short for a WebP header');
  const chunk = bytes.subarray(12, 16).toString('latin1');
  if (chunk === 'VP8 ') {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
      throw new Error('VP8 start code not found');
    }
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    if (bytes[20] !== 0x2f) throw new Error('VP8L signature not found');
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
  }
  throw new Error(`unknown WebP chunk "${chunk}"`);
}

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

  it('names an Unsplash photo and its author for every product, one photo per product (C9d)', () => {
    for (const { article, photo } of CATALOG.products) {
      expect(photo.url, article).toMatch(/^https:\/\/unsplash\.com\/photos\/[A-Za-z0-9_-]+$/);
      expect(photo.author.length, article).toBeGreaterThan(0);
      expect(photo.author, article).toBe(photo.author.trim());
    }
    const urls = CATALOG.products.map((p) => p.photo.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('gives every product a colour from the colour attribute', () => {
    const colours = CATALOG.attributes.find((a) => a.name === COLOUR)?.values ?? [];
    expect(colours.length).toBeGreaterThan(0);
    for (const { article, attributes } of CATALOG.products) {
      expect(colours, article).toContain(attributes[COLOUR]);
    }
  });

  describe('image files', () => {
    const mediaDir = fileURLToPath(new URL('../../../web/public/media/', import.meta.url));
    const keys = CATALOG.products.flatMap((product) => imageKeys(product));

    it('uses keys the image key CHECK accepts', () => {
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(key).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/);
        expect(key).not.toContain('..');
      }
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('has a non-empty WebP file under web/public/media for every key', () => {
      for (const key of keys) {
        const file = join(mediaDir, key);
        expect(existsSync(file), `missing file for ${key}`).toBe(true);
        const bytes = readFileSync(file);
        expect(bytes.length, `empty file for ${key}`).toBeGreaterThan(12);
        expect(bytes.subarray(0, 4).toString('latin1'), key).toBe('RIFF');
        expect(bytes.subarray(8, 12).toString('latin1'), key).toBe('WEBP');
      }
    });

    it('keeps every image under 100 KB and 600x800 pixels', () => {
      for (const key of keys) {
        const bytes = readFileSync(join(mediaDir, key));
        expect(bytes.length, `${key} is too big`).toBeLessThan(100 * 1024);
        expect(webpSize(bytes), `${key} size`).toEqual({ width: 600, height: 800 });
      }
    });

    it('reads sizes of the three WebP formats and rejects unknown data', () => {
      const header = (chunk: string, fill: (b: Buffer) => void) => {
        const b = Buffer.alloc(40);
        b.write('RIFF', 0, 'latin1');
        b.write('WEBP', 8, 'latin1');
        b.write(chunk, 12, 'latin1');
        fill(b);
        return b;
      };
      const lossy = header('VP8 ', (b) => {
        b.set([0x9d, 0x01, 0x2a], 23);
        b.writeUInt16LE(600, 26);
        b.writeUInt16LE(800, 28);
      });
      const lossless = header('VP8L', (b) => {
        b[20] = 0x2f;
        b.writeUInt32LE((599 | (799 << 14)) >>> 0, 21);
      });
      const extended = header('VP8X', (b) => {
        b.writeUIntLE(599, 24, 3);
        b.writeUIntLE(799, 27, 3);
      });
      for (const bytes of [lossy, lossless, extended]) {
        expect(webpSize(bytes)).toEqual({ width: 600, height: 800 });
      }
      expect(() => webpSize(header('ABCD', () => undefined))).toThrow();
      expect(() => webpSize(Buffer.alloc(10))).toThrow();
    });

    it('has no seed file without a key', () => {
      const seedDir = join(mediaDir, 'seed');
      const onDisk = (readdirSync(seedDir, { recursive: true, withFileTypes: true }) as Dirent[])
        // Hidden files (.DS_Store from Finder) are git-ignored and never served as seed images.
        .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
        .map((entry) =>
          relative(mediaDir, join(entry.parentPath, entry.name)).split(sep).join('/'),
        );
      expect(onDisk.sort()).toEqual([...keys].sort());
    });
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
          photo: { url: 'https://unsplash.com/photos/custom_Photo-1', author: 'Custom Author' },
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
