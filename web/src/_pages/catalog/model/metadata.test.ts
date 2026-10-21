// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/shared/config/server', () => ({
  getServerEnv: () => ({ SITE_URL: 'https://site.test' }),
}));
vi.mock('@/entities/category/server', () => ({ getCategoryBySlug: vi.fn() }));
vi.mock('@/entities/product/server', () => ({ getProductFacets: vi.fn() }));

import { getCategoryBySlug } from '@/entities/category/server';
import type { ProductFacets } from '@/entities/product';
import { getProductFacets } from '@/entities/product/server';

import {
  generateCatalogMetadata,
  generateCategoryMetadata,
  isIndexable,
  templateDescription,
} from './metadata';
import { parseCatalogUrl } from './url-state';

const get = vi.mocked(getCategoryBySlug);
const facets = vi.mocked(getProductFacets);

const uuid = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const NBSP = String.fromCodePoint(0xa0);
const FULL_TITLE_TAIL = ' — Виртуальная примерка | Lamoda AI Fitting';

const category = {
  id: uuid,
  name: 'Платья',
  slug: 'dresses',
  isActive: true,
  description: null,
  sortOrder: 1,
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
};

function facetsOf(total: number, min: number | null): ProductFacets {
  return {
    total,
    price: min === null ? null : { min, max: min + 1000 },
  } as unknown as ProductFacets;
}

type Params = Record<string, string | undefined>;

function catalog(params: Params = {}) {
  return generateCatalogMetadata({ searchParams: Promise.resolve(params) });
}

function categoryPage(slug = 'dresses', params: Params = {}) {
  return generateCategoryMetadata({
    params: Promise.resolve({ slug }),
    searchParams: Promise.resolve(params),
  });
}

beforeEach(() => {
  get.mockReset();
  facets.mockReset();
  facets.mockRejectedValue(new Error('down'));
});

describe('isIndexable', () => {
  it.each([
    ['no parameters', {}],
    ['a sort only', { sort: 'price_asc' }],
    ['an invalid brand', { brandId: 'garbage' }],
    ['hasDiscount=false', { hasDiscount: 'false' }],
    ['an empty search', { q: '   ' }],
  ])('keeps %s indexable', (_name, params) => {
    expect(isIndexable(parseCatalogUrl(params))).toBe(true);
  });

  it.each([
    ['a brand', { brandId: uuid }],
    ['a size', { size: '42' }],
    ['an attribute value', { attributeValueId: uuid }],
    ['a minimum price', { minPrice: '100' }],
    ['a maximum price', { maxPrice: '900' }],
    ['a discount', { hasDiscount: 'true' }],
    ['a search', { q: 'платье' }],
    ['a cursor', { cursor: 'abc' }],
    ['a sort with a filter', { sort: 'price_asc', minPrice: '1' }],
  ])('refuses %s', (_name, params) => {
    expect(isIndexable(parseCatalogUrl(params))).toBe(false);
  });
});

describe('templateDescription', () => {
  it('names the count and no price', () => {
    expect(templateDescription('Платья', facetsOf(128, 1990))).toBe(
      'Платья: 128 товаров с виртуальной примеркой в Lamoda AI Fitting.',
    );
  });

  it('groups the digits of a long count with a no-break space', () => {
    expect(templateDescription('Платья', facetsOf(8340, 1990))).toBe(
      `Платья: 8${NBSP}340 товаров с виртуальной примеркой в Lamoda AI Fitting.`,
    );
  });

  it('does not need a price', () => {
    expect(templateDescription('Платья', facetsOf(5, null))).toBe(
      'Платья: 5 товаров с виртуальной примеркой в Lamoda AI Fitting.',
    );
  });

  it.each([
    ['no product', facetsOf(0, 1990)],
    ['no facets', undefined],
  ])('leaves the count out for %s', (_name, input) => {
    expect(templateDescription('Платья', input)).toBe(
      'Платья с виртуальной примеркой в Lamoda AI Fitting.',
    );
  });
});

describe('generateCatalogMetadata', () => {
  it('titles the page, sets the base and the canonical address', async () => {
    const metadata = await catalog();
    expect(metadata.title).toBe('Каталог');
    expect(metadata.metadataBase).toEqual(new URL('https://site.test'));
    expect(metadata.alternates?.canonical).toBe('/catalog');
    expect(metadata.robots).toBeUndefined();
  });

  it.each([{}, { sort: 'price_asc' }, { brandId: 'garbage' }])(
    'describes an indexable catalog %j from its unfiltered counts',
    async (params) => {
      facets.mockResolvedValue(facetsOf(3, 500));
      const metadata = await catalog(params);
      expect(facets).toHaveBeenCalledWith({});
      expect(metadata.description).toBe(
        'Каталог: 3 товара с виртуальной примеркой в Lamoda AI Fitting.',
      );
    },
  );

  it.each([{ brandId: uuid }, { q: 'a' }, { cursor: 'x' }, { hasDiscount: 'true' }])(
    'does not read the counts for a noindex address %j',
    async (params) => {
      facets.mockResolvedValue(facetsOf(3, 500));
      const metadata = await catalog(params);
      expect(facets).not.toHaveBeenCalled();
      expect(metadata.description).toBe('Каталог с виртуальной примеркой в Lamoda AI Fitting.');
    },
  );

  it('describes the catalog without the offer when the counts fail', async () => {
    const metadata = await catalog();
    expect(metadata.description).toBe('Каталог с виртуальной примеркой в Lamoda AI Fitting.');
  });

  it('never puts parameters into the canonical address', async () => {
    const metadata = await catalog({ q: 'платье', cursor: 'x', minPrice: '1' });
    expect(metadata.alternates?.canonical).toBe('/catalog');
  });

  it('is noindex, follow for a filter, a search or a cursor', async () => {
    const filtered: Record<string, string>[] = [
      { brandId: uuid },
      { q: 'a' },
      { cursor: 'x' },
      { hasDiscount: 'true' },
    ];
    for (const params of filtered) {
      expect((await catalog(params)).robots).toEqual({ index: false, follow: true });
    }
  });

  it('stays indexable with a sort only or with invalid parameters only', async () => {
    const plain: Record<string, string>[] = [
      { sort: 'price_asc' },
      { brandId: 'garbage' },
      { hasDiscount: 'false' },
    ];
    for (const params of plain) {
      expect((await catalog(params)).robots).toBeUndefined();
    }
  });

  it('sets the link previews', async () => {
    const metadata = await catalog();
    const fullTitle = `Каталог${FULL_TITLE_TAIL}`;
    expect(metadata.openGraph).toMatchObject({
      type: 'website',
      siteName: 'Lamoda AI Fitting',
      locale: 'ru_RU',
      url: '/catalog',
      title: fullTitle,
      description: metadata.description,
      images: [{ url: '/catalog/opengraph-image', width: 1200, height: 630, type: 'image/png' }],
    });
    expect(metadata.twitter).toMatchObject({
      card: 'summary_large_image',
      title: fullTitle,
      images: [{ url: '/catalog/twitter-image', width: 1200, height: 630 }],
    });
  });
});

