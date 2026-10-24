// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/shared/config/server', () => ({
  getServerEnv: () => ({ SITE_URL: 'https://site.test' }),
}));
vi.mock('./load-product', () => ({ loadProduct: vi.fn() }));

import type { ProductDetail } from '@/entities/product';

import { loadProduct } from './load-product';
import {
  DESCRIPTION_MAX,
  generateProductMetadata,
  productDescription,
  productMetadata,
  productTitle,
} from './metadata';

const load = vi.mocked(loadProduct);

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';

function product(overrides: Partial<ProductDetail> = {}): ProductDetail {
  return {
    id: ID,
    article: 'A-1',
    name: 'Рубашка Design collection',
    brand: { id: ID, name: 'Annen' },
    category: { id: ID, name: 'Рубашки', slug: 'shirts' },
    image: { url: 'https://site.test/media/cover.jpg' },
    price: 5000,
    discount: 0,
    finalPrice: 5000,
    rating: null,
    createdAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
    description: 'Лёгкая рубашка.',
    images: [
      { id: ID, url: 'https://site.test/media/first.jpg', sortOrder: 0 },
      { id: ID, url: 'https://site.test/media/second.jpg', sortOrder: 1 },
    ],
    variations: [],
    attributes: [],
    ...overrides,
  };
}

beforeEach(() => {
  load.mockReset();
});

describe('productTitle', () => {
  it('names the brand and the product and sells it', () => {
    expect(productTitle(product())).toBe(
      'Annen Рубашка Design collection — купить в Lamoda AI Fitting',
    );
  });
});

describe('productDescription', () => {
  it('uses the own description', () => {
    expect(productDescription(product())).toBe('Лёгкая рубашка.');
  });

  it('collapses whitespace and line breaks into single spaces', () => {
    expect(
      productDescription(product({ description: '  Лёгкая \n\n рубашка\t из   хлопка. ' })),
    ).toBe('Лёгкая рубашка из хлопка.');
  });

  it('keeps a description of exactly 160 characters', () => {
    const exact = 'а'.repeat(DESCRIPTION_MAX);
    expect(productDescription(product({ description: exact }))).toBe(exact);
  });

  it('cuts a longer one to 159 characters and an ellipsis', () => {
    const result = productDescription(product({ description: 'а'.repeat(DESCRIPTION_MAX + 1) }));
    expect(result).toBe(`${'а'.repeat(DESCRIPTION_MAX - 1)}…`);
    expect(result).toHaveLength(DESCRIPTION_MAX);
  });

  it('does not leave a space before the ellipsis', () => {
    const text = `${'а'.repeat(DESCRIPTION_MAX - 2)} ${'б'.repeat(20)}`;
    const result = productDescription(product({ description: text }));
    expect(result).toBe(`${'а'.repeat(DESCRIPTION_MAX - 2)}…`);
  });

  it.each([null, '', '   \n\t '])('falls back to the template for %j', (description) => {
    expect(productDescription(product({ description }))).toBe(
      'Annen Рубашка Design collection с виртуальной примеркой в Lamoda AI Fitting.',
    );
  });
});

describe('productMetadata', () => {
  it('sets a full title, the description, the base and the canonical address', () => {
    const metadata = productMetadata(product());
    expect(metadata.title).toEqual({
      absolute: 'Annen Рубашка Design collection — купить в Lamoda AI Fitting',
    });
    expect(metadata.description).toBe('Лёгкая рубашка.');
    expect(metadata.metadataBase).toEqual(new URL('https://site.test'));
    expect(metadata.alternates?.canonical).toBe(`/products/${ID}`);
    expect(metadata.robots).toBeUndefined();
  });

  it('previews the link with the first photo of the gallery', () => {
    const metadata = productMetadata(product());
    const image = { url: 'https://site.test/media/first.jpg', alt: 'Рубашка Design collection' };
    expect(metadata.openGraph).toMatchObject({
      type: 'website',
      siteName: 'Lamoda AI Fitting',
      locale: 'ru_RU',
      url: `/products/${ID}`,
      title: 'Annen Рубашка Design collection — купить в Lamoda AI Fitting',
      description: 'Лёгкая рубашка.',
      images: [image],
    });
    expect(metadata.twitter).toMatchObject({ card: 'summary_large_image', images: [image] });
  });

  it('takes the cover image when the gallery is empty', () => {
    const metadata = productMetadata(product({ images: [] }));
    expect(metadata.openGraph).toMatchObject({
      images: [{ url: 'https://site.test/media/cover.jpg' }],
    });
  });

  it('is a plain summary card without any image', () => {
    const metadata = productMetadata(product({ images: [], image: null }));
    expect(metadata.twitter).toMatchObject({ card: 'summary' });
    expect(metadata.openGraph).toMatchObject({ images: undefined });
    expect(metadata.twitter).toMatchObject({ images: undefined });
  });

  it('encodes the id in the canonical address', () => {
    const metadata = productMetadata(product({ id: 'a b/c' }));
    expect(metadata.alternates?.canonical).toBe(`/products/${encodeURIComponent('a b/c')}`);
  });
});

describe('generateProductMetadata', () => {
  const params = Promise.resolve({ id: ID });

  it('describes a loaded product', async () => {
    load.mockResolvedValue(product());
    const metadata = await generateProductMetadata({ params });
    expect(load).toHaveBeenCalledWith(ID);
    expect(metadata.title).toEqual({
      absolute: 'Annen Рубашка Design collection — купить в Lamoda AI Fitting',
    });
    expect(metadata.robots).toBeUndefined();
  });

  it('only forbids indexing for a missing or inactive product', async () => {
    load.mockResolvedValue(null);
    expect(await generateProductMetadata({ params })).toEqual({
      robots: { index: false, follow: true },
    });
  });

  it('only forbids indexing when the read fails, instead of throwing', async () => {
    load.mockRejectedValue(new Error('down'));
    expect(await generateProductMetadata({ params })).toEqual({
      robots: { index: false, follow: true },
    });
  });
});
