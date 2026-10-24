import { describe, expect, it } from 'vitest';

import type { ProductDetail } from '@/entities/product';

import { productJsonLd } from './json-ld';

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const siteUrl = 'https://site.test';
const breadcrumbs = [
  { name: 'Каталог', path: '/catalog' },
  { name: 'Рубашки', path: '/catalog/shirts' },
];

function product(overrides: Partial<ProductDetail> = {}): ProductDetail {
  return {
    id: ID,
    article: 'A-1',
    name: 'Рубашка',
    brand: { id: ID, name: 'Annen' },
    category: { id: ID, name: 'Рубашки', slug: 'shirts' },
    image: null,
    price: 5000,
    discount: 10,
    finalPrice: 4500,
    rating: null,
    createdAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
    description: 'Лёгкая рубашка.',
    images: [
      { id: ID, url: 'https://site.test/media/1.jpg', sortOrder: 0 },
      { id: ID, url: 'https://site.test/media/2.jpg', sortOrder: 1 },
    ],
    variations: [
      { id: ID, size: 'S', stock: 0 },
      { id: ID, size: 'M', stock: 2 },
    ],
    attributes: [],
    ...overrides,
  };
}

function build(overrides: Partial<ProductDetail> = {}) {
  return productJsonLd({ siteUrl, product: product(overrides), breadcrumbs });
}

function productNode(overrides: Partial<ProductDetail> = {}) {
  return build(overrides)['@graph'][0] as unknown as Record<string, unknown>;
}

describe('productJsonLd', () => {
  it('has the schema.org context and the product with its breadcrumbs', () => {
    const data = build();
    expect(data['@context']).toBe('https://schema.org');
    expect(data['@graph'].map((node) => node['@type'])).toEqual(['Product', 'BreadcrumbList']);
  });

  it('describes the product', () => {
    expect(productNode()).toEqual({
      '@type': 'Product',
      name: 'Рубашка',
      sku: 'A-1',
      brand: { '@type': 'Brand', name: 'Annen' },
      url: `https://site.test/products/${ID}`,
      image: ['https://site.test/media/1.jpg', 'https://site.test/media/2.jpg'],
      description: 'Лёгкая рубашка.',
      offers: {
        '@type': 'Offer',
        price: 4500,
        priceCurrency: 'RUB',
        availability: 'https://schema.org/InStock',
        url: `https://site.test/products/${ID}`,
      },
    });
  });

  it('leaves the images out when there is neither a gallery nor a cover', () => {
    expect(productNode({ images: [], image: null })).not.toHaveProperty('image');
  });

  it('falls back to the cover when the gallery is empty', () => {
    expect(
      productNode({ images: [], image: { url: 'https://site.test/media/cover.jpg' } }),
    ).toMatchObject({ image: ['https://site.test/media/cover.jpg'] });
  });

  it('prefers the gallery to the cover', () => {
    const node = productNode({ image: { url: 'https://site.test/media/cover.jpg' } });
    expect(node.image).toEqual(['https://site.test/media/1.jpg', 'https://site.test/media/2.jpg']);
  });

  it.each([null, '', '  \n '])('leaves a description of %j out', (description) => {
    expect(productNode({ description })).not.toHaveProperty('description');
  });

  it('trims the description', () => {
    expect(productNode({ description: '  Текст  ' })).toMatchObject({ description: 'Текст' });
  });

  it('is in stock while any size is', () => {
    const offers = productNode().offers as { availability: string };
    expect(offers.availability).toBe('https://schema.org/InStock');
  });

  it.each([
    ['all sizes sold out', [{ id: ID, size: 'S', stock: 0 }]],
    ['no size at all', []],
  ])('is out of stock for %s', (_name, variations) => {
    const offers = productNode({ variations }).offers as { availability: string };
    expect(offers.availability).toBe('https://schema.org/OutOfStock');
  });

  it('offers the final price, not the list one', () => {
    const offers = productNode({ price: 9000, discount: 50, finalPrice: 4500 }).offers as {
      price: number;
    };
    expect(offers.price).toBe(4500);
  });

  it('lists the trail and then the product, positions from 1, absolute addresses', () => {
    expect(build()['@graph'][1]).toEqual({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Каталог', item: 'https://site.test/catalog' },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Рубашки',
          item: 'https://site.test/catalog/shirts',
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: 'Рубашка',
          item: `https://site.test/products/${ID}`,
        },
      ],
    });
  });

  it('encodes the id in every address', () => {
    const node = productNode({ id: 'a b' });
    expect(node.url).toBe('https://site.test/products/a%20b');
  });
});