describe('generateCategoryMetadata', () => {
  it('uses the category name, base and canonical address', async () => {
    get.mockResolvedValue(category);
    const metadata = await categoryPage();
    expect(get).toHaveBeenCalledWith('dresses');
    expect(metadata.title).toBe('Платья');
    expect(metadata.metadataBase).toEqual(new URL('https://site.test'));
    expect(metadata.alternates?.canonical).toBe('/catalog/dresses');
    expect(metadata.robots).toBeUndefined();
  });

  it('encodes the slug in the canonical address', async () => {
    get.mockResolvedValue({ ...category, slug: 'платья и юбки' });
    const metadata = await categoryPage('x');
    expect(metadata.alternates?.canonical).toBe(`/catalog/${encodeURIComponent('платья и юбки')}`);
    expect(metadata.openGraph?.url).toBe(`/catalog/${encodeURIComponent('платья и юбки')}`);
  });

  it('uses the trimmed description and does not read the counts', async () => {
    get.mockResolvedValue({ ...category, description: '  Лёгкие платья  ' });
    const metadata = await categoryPage();
    expect(metadata.description).toBe('Лёгкие платья');
    expect(facets).not.toHaveBeenCalled();
  });

  it.each([null, '', '   '])('falls back to the template for description %j', async (value) => {
    get.mockResolvedValue({ ...category, description: value });
    facets.mockResolvedValue(facetsOf(21, 1990));
    const metadata = await categoryPage();
    expect(facets).toHaveBeenCalledWith({ categoryId: [uuid] });
    expect(metadata.description).toBe(
      'Платья: 21 товар с виртуальной примеркой в Lamoda AI Fitting.',
    );
  });

  it.each([{ size: '42' }, { q: 'a' }, { cursor: 'x' }])(
    'does not read the counts for a noindex address %j',
    async (params) => {
      get.mockResolvedValue(category);
      facets.mockResolvedValue(facetsOf(21, 1990));
      const metadata = await categoryPage('dresses', params);
      expect(facets).not.toHaveBeenCalled();
      expect(metadata.description).toBe('Платья с виртуальной примеркой в Lamoda AI Fitting.');
    },
  );

  it('reads the counts for a sort-only address', async () => {
    get.mockResolvedValue(category);
    facets.mockResolvedValue(facetsOf(21, 1990));
    await categoryPage('dresses', { sort: 'price_asc' });
    expect(facets).toHaveBeenCalledWith({ categoryId: [uuid] });
  });

  it('leaves the offer out when the counts fail', async () => {
    get.mockResolvedValue(category);
    const metadata = await categoryPage();
    expect(metadata.description).toBe('Платья с виртуальной примеркой в Lamoda AI Fitting.');
  });

  it('is noindex, follow with a filter and keeps the canonical address clean', async () => {
    get.mockResolvedValue(category);
    const metadata = await categoryPage('dresses', { size: '42', cursor: 'x' });
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates?.canonical).toBe('/catalog/dresses');
  });

  it('stays indexable with a sort only', async () => {
    get.mockResolvedValue(category);
    expect((await categoryPage('dresses', { sort: 'price_asc' })).robots).toBeUndefined();
  });

  it('puts the full title and the previews into the link previews', async () => {
    get.mockResolvedValue(category);
    const metadata = await categoryPage();
    expect(metadata.openGraph).toMatchObject({
      type: 'website',
      siteName: 'Lamoda AI Fitting',
      locale: 'ru_RU',
      url: '/catalog/dresses',
      title: `Платья${FULL_TITLE_TAIL}`,
      images: [{ url: '/catalog/opengraph-image', width: 1200, height: 630 }],
    });
    expect(metadata.twitter).toMatchObject({
      card: 'summary_large_image',
      images: [{ url: '/catalog/twitter-image', width: 1200, height: 630 }],
    });
  });

  it.each([
    ['missing', () => get.mockResolvedValue(null)],
    ['inactive', () => get.mockResolvedValue({ ...category, isActive: false })],
    ['unreadable', () => get.mockRejectedValue(new Error('down'))],
  ])('falls back to the catalog, not indexed, for a %s category', async (_name, arrange) => {
    arrange();
    const metadata = await categoryPage('x');
    expect(metadata.title).toBe('Каталог');
    expect(metadata.alternates?.canonical).toBe('/catalog');
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.metadataBase).toEqual(new URL('https://site.test'));
  });
});
