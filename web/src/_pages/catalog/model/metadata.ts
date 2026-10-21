import 'server-only';

import type { Metadata } from 'next';
import { cache } from 'react';

import { getCategoryBySlug } from '@/entities/category/server';
import type { ProductFacets } from '@/entities/product';
import { getProductFacets } from '@/entities/product/server';
import { SITE_NAME, siteTitle } from '@/shared/config';
import { getServerEnv } from '@/shared/config/server';

import { productCount } from '../lib/product-count';
import { previewImages } from './preview-image';
import { type CatalogSearchParams, type CatalogUrlState, parseCatalogUrl } from './url-state';

// The root layout adds " — Виртуальная примерка | Lamoda AI Fitting" (O25).
const CATALOG_TITLE = 'Каталог';
const CATALOG_PATH = '/catalog';

type SearchParams = Promise<CatalogSearchParams>;

// The site's address for absolute links in metadata. Set here, per request, not in the root layout,
// which is built with the static pages when no server env exists (O67).
function metadataBase(): URL {
  return new URL(getServerEnv().SITE_URL);
}

// A search, a filter or a batch after the first (`cursor`) is never indexed, but its links are
// followed (O26, O41). A sort alone stays indexable: the canonical address names the unsorted page
// (O92). Only what `parseCatalogUrl` keeps counts: an invalid parameter changes nothing on the page.
export function isIndexable({ query, cursor }: CatalogUrlState): boolean {
  return (
    cursor === undefined &&
    Object.entries(query).every(([key, value]) => key === 'sort' || value === undefined)
  );
}

// The filter counts of the unfiltered page, for a description; once per render. `undefined` when
// they fail: apiFetch reports it, and the page shows its own failure. Asked only for an indexed
// address: a page with `noindex` goes without the count, and saves the visitor's
// quota a read.
const unfilteredFacets = cache(
  async (categoryId: string | undefined): Promise<ProductFacets | undefined> =>
    getProductFacets(categoryId === undefined ? {} : { categoryId: [categoryId] }).catch(
      () => undefined,
    ),
);

// "Платья: 128 товаров с виртуальной примеркой в Lamoda AI Fitting." (O25), without the count when
// there is no product or the counts failed. No price: the counts' lowest is the price before the
// discount, above what the cards show (O94).
export function templateDescription(
  title: string,
  facets: Pick<ProductFacets, 'total'> | undefined,
): string {
  const count = facets !== undefined && facets.total > 0 ? `: ${productCount(facets.total)}` : '';
  return `${title}${count} с виртуальной примеркой в ${SITE_NAME}.`;
}

interface PageMetadata {
  title: string;
  description: string;
  path: string;
  indexable: boolean;
}

// Title, description, canonical address, `noindex` and link previews (plan §3.5, AC19).
function catalogMetadata({ title, description, path, indexable }: PageMetadata): Metadata {
  const fullTitle = siteTitle(title);
  return {
    title,
    description,
    metadataBase: metadataBase(),
    alternates: { canonical: path },
    ...(indexable ? {} : { robots: { index: false, follow: true } }),
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: 'ru_RU',
      url: path,
      title: fullTitle,
      description,
      images: previewImages('/catalog/opengraph-image'),
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: previewImages('/catalog/twitter-image'),
    },
  };
}

export async function generateCatalogMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const indexable = isIndexable(parseCatalogUrl(await searchParams));
  const facets = indexable ? await unfilteredFacets(undefined) : undefined;
  return catalogMetadata({
    title: CATALOG_TITLE,
    description: templateDescription(CATALOG_TITLE, facets),
    path: CATALOG_PATH,
    indexable,
  });
}

export async function generateCategoryMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { slug } = await params;
  const indexable = isIndexable(parseCatalogUrl(await searchParams));
  // A failure is reported by apiFetch and shown by the page; an inactive category is the page's soft
  // 404 (O65). Either falls back to the catalog's title, not indexed.
  const category = await getCategoryBySlug(slug).catch(() => null);
  if (!category?.isActive) {
    return catalogMetadata({
      title: CATALOG_TITLE,
      description: templateDescription(CATALOG_TITLE, undefined),
      path: CATALOG_PATH,
      indexable: false,
    });
  }
  return catalogMetadata({
    title: category.name,
    description:
      category.description?.trim() ||
      templateDescription(
        category.name,
        indexable ? await unfilteredFacets(category.id) : undefined,
      ),
    path: `${CATALOG_PATH}/${encodeURIComponent(category.slug)}`,
    indexable,
  });
}
