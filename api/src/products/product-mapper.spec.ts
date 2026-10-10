import { describe, expect, it } from 'vitest';

import { Prisma } from '../generated/prisma/client.js';
import { toDetail, toListItem } from './product-mapper.js';

const BASE = 'http://localhost:3001/media/';
const createdAt = new Date('2026-01-02T03:04:05.000Z');

type DetailRow = Parameters<typeof toDetail>[0];

function row(overrides: Partial<DetailRow> = {}): DetailRow {
  return {
    id: 'p1',
    article: 'ART-1',
    name: 'Dress',
    description: 'Text',
    rating: new Prisma.Decimal('4.5'),
    price: new Prisma.Decimal('1999.99'),
    discount: 15,
    brandId: 'b1',
    categoryId: 'c1',
    createdAt,
    updatedAt: createdAt,
    brand: { id: 'b1', name: 'Brand' },
    category: { id: 'c1', name: 'Category', slug: 'category' },
    images: [],
    variations: [],
    attributeValues: [],
    ...overrides,
  };
}

function link(attributeId: string, attributeName: string, valueId: string, value: string) {
  return {
    attributeValue: {
      id: valueId,
      value,
      attribute: { id: attributeId, name: attributeName },
    },
  };
}

describe('toListItem', () => {
  it('returns exactly the list fields, without updatedAt and description', () => {
    const item = toListItem(row(), BASE);

    expect(Object.keys(item).sort()).toEqual([
      'article',
      'brand',
      'category',
      'createdAt',
      'discount',
      'finalPrice',
      'id',
      'image',
      'name',
      'price',
      'rating',
    ]);
  });

  it('turns Decimal price and rating into numbers and computes finalPrice (AC5)', () => {
    const item = toListItem(row(), BASE);

    expect(item).toMatchObject({ price: 1999.99, rating: 4.5, discount: 15, finalPrice: 1699 });
    expect(typeof item.price).toBe('number');
    expect(typeof item.rating).toBe('number');
  });

  it('keeps a missing rating as null', () => {
    expect(toListItem(row({ rating: null }), BASE).rating).toBeNull();
  });

  it('gives image null without images', () => {
    expect(toListItem(row({ images: [] }), BASE).image).toBeNull();
  });

  it('builds the image url of the first image under the media base', () => {
    const item = toListItem(
      row({
        images: [
          { id: 'i1', imageKey: 'products/a/1.jpg', sortOrder: 0 },
          { id: 'i2', imageKey: 'products/a/2.jpg', sortOrder: 1 },
        ],
      }),
      BASE,
    );

    expect(item.image).toEqual({ url: 'http://localhost:3001/media/products/a/1.jpg' });
  });
});

describe('toDetail', () => {
  it('adds description, images, variations and attributes to the list item', () => {
    const detail = toDetail(
      row({
        images: [
          { id: 'i1', imageKey: 'a/1.jpg', sortOrder: 0 },
          { id: 'i2', imageKey: 'a/2.jpg', sortOrder: 3 },
        ],
        variations: [
          { id: 'v1', size: 'M', stock: 2 },
          { id: 'v2', size: 'S', stock: 0 },
        ],
      }),
      BASE,
    );

    expect(detail).toMatchObject({
      ...toListItem(row(), BASE),
      image: { url: `${BASE}a/1.jpg` },
      description: 'Text',
      images: [
        { id: 'i1', url: `${BASE}a/1.jpg`, sortOrder: 0 },
        { id: 'i2', url: `${BASE}a/2.jpg`, sortOrder: 3 },
      ],
      variations: [
        { id: 'v1', size: 'M', stock: 2 },
        { id: 'v2', size: 'S', stock: 0 },
      ],
      attributes: [],
    });
  });

  it('returns empty arrays and a null image for a bare product', () => {
    const detail = toDetail(row({ description: null }), BASE);

    expect(detail).toMatchObject({
      description: null,
      image: null,
      images: [],
      variations: [],
      attributes: [],
    });
  });

  it('groups consecutive values by attribute and keeps the input order', () => {
    const detail = toDetail(
      row({
        attributeValues: [
          link('a1', 'Color', 'v1', 'black'),
          link('a1', 'Color', 'v2', 'white'),
          link('a2', 'Material', 'v3', 'cotton'),
        ],
      }),
      BASE,
    );

    expect(detail.attributes).toEqual([
      {
        attribute: { id: 'a1', name: 'Color' },
        values: [
          { id: 'v1', value: 'black' },
          { id: 'v2', value: 'white' },
        ],
      },
      { attribute: { id: 'a2', name: 'Material' }, values: [{ id: 'v3', value: 'cotton' }] },
    ]);
  });

  it('does not reorder groups or values it is given', () => {
    const detail = toDetail(
      row({
        attributeValues: [link('z', 'Zed', 'v2', 'b'), link('a', 'Alpha', 'v1', 'a')],
      }),
      BASE,
    );

    expect(detail.attributes.map((group) => group.attribute.id)).toEqual(['z', 'a']);
  });
});
