// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: vi.fn(() => Promise.resolve()) }));
vi.mock('@/shared/config/server', () => ({
  getServerEnv: () => ({ SITE_URL: 'https://site.test' }),
}));
vi.mock('@/entities/category/server', () => ({ getCategoryBySlug: vi.fn() }));

import { connection } from 'next/server';

import { getCategoryBySlug } from '@/entities/category/server';

import { generateCatalogMetadata, generateCategoryMetadata } from './metadata';

const get = vi.mocked(getCategoryBySlug);

const category = {
  id: '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b',
  name: 'Платья',
  slug: 'dresses',
  isActive: true,
  description: null,
  sortOrder: 1,
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
};

beforeEach(() => {
  get.mockReset();
});

describe('generateCatalogMetadata', () => {
  it('titles the page and sets the base from SITE_URL, per request', async () => {
    const metadata = await generateCatalogMetadata();
    expect(metadata.title).toBe('Каталог');
    expect(metadata.metadataBase).toEqual(new URL('https://site.test'));
    expect(connection).toHaveBeenCalled();
  });
});

describe('generateCategoryMetadata', () => {
  it('uses the category name as the title', async () => {
    get.mockResolvedValue(category);
    const metadata = await generateCategoryMetadata({
      params: Promise.resolve({ slug: 'dresses' }),
    });
    expect(get).toHaveBeenCalledWith('dresses');
    expect(metadata.title).toBe('Платья');
    expect(metadata.metadataBase).toEqual(new URL('https://site.test'));
  });

  it('falls back to the catalog title for a missing category', async () => {
    get.mockResolvedValue(null);
    const metadata = await generateCategoryMetadata({ params: Promise.resolve({ slug: 'none' }) });
    expect(metadata.title).toBe('Каталог');
  });

  it('falls back to the catalog title when the read fails', async () => {
    get.mockRejectedValue(new Error('down'));
    const metadata = await generateCategoryMetadata({ params: Promise.resolve({ slug: 'x' }) });
    expect(metadata.title).toBe('Каталог');
    expect(metadata.metadataBase).toEqual(new URL('https://site.test'));
  });
});
