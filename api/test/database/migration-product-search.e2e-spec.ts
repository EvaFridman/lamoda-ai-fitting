import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { PrismaClient } from '../../src/generated/prisma/client.js';
import { SeedService } from '../../src/seed/seed.service.js';
import type { StorageService } from '../../src/storage/storage.service.js';
import { createTestDatabaseUrl } from '../support/test-database.js';

// Migration 20261019120000_product_search (spec 0014, plan §2.1, §2.4) on a database that the seed
// filled before it: the migration fills the vectors of the existing rows, and its triggers keep
// them right afterwards. The database is a copy of the migrated template, put back into the state
// before the migration.
const MIGRATION = '20261019120000_product_search';
const apiRoot = fileURLToPath(new URL('../../', import.meta.url));
const run = promisify(execFile);

let db: PrismaClient;
// A second connection pool on the same database, for the lock tests.
let other: PrismaClient;

const INDEXES = [
  'products_search_vector_idx',
  'products_article_lower_idx',
  'products_created_at_id_idx',
  'products_price_asc_id_idx',
  'products_price_desc_id_idx',
  'products_discount_id_idx',
  'products_rating_id_idx',
];

beforeAll(async () => {
  const storage = {
    exists: vi.fn().mockResolvedValue(true),
    put: vi.fn(),
  } as unknown as StorageService;
  const url = await createTestDatabaseUrl();
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  other = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  await new SeedService(db, storage).run();

  // The state before the migration.
  for (const [trigger, table] of [
    ['products_search_vector', 'products'],
    ['brands_search_vector', 'brands'],
    ['categories_search_vector', 'categories'],
  ] as const) {
    await db.$executeRawUnsafe(`DROP TRIGGER ${trigger} ON ${table}`);
  }
  for (const fn of [
    'products_set_search_vector',
    'brands_refresh_search_vector',
    'categories_refresh_search_vector',
    'product_search_vector',
  ]) {
    await db.$executeRawUnsafe(`DROP FUNCTION ${fn}`);
  }
  await db.$executeRawUnsafe('ALTER TABLE products DROP COLUMN search_vector');
  // The GIN index goes with the column.
  for (const index of INDEXES.filter((name) => name !== 'products_search_vector_idx')) {
    await db.$executeRawUnsafe(`DROP INDEX ${index}`);
  }
  await db.$executeRaw`DELETE FROM _prisma_migrations WHERE migration_name = ${MIGRATION}`;

  await run(join(apiRoot, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: url },
  });
});

afterAll(async () => {
  await other.$disconnect();
  await db.$disconnect();
});

// Lower-case Cyrillic words of a test's own, so that no seed word or other test matches them.
function word(): string {
  const letters = 'бвгджзклмнпрстфхцчшщ';
  const vowels = 'аеиоу';
  let w = '';
  for (let i = 0; i < 4; i += 1) {
    const n = randomUUID().replaceAll('-', '');
    w += letters[Number.parseInt(n.slice(i * 2, i * 2 + 2), 16) % letters.length] ?? 'б';
    w += vowels[Number.parseInt(n.slice(i * 2 + 8, i * 2 + 10), 16) % vowels.length] ?? 'а';
  }
  return `${w}ск`;
}

async function matches(productId: string, query: string): Promise<boolean> {
  const rows = await db.$queryRaw<{ m: boolean }[]>`
    SELECT (search_vector @@ to_tsquery('russian', ${query})) AS m
    FROM products WHERE id = ${productId}::uuid`;
  return rows[0]?.m ?? false;
}

async function vectorText(productId: string): Promise<string> {
  const rows = await db.$queryRaw<{ v: string }[]>`
    SELECT search_vector::text AS v FROM products WHERE id = ${productId}::uuid`;
  return rows[0]?.v ?? '';
}

async function newProduct(opts: { name: string; brandId: string; categoryId: string }) {
  return db.product.create({
    data: { article: `A-${randomUUID()}`, price: '100.00', ...opts },
  });
}

async function newBrand(name: string) {
  return db.brand.create({ data: { name } });
}

async function newCategory(name: string) {
  return db.category.create({
    data: { name, slug: `c-${randomUUID()}`, isActive: true },
  });
}

