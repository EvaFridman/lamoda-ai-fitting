import type { ProductListItem } from '@/entities/product';
import { SITE_NAME } from '@/shared/config';

// The schema.org types the catalog describes (plan §3.5, O27), written here: no new dependency.

interface ListItem<T> {
  '@type': 'ListItem';
  position: number;
  name?: string;
  item: T;
}

interface BreadcrumbList {
  '@type': 'BreadcrumbList';
  itemListElement: ListItem<string>[];
}

interface Offer {
  '@type': 'Offer';
  price: number;
  priceCurrency: 'RUB';
  url: string;
}

interface Product {
  '@type': 'Product';
  name: string;
  url: string;
  image?: string;
  offers: Offer;
}

interface ItemList {
  '@type': 'ItemList';
  itemListElement: ListItem<Product>[];
}

interface SearchAction {
  '@type': 'SearchAction';
  target: { '@type': 'EntryPoint'; urlTemplate: string };
  'query-input': string;
}

interface WebSite {
  '@type': 'WebSite';
  name: string;
  url: string;
  potentialAction: SearchAction;
}

interface Organization {
  '@type': 'Organization';
  name: string;
  url: string;
}

export interface CatalogJsonLd {
  '@context': 'https://schema.org';
  '@graph': (BreadcrumbList | ItemList | WebSite | Organization)[];
}

export interface CatalogJsonLdInput {
  // `SITE_URL`: every address here is absolute.
  siteUrl: string;
  // The trail the page shows: "Каталог", then the category, if any.
  breadcrumbs: { name: string; path: string }[];
  // The first batch the page shows (O27).
  products: readonly Pick<ProductListItem, 'id' | 'name' | 'image' | 'finalPrice'>[];
  // `/catalog` also describes the site with its search and the organization (O27).
  isCatalogRoot: boolean;
}

function product(siteUrl: string, item: CatalogJsonLdInput['products'][number]): Product {
  // The product page's address (O7, spec 0019 plan §8).
  const url = new URL(`/products/${encodeURIComponent(item.id)}`, siteUrl).href;
  return {
    '@type': 'Product',
    name: item.name,
    url,
    ...(item.image === null ? {} : { image: item.image.url }),
    offers: { '@type': 'Offer', price: item.finalPrice, priceCurrency: 'RUB', url },
  };
}

export function catalogJsonLd({
  siteUrl,
  breadcrumbs,
  products,
  isCatalogRoot,
}: CatalogJsonLdInput): CatalogJsonLd {
  const absolute = (path: string) => new URL(path, siteUrl).href;
  const graph: CatalogJsonLd['@graph'] = [
    {
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbs.map(({ name, path }, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name,
        item: absolute(path),
      })),
    },
  ];
  if (products.length > 0) {
    graph.push({
      '@type': 'ItemList',
      itemListElement: products.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: product(siteUrl, item),
      })),
    });
  }
  if (isCatalogRoot) {
    graph.push(
      {
        '@type': 'WebSite',
        name: SITE_NAME,
        url: absolute('/'),
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${absolute('/catalog')}?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      },
      { '@type': 'Organization', name: SITE_NAME, url: absolute('/') },
    );
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}
