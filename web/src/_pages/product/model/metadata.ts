import 'server-only';

import type { Metadata } from 'next';

import type { ProductDetail } from '@/entities/product';
import { SITE_NAME } from '@/shared/config';
import { getServerEnv } from '@/shared/config/server';

import { productPath } from '../lib/product-path';
import { loadProduct } from './load-product';

// The search snippet's length (spec 0019 plan §8).
export const DESCRIPTION_MAX = 160;

// «Annen Рубашка Design collection — купить в Lamoda AI Fitting»: a full title of its own, so the
// root layout's template is not added (`absolute`).
export function productTitle({ brand, name }: Pick<ProductDetail, 'brand' | 'name'>): string {
  return `${brand.name} ${name} — купить в ${SITE_NAME}`;
}

// The product's own description, its whitespace collapsed and cut to 160 characters with «…»;
// without one, a template like the catalog's.
export function productDescription({
  brand,
  name,
  description,
}: Pick<ProductDetail, 'brand' | 'name' | 'description'>): string {
  const own = description?.replace(/\s+/g, ' ').trim();
  if (!own) return `${brand.name} ${name} с виртуальной примеркой в ${SITE_NAME}.`;
  return own.length <= DESCRIPTION_MAX ? own : `${own.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…`;
}

// Title, description, canonical address and link previews with the first photo (plan §8, AC22).
// `metadataBase` is set here, per request, not in the root layout (0014 O67).
export function productMetadata(product: ProductDetail): Metadata {
  const title = productTitle(product);
  const description = productDescription(product);
  const path = productPath(product);
  const image = product.images[0]?.url ?? product.image?.url;
  const images = image === undefined ? undefined : [{ url: image, alt: product.name }];
  return {
    title: { absolute: title },
    description,
    metadataBase: new URL(getServerEnv().SITE_URL),
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: 'ru_RU',
      url: path,
      title,
      description,
      images,
    },
    twitter: {
      card: image === undefined ? 'summary' : 'summary_large_image',
      title,
      description,
      images,
    },
  };
}

export async function generateProductMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  // A failure is reported by the api client and shown by the page; a missing or inactive product is
  // the page's 404. Neither is indexed.
  const product = await loadProduct(id).catch(() => null);
  if (product === null) return { robots: { index: false, follow: true } };
  return productMetadata(product);
}
