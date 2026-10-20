import { CATALOG, imageKeys, type SeedCatalog } from './catalog.data.js';

// The development catalog (spec 0014 plan §2.8, O13): products made of the demo catalog's names,
// brands, categories, prices, discounts, ratings and sizes, for QA of scrolling and for the query
// plans on 50 000 products (O43). Each one shows its demo product's photos under their existing
// keys, so nothing is uploaded. Every value follows from the product's number and the demo catalog:
// a second run over the same demo catalog builds the same rows.

export const LARGE_CATALOG_ARTICLE_PREFIX = 'DEV-';
export const LARGE_CATALOG_DEFAULT_COUNT = 2000;
// Five digits in the article.
export const LARGE_CATALOG_MAX_COUNT = 99_999;

const DISCOUNTS = [0, 0, 10, 15, 20, 30, 50];
// Products are created a minute apart from here, so the `new` sort has no ties to break by id.
const FIRST_CREATED_AT = Date.UTC(2026, 0, 1);

export interface LargeCatalogProduct {
  article: string;
  name: string;
  description: string;
  brand: string;
  categorySlug: string;
  price: number;
  discount: number;
  // Every tenth one has none, so the rating sort's unrated branch has rows to read.
  rating: number | null;
  createdAt: Date;
  attributes: Record<string, string>;
  sizes: { size: string; stock: number }[];
  imageKeys: string[];
}

export function largeCatalogArticle(n: number): string {
  return `${LARGE_CATALOG_ARTICLE_PREFIX}${String(n).padStart(5, '0')}`;
}

// The n-th product (from 1). The name, category, attributes, sizes and photos are its demo
// product's, so a dress stays a dress; the brand moves on once every demo product has been used,
// and the price, discount and rating vary with n.
export function largeCatalogProduct(
  n: number,
  catalog: SeedCatalog = CATALOG,
): LargeCatalogProduct {
  const products = catalog.products;
  const base = products[(n - 1) % products.length];
  const brand = catalog.brands[Math.floor((n - 1) / products.length) % catalog.brands.length];
  if (!base || !brand) {
    throw new Error('The demo catalog has no products or no brands');
  }
  const priceFactor = 0.5 + ((n * 7919) % 101) / 100;
  return {
    article: largeCatalogArticle(n),
    name: base.name,
    description: base.description,
    brand,
    categorySlug: base.categorySlug,
    price: Math.max(100, Math.round((base.price * priceFactor) / 10) * 10),
    discount: DISCOUNTS[(n * 13) % DISCOUNTS.length] ?? 0,
    rating: n % 10 === 0 ? null : (30 + ((n * 31) % 21)) / 10,
    createdAt: new Date(FIRST_CREATED_AT + n * 60_000),
    attributes: base.attributes,
    sizes: base.sizes,
    imageKeys: imageKeys(base),
  };
}

// The script's argument: how many products the catalog should have, 2000 when none is given.
export function parseLargeCatalogCount(arg: string | undefined): number {
  if (arg === undefined) {
    return LARGE_CATALOG_DEFAULT_COUNT;
  }
  const count = /^\d+$/.test(arg) ? Number(arg) : Number.NaN;
  if (!Number.isInteger(count) || count < 1 || count > LARGE_CATALOG_MAX_COUNT) {
    throw new Error(
      `The product count must be a whole number from 1 to ${LARGE_CATALOG_MAX_COUNT}, got "${arg}"`,
    );
  }
  return count;
}
