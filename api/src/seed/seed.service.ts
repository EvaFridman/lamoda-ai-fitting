import { Inject, Injectable, Logger } from '@nestjs/common';

import type { PrismaClient } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CATALOG, imageKeys, type SeedCatalog, type SeedProduct } from './catalog.data.js';

export interface SeedResult {
  productsCreated: number;
  productsSkipped: number;
}

// Loads the demo catalog (spec 0002, C5) and only adds what is missing, found by natural keys
// (C16): it never updates or deletes a row, so edits made in the database survive a reseed.
// Reference rows (categories, brands, attributes) are added only for the products being created
// (C16b), so one renamed by hand is not added again while its products exist. Runs on every
// deploy: a run that finds every product is one query.
@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  // Typed as the plain client, so tests hand in the client of their throwaway database.
  constructor(@Inject(PrismaService) private readonly prisma: PrismaClient) {}

  async run(catalog: SeedCatalog = CATALOG): Promise<SeedResult> {
    const existing = await this.prisma.product.findMany({
      where: { article: { in: catalog.products.map((p) => p.article) } },
      select: { article: true },
    });
    const existingArticles = new Set(existing.map((p) => p.article));
    const missing = catalog.products.filter((p) => !existingArticles.has(p.article));

    if (missing.length > 0) {
      const needed = referencesOf(catalog, missing);
      const categoryIds = await this.seedCategories(needed);
      const brandIds = await this.seedBrands(needed);
      const valueIds = await this.seedAttributes(needed);
      for (const product of missing) {
        await this.createProduct(product, categoryIds, brandIds, valueIds);
      }
    }

    const result = { productsCreated: missing.length, productsSkipped: existingArticles.size };
    this.logger.log(
      `Seed done: ${result.productsCreated} products created, ${result.productsSkipped} already there`,
    );
    return result;
  }

  // Category slug → id.
  private async seedCategories(catalog: SeedCatalog): Promise<Map<string, string>> {
    await this.prisma.category.createMany({
      data: catalog.categories.map((c) => ({ ...c, isActive: true })),
      skipDuplicates: true,
    });
    const rows = await this.prisma.category.findMany({
      where: { slug: { in: catalog.categories.map((c) => c.slug) } },
      select: { id: true, slug: true },
    });
    return new Map(rows.map((r) => [r.slug, r.id]));
  }

  // Brand name → id.
  private async seedBrands(catalog: SeedCatalog): Promise<Map<string, string>> {
    await this.prisma.brand.createMany({
      data: catalog.brands.map((name) => ({ name })),
      skipDuplicates: true,
    });
    const rows = await this.prisma.brand.findMany({
      where: { name: { in: catalog.brands } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((r) => [r.name, r.id]));
  }

  // "Attribute: value" → attribute value id.
  private async seedAttributes(catalog: SeedCatalog): Promise<Map<string, string>> {
    const names = catalog.attributes.map((a) => a.name);
    await this.prisma.attribute.createMany({
      data: names.map((name) => ({ name })),
      skipDuplicates: true,
    });
    const attributes = await this.prisma.attribute.findMany({
      where: { name: { in: names } },
      select: { id: true, name: true },
    });
    const attributeIds = new Map(attributes.map((a) => [a.name, a.id]));

    await this.prisma.attributeValue.createMany({
      data: catalog.attributes.flatMap((a) => {
        const attributeId = attributeIds.get(a.name);
        return attributeId ? a.values.map((value) => ({ attributeId, value })) : [];
      }),
      skipDuplicates: true,
    });
    const values = await this.prisma.attributeValue.findMany({
      where: { attributeId: { in: [...attributeIds.values()] } },
      select: { id: true, value: true, attribute: { select: { name: true } } },
    });
    return new Map(values.map((v) => [valueKey(v.attribute.name, v.value), v.id]));
  }

  // One nested create: the product with its images, sizes and attribute links, all or nothing.
  private async createProduct(
    product: SeedProduct,
    categoryIds: Map<string, string>,
    brandIds: Map<string, string>,
    valueIds: Map<string, string>,
  ): Promise<void> {
    const categoryId = required(categoryIds, product.categorySlug, 'category', product.article);
    const brandId = required(brandIds, product.brand, 'brand', product.article);
    const attributeValueIds = Object.entries(product.attributes).map(([name, value]) =>
      required(valueIds, valueKey(name, value), 'attribute value', product.article),
    );

    await this.prisma.product.create({
      data: {
        article: product.article,
        name: product.name,
        description: product.description,
        price: product.price,
        discount: product.discount,
        rating: product.rating,
        categoryId,
        brandId,
        images: {
          create: imageKeys(product).map((imageKey, sortOrder) => ({ imageKey, sortOrder })),
        },
        variations: { create: product.sizes },
        attributeValues: {
          create: attributeValueIds.map((attributeValueId) => ({ attributeValueId })),
        },
      },
    });
  }
}

// The part of the catalog's reference data that `products` use.
function referencesOf(catalog: SeedCatalog, products: SeedProduct[]): SeedCatalog {
  const slugs = new Set(products.map((p) => p.categorySlug));
  const brands = new Set(products.map((p) => p.brand));
  const values = new Set(
    products.flatMap((p) =>
      Object.entries(p.attributes).map(([name, value]) => valueKey(name, value)),
    ),
  );
  return {
    categories: catalog.categories.filter((c) => slugs.has(c.slug)),
    brands: catalog.brands.filter((name) => brands.has(name)),
    attributes: catalog.attributes
      .map((a) => ({
        name: a.name,
        values: a.values.filter((v) => values.has(valueKey(a.name, v))),
      }))
      .filter((a) => a.values.length > 0),
    products,
  };
}

function valueKey(attribute: string, value: string): string {
  return `${attribute}: ${value}`;
}

// A row the product needs is missing. Only a category can be (C16b): it has two unique keys, so one
// whose slug alone was renamed by hand keeps the seed from adding the seed slug again. A brand or
// attribute value renamed by hand is added again under its seed name with the product that needs it.
function required(ids: Map<string, string>, key: string, what: string, article: string): string {
  const id = ids.get(key);
  if (!id) {
    throw new Error(`Seed product ${article}: ${what} "${key}" not found`);
  }
  return id;
}
