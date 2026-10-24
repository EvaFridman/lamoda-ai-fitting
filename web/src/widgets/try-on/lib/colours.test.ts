import { describe, expect, it } from 'vitest';

import type { Fitting } from '@/entities/fitting';
import type { ProductDetail } from '@/entities/product';

import { productColours, triedColours } from './colours';

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const PHOTO = '00000000-0000-4000-8000-0000000000f1';
const OTHER_PHOTO = '00000000-0000-4000-8000-0000000000f2';
const PRODUCT = '00000000-0000-4000-8000-0000000000a1';
const OTHER_PRODUCT = '00000000-0000-4000-8000-0000000000a2';
const RED = '00000000-0000-4000-8000-0000000000c1';
const BLUE = '00000000-0000-4000-8000-0000000000c2';

function product(attributes: ProductDetail['attributes']): ProductDetail {
  return {
    id: ID,
    article: 'A-1',
    name: 'Dress',
    brand: { id: ID, name: 'Brand' },
    category: { id: ID, name: 'Dresses', slug: 'dresses' },
    image: null,
    price: 1,
    discount: 0,
    finalPrice: 1,
    rating: null,
    createdAt: '2026-10-01T12:00:00.000Z',
    description: null,
    images: [],
    variations: [],
    attributes,
  };
}

const COLOUR_ATTRIBUTE = {
  attribute: { id: ID, name: 'Цвет' },
  values: [
    { id: RED, value: 'Красный', colorHex: '#FF0000' },
    { id: BLUE, value: 'Синий', colorHex: '#0000FF' },
  ],
};
const MATERIAL_ATTRIBUTE = {
  attribute: { id: ID, name: 'Материал' },
  values: [{ id: ID, value: 'Хлопок', colorHex: null }],
};

describe('productColours', () => {
  it('gives the values of the attribute that has swatch colours', () => {
    expect(productColours(product([MATERIAL_ATTRIBUTE, COLOUR_ATTRIBUTE]))).toEqual(
      COLOUR_ATTRIBUTE.values,
    );
  });

  it('counts an attribute with one coloured value among plain ones', () => {
    const attribute = {
      attribute: { id: ID, name: 'Цвет' },
      values: [
        { id: RED, value: 'Красный', colorHex: '#FF0000' },
        { id: BLUE, value: 'В полоску', colorHex: null },
      ],
    };
    expect(productColours(product([attribute]))).toHaveLength(2);
  });

  it('gives none for a product without a colour attribute', () => {
    expect(productColours(product([MATERIAL_ATTRIBUTE]))).toEqual([]);
    expect(productColours(product([]))).toEqual([]);
  });

  it('gives none while the product is not loaded', () => {
    expect(productColours(undefined)).toEqual([]);
  });
});

function fitting(patch: {
  status?: Fitting['status'];
  kind?: Fitting['kind'];
  photoId?: string | null;
  productId?: string;
  attributeValueId?: string | null;
}): Fitting {
  return {
    id: ID,
    kind: patch.kind ?? 'single',
    parentId: null,
    status: patch.status ?? 'completed',
    stage: 'done',
    failureCode: null,
    countsAgainstLimit: true,
    regenerationFree: true,
    model: 'gpt-image-2',
    items: [
      {
        productId: patch.productId ?? PRODUCT,
        name: 'Dress',
        brand: 'B',
        imageUrl: null,
        price: 1,
        finalPrice: 1,
        attributeValueId: patch.attributeValueId === undefined ? RED : patch.attributeValueId,
        colour: null,
      },
    ],
    photoId: patch.photoId === undefined ? PHOTO : patch.photoId,
    resultUrl: null,
    createdAt: '2026-10-20T12:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    estimatedSeconds: null,
  };
}

describe('triedColours', () => {
  it('collects the colours of completed single try-ons of the product on the photo', () => {
    const tried = triedColours(
      [fitting({ attributeValueId: RED }), fitting({ attributeValueId: BLUE })],
      PHOTO,
      PRODUCT,
    );
    expect([...tried].sort()).toEqual([RED, BLUE].sort());
  });

  it.each([
    ['another photo', { photoId: OTHER_PHOTO }],
    ['another product', { productId: OTHER_PRODUCT }],
    ['a failed one', { status: 'failed' as const }],
    ['a running one', { status: 'processing' as const }],
    ['a look', { kind: 'look' as const }],
    ['one with no colour', { attributeValueId: null }],
  ])('leaves out %s', (_name, patch) => {
    expect(triedColours([fitting(patch)], PHOTO, PRODUCT).size).toBe(0);
  });

  it('gives none without a photo or a product', () => {
    expect(triedColours([fitting({})], null, PRODUCT).size).toBe(0);
    expect(triedColours([fitting({})], PHOTO, undefined).size).toBe(0);
  });

  it('gives none for an empty history', () => {
    expect(triedColours([], PHOTO, PRODUCT).size).toBe(0);
  });
});
