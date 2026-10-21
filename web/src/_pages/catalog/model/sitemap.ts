import 'server-only';

import type { MetadataRoute } from 'next';
import { connection } from 'next/server';

import { getCategories } from '@/entities/category/server';
import { getServerEnv } from '@/shared/config/server';

import { catalogCategoriesQuery } from './categories';

// `/sitemap.xml`: the catalog and its active categories (plan §3.5, AC20). Built per request, so
// the build needs no api; when the categories fail, only the catalog (apiFetch reports it).
export async function catalogSitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const siteUrl = getServerEnv().SITE_URL;
  const catalog = { url: new URL('/catalog', siteUrl).href };
  try {
    const { items } = await getCategories(catalogCategoriesQuery);
    return [
      catalog,
      ...items.map((category) => ({
        url: new URL(`/catalog/${encodeURIComponent(category.slug)}`, siteUrl).href,
        lastModified: category.updatedAt,
      })),
    ];
  } catch {
    return [catalog];
  }
}
