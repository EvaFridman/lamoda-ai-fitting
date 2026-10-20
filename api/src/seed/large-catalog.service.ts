import { Inject, Injectable, Logger } from '@nestjs/common';

import type { PrismaClient } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CATALOG, type SeedCatalog } from './catalog.data.js';
import {
  LARGE_CATALOG_ARTICLE_PREFIX,
  largeCatalogArticle,
  type LargeCatalogProduct,
  largeCatalogProduct,
} from './large-catalog.data.js';
import { SeedService } from './seed.service.js';

export interface LargeCatalogResult {
  productsCreated: number;
  productsSkipped: number;
}

// Products written per transaction: one failed batch leaves no product without its images or
// sizes, and the next run adds it again.
const BATCH_SIZE = 1000;
// A batch is a few thousand rows; the client's default of 5 s is too tight on a busy laptop.
const BATCH_TRANSACTION = { maxWait: 10_000, timeout: 60_000 };

// Fills the local database with the development catalog (spec 0014 plan §2.8). First the demo
// seed, which brings the categories, brands, attribute values and photos the products refer to;
// then only the articles `DEV-00001…` up to `count` that are missing, as the seed does (it never
// changes an existing row).
@Injectable()
export class LargeCatalogService {
  private readonly logger = new Logger(LargeCatalogService.name);

  // Typed as the plain client, so tests hand in the client of their throwaway database.
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaClient,
    @Inject(SeedService) private readonly seed: SeedService,
  ) {}

  async run(count: number, catalog: SeedCatalog = CATALOG): Promise<LargeCatalogResult> {
    await this.seed.run(catalog);

    const existing = await this.prisma.product.findMany({
      where: { article: { startsWith: LARGE_CATALOG_ARTICLE_PREFIX } },
      select: { article: true },
    });
    const existingArticles = new Set(existing.map((p) => p.article));
    const missing: LargeCatalogProduct[] = [];
    for (let n = 1; n <= count; n += 1) {
      if (!existingArticles.has(largeCatalogArticle(n))) {
        missing.push(largeCatalogProduct(n, catalog));
      }
    }

    if (missing.length > 0) {
      const ids = await this.referenceIds(catalog);
      for (let start = 0; start < missing.length; start += BATCH_SIZE) {
        await this.createBatch(missing.slice(start, start + BATCH_SIZE), ids);
        this.logger.log(
          `Development catalog: ${Math.min(start + BATCH_SIZE, missing.length)} of ${missing.length} products created`,
        );
      }
    }

    const result = {
      productsCreated: missing.length,
      productsSkipped: count - missing.length,
    };
    this.logger.log(
      `Development catalog done: ${result.productsCreated} products created, ${result.productsSkipped} already there`,
    );
    return result;
  }

  private async referenceIds(catalog: SeedCatalog): Promise<ReferenceIds> {
    const [categories, brands, values] = await Promise.all([
      this.prisma.category.findMany({
        where: { slug: { in: catalog.categories.map((c) => c.slug) } },
        select: { id: true, slug: true },
      }),
      this.prisma.brand.findMany({
        where: { name: { in: catalog.brands } },
        select: { id: true, name: true },
      }),
      this.prisma.attributeValue.findMany({
        where: { attribute: { name: { in: catalog.attributes.map((a) => a.name) } } },
        select: { id: true, value: true, attribute: { select: { name: true } } },
      }),
    ]);
    return {
      categories: new Map(categories.map((c) => [c.slug, c.id])),
      brands: new Map(brands.map((b) => [b.name, b.id])),
      values: new Map(values.map((v) => [valueKey(v.attribute.name, v.value), v.id])),
    };
  }

  // The products, then their images, sizes and attribute links, all or nothing.
  private async createBatch(products: LargeCatalogProduct[], ids: ReferenceIds): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.product.createManyAndReturn({
        data: products.map((p) => ({
          article: p.article,
          name: p.name,
          description: p.description,
          price: p.price,
          discount: p.discount,
          rating: p.rating,
          createdAt: p.createdAt,
          categoryId: required(ids.categories, p.categorySlug, 'category', p.article),
          brandId: required(ids.brands, p.brand, 'brand', p.article),
        })),
        select: { id: true, article: true },
      });
      const productIds = new Map(rows.map((r) => [r.article, r.id]));
      const idOf = (p: LargeCatalogProduct) => required(productIds, p.article, 'row', p.article);

      await tx.productImage.createMany({
        data: products.flatMap((p) =>
          p.imageKeys.map((imageKey, sortOrder) => ({ productId: idOf(p), imageKey, sortOrder })),
        ),
      });
      await tx.productVariation.createMany({
        data: products.flatMap((p) => p.sizes.map((s) => ({ productId: idOf(p), ...s }))),
      });
      await tx.productAttributeValue.createMany({
        data: products.flatMap((p) =>
          Object.entries(p.attributes).map(([name, value]) => ({
            productId: idOf(p),
            attributeValueId: required(
              ids.values,
              valueKey(name, value),
              'attribute value',
              p.article,
            ),
          })),
        ),
      });
    }, BATCH_TRANSACTION);
  }
}

interface ReferenceIds {
  // Category slug → id.
  categories: Map<string, string>;
  // Brand name → id.
  brands: Map<string, string>;
  // "Attribute: value" → attribute value id.
  values: Map<string, string>;
}

function valueKey(attribute: string, value: string): string {
  return `${attribute}: ${value}`;
}

// A row the product needs is missing: the demo seed adds reference rows only with its own products
// (spec 0002 C16b), so one renamed by hand is not there under its seed name.
function required(ids: Map<string, string>, key: string, what: string, article: string): string {
  const id = ids.get(key);
  if (!id) {
    throw new Error(`Development product ${article}: ${what} "${key}" not found`);
  }
  return id;
}
