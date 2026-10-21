import { describe, expect, it } from 'vitest';

import { catalogJsonLd, jsonLdText } from './json-ld';

const siteUrl = 'https://site.test';
const breadcrumbs = [
  { name: 'Каталог', path: '/catalog' },
  { name: 'Платья', path: '/catalog/dresses' },
];

function product(id: string, name = 'Платье', hasImage = true) {
  return {
    id,
    name,
    image: hasImage ? { url: `https://site.test/media/${id}.jpg`, alt: name } : null,
    finalPrice: 1990,
  } as unknown as Parameters<typeof catalogJsonLd>[0]['products'][number];
}

function build(overrides: Partial<Parameters<typeof catalogJsonLd>[0]> = {}) {
  return catalogJsonLd({ siteUrl, breadcrumbs, products: [], isCatalogRoot: false, ...overrides });
}

describe('catalogJsonLd', () => {
  it('has the schema.org context', () => {
    expect(build()['@context']).toBe('https://schema.org');
  });

  it('lists the breadcrumbs with absolute addresses, from position 1', () => {
    expect(build()['@graph'][0]).toEqual({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Каталог', item: 'https://site.test/catalog' },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Платья',
          item: 'https://site.test/catalog/dresses',
        },
      ],
    });
  });

  it('lists the products with their address, image and offer', () => {
    const graph = build({ products: [product('p1'), product('p2', 'Юбка', false)] })['@graph'];
    expect(graph).toHaveLength(2);
    expect(graph[1]).toEqual({
      '@type': 'ItemList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          item: {
            '@type': 'Product',
            name: 'Платье',
            url: 'https://site.test/products/p1',
            image: 'https://site.test/media/p1.jpg',
            offers: {
              '@type': 'Offer',
              price: 1990,
              priceCurrency: 'RUB',
              url: 'https://site.test/products/p1',
            },
          },
        },
        {
          '@type': 'ListItem',
          position: 2,
          item: {
            '@type': 'Product',
            name: 'Юбка',
            url: 'https://site.test/products/p2',
            offers: {
              '@type': 'Offer',
              price: 1990,
              priceCurrency: 'RUB',
              url: 'https://site.test/products/p2',
            },
          },
        },
      ],
    });
  });

  it('has no ItemList for an empty batch', () => {
    expect(build()['@graph'].map((node) => node['@type'])).toEqual(['BreadcrumbList']);
  });

  it('adds the site with its search and the organization on the catalog root only', () => {
    const root = build({ isCatalogRoot: true })['@graph'];
    expect(root.map((node) => node['@type'])).toEqual([
      'BreadcrumbList',
      'WebSite',
      'Organization',
    ]);
    expect(root[1]).toMatchObject({
      '@type': 'WebSite',
      name: 'Lamoda AI Fitting',
      url: 'https://site.test/',
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: 'https://site.test/catalog?q={search_term_string}',
        },
        'query-input': 'required name=search_term_string',
      },
    });
    expect(root[2]).toEqual({
      '@type': 'Organization',
      name: 'Lamoda AI Fitting',
      url: 'https://site.test/',
    });
    expect(build({ isCatalogRoot: false })['@graph']).toHaveLength(1);
  });
});

describe('jsonLdText', () => {
  it('escapes every less-than sign, so a name cannot end the script', () => {
    const name = '</script><script>alert(1)</script> <b>';
    const text = jsonLdText(build({ products: [product('p1', name)] }));
    expect(text).not.toContain('<');
    expect(text).toContain('\\' + 'u003c/script>');
    const parsed = JSON.parse(text) as ReturnType<typeof build>;
    expect(JSON.stringify(parsed['@graph'][1])).toContain(JSON.stringify(name).slice(1, -1));
    expect(parsed['@graph'][1]).toMatchObject({
      itemListElement: [{ item: { name } }],
    });
  });
});
