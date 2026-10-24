import type { ProductDetail } from '@/entities/product';

import { productPath } from '../lib/product-path';

// The schema.org types the product page describes (spec 0019 plan §8), written here as the
// catalog's are: no new dependency.

interface ListItem {
  '@type': 'ListItem';
  position: number;
  name: string;
  item: string;
}

interface BreadcrumbList {
  '@type': 'BreadcrumbList';
  itemListElement: ListItem[];
}

interface Offer {
  '@type': 'Offer';
  price: number;
  priceCurrency: 'RUB';
  availability: 'https://schema.org/InStock' | 'https://schema.org/OutOfStock';
  url: string;
}

interface Product {
  '@type': 'Product';
  name: string;
  sku: string;
  brand: { '@type': 'Brand'; name: string };
  url: string;
  image?: string[];
  description?: string;
  offers: Offer;
}

export interface ProductJsonLd {
  '@context': 'https://schema.org';
  '@graph': (Product | BreadcrumbList)[];
}

export interface ProductJsonLdInput {
  // `SITE_URL`: every address here is absolute.
  siteUrl: string;
  product: ProductDetail;
  // The trail the page shows («Каталог», the category), the product added after it.
  breadcrumbs: { name: string; path: string }[];
}

export function productJsonLd({
  siteUrl,
  product,
  breadcrumbs,
}: ProductJsonLdInput): ProductJsonLd {
  const absolute = (path: string) => new URL(path, siteUrl).href;
  const url = absolute(productPath(product));
  // The gallery, else the cover, as the metadata takes them.
  const gallery = product.images.map((image) => image.url);
  const images = gallery.length > 0 || product.image === null ? gallery : [product.image.url];
  const description = product.description?.trim();
  const trail = [...breadcrumbs, { name: product.name, path: productPath(product) }];
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        name: product.name,
        sku: product.article,
        brand: { '@type': 'Brand', name: product.brand.name },
        url,
        ...(images.length === 0 ? {} : { image: images }),
        ...(description ? { description } : {}),
        offers: {
          '@type': 'Offer',
          price: product.finalPrice,
          priceCurrency: 'RUB',
          // In stock while any size is.
          availability: product.variations.some((variation) => variation.stock > 0)
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
          url,
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: trail.map(({ name, path }, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name,
          item: absolute(path),
        })),
      },
    ],
  };
}