describe('migration product_search', () => {
  it('fills the vectors of the rows that existed before: name (weight A), brand and category', async () => {
    const counts = await db.$queryRaw<{ total: number; wrong: number }[]>`
      SELECT count(*)::int AS total,
        count(*) FILTER (WHERE p.search_vector IS DISTINCT FROM (
          setweight(to_tsvector('russian', p.name), 'A')
          || to_tsvector('russian', b.name)
          || to_tsvector('russian', c.name))
        )::int AS wrong
      FROM products p
      JOIN brands b ON b.id = p.brand_id
      JOIN categories c ON c.id = p.category_id`;
    expect(counts[0]?.total).toBeGreaterThan(0);
    expect(counts[0]?.wrong).toBe(0);

    const rows = await db.$queryRaw<{ name: string; byName: boolean; byBrand: boolean }[]>`
      SELECT p.name,
        p.search_vector @@ plainto_tsquery('russian', p.name) AS "byName",
        p.search_vector @@ plainto_tsquery('russian', b.name) AS "byBrand"
      FROM products p JOIN brands b ON b.id = p.brand_id`;
    expect(rows.every((r) => r.byName && r.byBrand)).toBe(true);
  });

  it('weights the name A and leaves the brand and category at the default weight', async () => {
    const [brandWord, categoryWord, nameWord] = [word(), word(), word()] as [
      string,
      string,
      string,
    ];
    const brand = await newBrand(brandWord);
    const category = await newCategory(categoryWord);
    const product = await newProduct({
      name: nameWord,
      brandId: brand.id,
      categoryId: category.id,
    });
    expect(await matches(product.id, `${nameWord}:A`)).toBe(true);
    expect(await matches(product.id, `${brandWord}:A`)).toBe(false);
    expect(await matches(product.id, `${brandWord}:D`)).toBe(true);
    expect(await matches(product.id, `${categoryWord}:D`)).toBe(true);
  });

  it('gives a product inserted through Prisma its name, brand and category words', async () => {
    const [brandWord, categoryWord, nameWord] = [word(), word(), word()] as [
      string,
      string,
      string,
    ];
    const brand = await newBrand(brandWord);
    const category = await newCategory(categoryWord);
    const product = await newProduct({
      name: `Куртка ${nameWord}`,
      brandId: brand.id,
      categoryId: category.id,
    });
    expect(await matches(product.id, nameWord)).toBe(true);
    expect(await matches(product.id, brandWord)).toBe(true);
    expect(await matches(product.id, categoryWord)).toBe(true);
    expect(await matches(product.id, word())).toBe(false);
  });

  it('refreshes the vector when the name, the brand or the category of a product changes', async () => {
    const brand = await newBrand(word());
    const category = await newCategory(word());
    const product = await newProduct({
      name: word(),
      brandId: brand.id,
      categoryId: category.id,
    });

    const newName = word();
    await db.product.update({ where: { id: product.id }, data: { name: newName } });
    expect(await matches(product.id, newName)).toBe(true);
    expect(await matches(product.id, product.name)).toBe(false);

    const otherBrand = await newBrand(word());
    await db.product.update({ where: { id: product.id }, data: { brandId: otherBrand.id } });
    expect(await matches(product.id, otherBrand.name)).toBe(true);
    expect(await matches(product.id, brand.name)).toBe(false);

    const otherCategory = await newCategory(word());
    await db.product.update({ where: { id: product.id }, data: { categoryId: otherCategory.id } });
    expect(await matches(product.id, otherCategory.name)).toBe(true);
    expect(await matches(product.id, category.name)).toBe(false);
    expect(await matches(product.id, newName)).toBe(true);
  });

  it("renames a brand into its products' vectors and leaves other brands' products alone", async () => {
    const brand = await newBrand(word());
    const otherBrand = await newBrand(word());
    const category = await newCategory(word());
    const mine = await newProduct({ name: word(), brandId: brand.id, categoryId: category.id });
    const theirs = await newProduct({
      name: word(),
      brandId: otherBrand.id,
      categoryId: category.id,
    });
    const theirsBefore = await vectorText(theirs.id);

    const newName = word();
    await db.brand.update({ where: { id: brand.id }, data: { name: newName } });

    expect(await matches(mine.id, newName)).toBe(true);
    expect(await matches(mine.id, brand.name)).toBe(false);
    expect(await vectorText(theirs.id)).toBe(theirsBefore);
    expect(await matches(theirs.id, newName)).toBe(false);
  });

  it("renames a category into its products' vectors and leaves other categories' products alone", async () => {
    const category = await newCategory(word());
    const otherCategory = await newCategory(word());
    const brand = await newBrand(word());
    const mine = await newProduct({ name: word(), brandId: brand.id, categoryId: category.id });
    const theirs = await newProduct({
      name: word(),
      brandId: brand.id,
      categoryId: otherCategory.id,
    });
    const theirsBefore = await vectorText(theirs.id);

    const newName = word();
    await db.category.update({ where: { id: category.id }, data: { name: newName } });

    expect(await matches(mine.id, newName)).toBe(true);
    expect(await matches(mine.id, category.name)).toBe(false);
    expect(await vectorText(theirs.id)).toBe(theirsBefore);
    expect(await matches(theirs.id, newName)).toBe(false);
  });

  describe('a rename in progress', () => {
    type Parent = 'brand' | 'category';

    // Connection A renames the parent and holds the transaction open; connection B writes a product
    // that joins the parent. B must wait for A, then read the new name.
    async function joinDuringRename(parent: Parent, join: 'insert' | 'move') {
      const brand = await newBrand(word());
      const category = await newCategory(word());
      const target = parent === 'brand' ? brand : category;
      const spare = parent === 'brand' ? await newBrand(word()) : await newCategory(word());
      const base = { name: word(), brandId: brand.id, categoryId: category.id };
      const existing =
        join === 'move'
          ? await newProduct({
              ...base,
              ...(parent === 'brand' ? { brandId: spare.id } : { categoryId: spare.id }),
            })
          : null;

      const newName = word();
      let markRenamed!: () => void;
      const renamed = new Promise<void>((resolve) => {
        markRenamed = resolve;
      });
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const transaction = db.$transaction(
        async (tx) => {
          if (parent === 'brand') {
            await tx.brand.update({ where: { id: target.id }, data: { name: newName } });
          } else {
            await tx.category.update({ where: { id: target.id }, data: { name: newName } });
          }
          markRenamed();
          await gate;
        },
        { timeout: 30_000 },
      );
      let write: Promise<{ id: string }> | undefined;
      try {
        await renamed;
        let finished = false;
        write = (
          existing
            ? other.product.update({
                where: { id: existing.id },
                data: parent === 'brand' ? { brandId: target.id } : { categoryId: target.id },
              })
            : other.product.create({
                data: { article: `A-${randomUUID()}`, price: '100.00', ...base },
              })
        ).finally(() => {
          finished = true;
        });

        await vi.waitFor(
          async () => {
            const waiting = await db.$queryRaw<{ n: number }[]>`
              SELECT count(*)::int AS n FROM pg_stat_activity
              WHERE datname = current_database() AND wait_event_type = 'Lock'
                AND pid <> pg_backend_pid()
                AND (query ILIKE 'INSERT INTO "public"."products"%'
                  OR query ILIKE 'UPDATE "public"."products"%')`;
            expect(waiting[0]?.n).toBeGreaterThan(0);
          },
          { timeout: 10_000 },
        );
        expect(finished).toBe(false);

        release();
        await transaction;
        const product = await write;
        return { product, oldName: target.name, newName };
      } finally {
        release();
        await transaction.catch(() => undefined);
        await write?.catch(() => undefined);
      }
    }

    it.each([
      ['brand', 'insert'],
      ['brand', 'move'],
      ['category', 'insert'],
      ['category', 'move'],
    ] as const)(
      'makes a product that joins a %s wait (%s) and gives it the new name',
      async (parent, join) => {
        const { product, oldName, newName } = await joinDuringRename(parent, join);
        expect(await matches(product.id, newName)).toBe(true);
        expect(await matches(product.id, oldName)).toBe(false);
      },
      30_000,
    );
  });

  it('stems Russian words: a dress matches its other forms and a prefix', async () => {
    const brand = await newBrand(word());
    const category = await newCategory(word());
    const product = await newProduct({
      name: 'Платье летнее',
      brandId: brand.id,
      categoryId: category.id,
    });
    expect(await matches(product.id, 'платья')).toBe(true);
    expect(await matches(product.id, 'плат:*')).toBe(true);
    expect(await matches(product.id, 'летние')).toBe(true);
    expect(await matches(product.id, 'брюки')).toBe(false);
  });

  it('records the migration', async () => {
    const recorded = await db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM _prisma_migrations
      WHERE migration_name = ${MIGRATION} AND finished_at IS NOT NULL`;
    expect(recorded[0]?.n).toBe(1);
  });

  it('creates the seven indexes with their sort orders', async () => {
    const rows = await db.$queryRaw<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'products' AND indexname = ANY(${INDEXES})`;
    const def = (name: string) => rows.find((r) => r.indexname === name)?.indexdef ?? '';
    expect(rows).toHaveLength(7);
    expect(def('products_search_vector_idx')).toContain('USING gin (search_vector)');
    expect(def('products_article_lower_idx')).toContain('(lower((article)::text))');
    expect(def('products_created_at_id_idx')).toContain('(created_at DESC, id DESC)');
    expect(def('products_price_asc_id_idx')).toContain('(price, id DESC)');
    expect(def('products_price_desc_id_idx')).toContain('(price DESC, id DESC)');
    expect(def('products_discount_id_idx')).toContain('(discount DESC, id DESC)');
    expect(def('products_rating_id_idx')).toContain('(rating DESC NULLS LAST, id DESC)');
  });
});
