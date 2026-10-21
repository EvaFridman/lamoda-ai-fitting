// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: vi.fn(() => Promise.resolve()) }));
vi.mock('@/shared/config/server', () => ({
  getServerEnv: () => ({ SITE_URL: 'https://site.test' }),
}));
vi.mock('@/entities/category/server', () => ({ getCategories: vi.fn() }));

import { connection } from 'next/server';

import { getCategories } from '@/entities/category/server';

import { catalogCategoriesQuery } from './categories';
import { catalogSitemap } from './sitemap';

const read = vi.mocked(getCategories);

function category(slug: string, updatedAt: string) {
  return { id: slug, name: slug, slug, isActive: true, updatedAt };
}

beforeEach(() => {
  read.mockReset();
  vi.mocked(connection).mockClear();
});

describe('catalogSitemap', () => {
  it('lists the catalog and each category with its update time', async () => {
    read.mockResolvedValue({
      items: [
        category('dresses', '2026-10-01T12:00:00.000Z'),
        category('платья', '2026-10-02T12:00:00.000Z'),
      ],
    } as unknown as Awaited<ReturnType<typeof getCategories>>);
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
  });
});
