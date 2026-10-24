// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: vi.fn(() => Promise.resolve()) }));
vi.mock('@/shared/config/server', () => ({
  getServerEnv: () => ({ SITE_URL: 'https://site.test' }),
}));
vi.mock('@/entities/category/server', () => ({ getCategories: vi.fn() }));
vi.mock('@/entities/product/server', () => ({ getSitemapProducts: vi.fn() }));

import { connection } from 'next/server';

import { getCategories } from '@/entities/category/server';
import { getSitemapProducts } from '@/entities/product/server';

import { catalogCategoriesQuery } from './categories';
import { SITEMAP_PRODUCT_MAX, catalogSitemap } from './sitemap';

const read = vi.mocked(getCategories);
const readProducts = vi.mocked(getSitemapProducts);

function category(slug: string, updatedAt: string) {
  return { id: slug, name: slug, slug, isActive: true, updatedAt };
}

function categories(...items: ReturnType<typeof category>[]) {
  return { items } as unknown as Awaited<ReturnType<typeof getCategories>>;
}

function product(id: string, categoryId: string, updatedAt: string) {
  return { id, category: { id: categoryId }, updatedAt } as unknown as Awaited<
    ReturnType<typeof getSitemapProducts>
  >[number];
}

beforeEach(() => {
  read.mockReset();
  readProducts.mockReset();
  readProducts.mockResolvedValue([]);
  vi.mocked(connection).mockClear();
});

describe('catalogSitemap', () => {
  it('lists the catalog and each category with its update time', async () => {
    read.mockResolvedValue(
      categories(
        category('dresses', '2026-10-01T12:00:00.000Z'),
        category('платья', '2026-10-02T12:00:00.000Z'),
      ),
    );
    const sitemap = await catalogSitemap();
    expect(read).toHaveBeenCalledWith(catalogCategoriesQuery);
    expect(connection).toHaveBeenCalledOnce();
    expect(sitemap).toEqual([
      { url: 'https://site.test/catalog' },
      { url: 'https://site.test/catalog/dresses', lastModified: '2026-10-01T12:00:00.000Z' },
      {
        url: `https://site.test/catalog/${encodeURIComponent('платья')}`,
        lastModified: '2026-10-02T12:00:00.000Z',
      },
    ]);
  });

  it('lists only the catalog when the categories cannot be read', async () => {
    read.mockRejectedValue(new Error('down'));
    expect(await catalogSitemap()).toEqual([{ url: 'https://site.test/catalog' }]);
    expect(connection).toHaveBeenCalledOnce();
    expect(readProducts).not.toHaveBeenCalled();
  });

  describe('the products (spec 0019 A81)', () => {
    it('adds a page per product after the categories, dated by its update time', async () => {
      read.mockResolvedValue(categories(category('dresses', '2026-10-01T12:00:00.000Z')));
      readProducts.mockResolvedValue([
        product('p1', 'dresses', '2026-10-03T12:00:00.000Z'),
        product('p 2', 'dresses', '2026-10-04T12:00:00.000Z'),
      ]);
      expect(await catalogSitemap()).toEqual([
        { url: 'https://site.test/catalog' },
        { url: 'https://site.test/catalog/dresses', lastModified: '2026-10-01T12:00:00.000Z' },
        { url: 'https://site.test/products/p1', lastModified: '2026-10-03T12:00:00.000Z' },
        { url: 'https://site.test/products/p%202', lastModified: '2026-10-04T12:00:00.000Z' },
      ]);
    });

    it('asks for at most the bound of products', async () => {
      read.mockResolvedValue(categories());
      await catalogSitemap();
      expect(readProducts).toHaveBeenCalledWith(SITEMAP_PRODUCT_MAX);
      expect(SITEMAP_PRODUCT_MAX).toBe(1000);
    });

    it('leaves out the products of a category that is not active', async () => {
      read.mockResolvedValue(categories(category('dresses', '2026-10-01T12:00:00.000Z')));
      readProducts.mockResolvedValue([
        product('p1', 'dresses', '2026-10-03T12:00:00.000Z'),
        product('p2', 'inactive', '2026-10-04T12:00:00.000Z'),
      ]);
      const urls = (await catalogSitemap()).map(({ url }) => url);
      expect(urls).toContain('https://site.test/products/p1');
      expect(urls).not.toContain('https://site.test/products/p2');
    });

    it('still lists the categories when the products cannot be read', async () => {
      read.mockResolvedValue(categories(category('dresses', '2026-10-01T12:00:00.000Z')));
      readProducts.mockRejectedValue(new Error('down'));
      expect(await catalogSitemap()).toEqual([
        { url: 'https://site.test/catalog' },
        { url: 'https://site.test/catalog/dresses', lastModified: '2026-10-01T12:00:00.000Z' },
      ]);
    });
  });
});
