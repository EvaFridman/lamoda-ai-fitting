import 'server-only';

import type { Metadata } from 'next';
import { connection } from 'next/server';

import { getCategoryBySlug } from '@/entities/category/server';
import { getServerEnv } from '@/shared/config/server';

// The root layout adds " — Виртуальная примерка | Lamoda AI Fitting" (O25).
const CATALOG_TITLE = 'Каталог';

// The site's address for absolute links in metadata. Set here, per request, not in the root layout,
// which is built with the static pages when no server env exists (O67).
function metadataBase(): URL {
  return new URL(getServerEnv().SITE_URL);
}

export async function generateCatalogMetadata(): Promise<Metadata> {
  await connection();
  return { title: CATALOG_TITLE, metadataBase: metadataBase() };
}

export async function generateCategoryMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  // A failure is reported by apiFetch and shown by the page; the title falls back to the catalog's.
  const category = await getCategoryBySlug(slug).catch(() => null);
  return { title: category?.name ?? CATALOG_TITLE, metadataBase: metadataBase() };
}
