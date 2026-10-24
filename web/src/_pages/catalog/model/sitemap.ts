import 'server-only';

import type { MetadataRoute } from 'next';
import { connection } from 'next/server';

import { getCategories } from '@/entities/category/server';
import { getSitemapProducts } from '@/entities/product/server';
import { getServerEnv } from '@/shared/config/server';

import { catalogCategoriesQuery } from './categories';

// The newest products the sitemap names (spec 0019 A81).
export const SITEMAP_PRODUCT_MAX = 1000;

// `/sitemap.xml`: the catalog, its active categories (plan §3.5, AC20) and the newest products of
// those categories (spec 0019 plan §8, AC22). Built per request, so the build needs no api; when the
// categories fail, only the catalog, and when the products fail, no product (apiFetch reports it).
export async function catalogSitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const siteUrl = getServerEnv().SITE_URL;
  const catalog = { url: new URL('/catalog', siteUrl).href };
  let categories;
  try {
    ({ items: categories } = await getCategories(catalogCategoriesQuery));
  } catch {
    return [catalog];
  }
  // `GET /products` lists the products of inactive categories too: they have no page (A80).
  const active = new Set(categories.map((category) => category.id));
  const products = await getSitemapProducts(SITEMAP_PRODUCT_MAX).catch(() => []);
  return [
    catalog,
    ...categories.map((category) => ({
      url: new URL(`/catalog/${encodeURIComponent(category.slug)}`, siteUrl).href,
      lastModified: category.updatedAt,
    })),
    ...products
      .filter((product) => active.has(product.category.id))
      .map((product) => ({
        url: new URL(`/products/${encodeURIComponent(product.id)}`, siteUrl).href,
        lastModified: product.updatedAt,
      })),
  ];
}
