// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T>(fn: T) => fn,
}));
vi.mock('@/entities/category/server', () => ({
  getActiveCategories: vi.fn(),
  findCategoryById: vi.fn(),
}));
vi.mock('@/entities/product/server', () => ({ getProductById: vi.fn() }));

import { findCategoryById, getActiveCategories } from '@/entities/category/server';
import type { ProductDetail } from '@/entities/product';
import { getProductById } from '@/entities/product/server';

import { loadProduct, loadProductWithSlot } from './load-product';

const read = vi.mocked(getProductById);
const categories = vi.mocked(getActiveCategories);
const lookup = vi.mocked(findCategoryById);

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const CATEGORY = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const OTHER = '00000000-0000-4000-8000-0000000000c1';

const product = { id: ID, category: { id: CATEGORY } } as unknown as ProductDetail;

function active(...ids: string[]) {
  return {
    items: ids.map((id) => ({ id })),
    total: ids.length,
  } as unknown as Awaited<ReturnType<typeof getActiveCategories>>;
}

beforeEach(() => {
  read.mockReset();
  categories.mockReset();
  lookup.mockReset();
});

describe('loadProductWithSlot', () => {
  function listed(...entries: { id: string; slot: string | null }[]) {
    return {
      items: entries,
      total: entries.length,
    } as unknown as Awaited<ReturnType<typeof getActiveCategories>>;
  }

  it('gives the slot of the category in the cached list, without a lookup (A18)', async () => {
    read.mockResolvedValue(product);
    categories.mockResolvedValue(
      listed({ id: OTHER, slot: 'shoes' }, { id: CATEGORY, slot: 'top' }),
    );
    await expect(loadProductWithSlot(ID)).resolves.toEqual({ product, slot: 'top' });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('gives a null slot for a category outside the fitting room', async () => {
    read.mockResolvedValue(product);
    categories.mockResolvedValue(listed({ id: CATEGORY, slot: null }));
    await expect(loadProductWithSlot(ID)).resolves.toEqual({ product, slot: null });
  });

  it('takes the slot from the lookup when the list lacks the category', async () => {
    read.mockResolvedValue(product);
    categories.mockResolvedValue(listed({ id: OTHER, slot: 'shoes' }));
    lookup.mockResolvedValue({ id: CATEGORY, isActive: true, slot: 'bottom' } as never);
    await expect(loadProductWithSlot(ID)).resolves.toEqual({ product, slot: 'bottom' });
    expect(lookup).toHaveBeenCalledWith(CATEGORY);
  });

  it('takes the slot from the lookup when the list fails', async () => {
    read.mockResolvedValue(product);
    categories.mockRejectedValue(new Error('categories down'));
    lookup.mockResolvedValue({ id: CATEGORY, isActive: true, slot: 'outerwear' } as never);
    await expect(loadProductWithSlot(ID)).resolves.toEqual({ product, slot: 'outerwear' });
  });

  it('is null for an inactive looked-up category, whatever its slot', async () => {
    read.mockResolvedValue(product);
    categories.mockResolvedValue(listed());
    lookup.mockResolvedValue({ id: CATEGORY, isActive: false, slot: 'top' } as never);
    await expect(loadProductWithSlot(ID)).resolves.toBeNull();
  });

  it('is null for a missing product and reads no category', async () => {
    read.mockResolvedValue(null);
    await expect(loadProductWithSlot(ID)).resolves.toBeNull();
    expect(categories).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it('throws when the product read fails', async () => {
    read.mockRejectedValue(new Error('down'));
    await expect(loadProductWithSlot(ID)).rejects.toThrow('down');
  });

  it('throws when the list and the lookup both fail', async () => {
    read.mockResolvedValue(product);
    categories.mockRejectedValue(new Error('categories down'));
    lookup.mockRejectedValue(new Error('lookup down'));
    await expect(loadProductWithSlot(ID)).rejects.toThrow('lookup down');
  });
});

describe('loadProduct', () => {
  it('returns the product of an active category', async () => {
    read.mockResolvedValue(product);
    categories.mockResolvedValue(active(OTHER, CATEGORY));
    await expect(loadProduct(ID)).resolves.toBe(product);
    expect(read).toHaveBeenCalledWith(ID);
  });

  it('returns null for a missing product, without reading the categories', async () => {
    read.mockResolvedValue(null);
    await expect(loadProduct(ID)).resolves.toBeNull();
    expect(categories).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it('returns null for a product of an inactive category', async () => {
    read.mockResolvedValue(product);
    categories.mockResolvedValue(active(OTHER));
    lookup.mockResolvedValue({ id: CATEGORY, isActive: false } as never);
    await expect(loadProduct(ID)).resolves.toBeNull();
  });

  it('returns null when no category is active', async () => {
    read.mockResolvedValue(product);
    categories.mockResolvedValue(active());
    lookup.mockResolvedValue(null);
    await expect(loadProduct(ID)).resolves.toBeNull();
  });

  it('throws when the product read fails', async () => {
    read.mockRejectedValue(new Error('down'));
    await expect(loadProduct(ID)).rejects.toThrow('down');
  });

  it('does not look the category up when the list has it', async () => {
    read.mockResolvedValue(product);
    categories.mockResolvedValue(active(CATEGORY));
    await loadProduct(ID);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('looks up a category missing from the list and returns the product when it is active', async () => {
    read.mockResolvedValue(product);
    categories.mockResolvedValue(active(OTHER));
    lookup.mockResolvedValue({ id: CATEGORY, isActive: true } as never);
    await expect(loadProduct(ID)).resolves.toBe(product);
    expect(lookup).toHaveBeenCalledWith(CATEGORY);
  });

  it('returns null when the looked-up category is inactive', async () => {
    read.mockResolvedValue(product);
    categories.mockResolvedValue(active(OTHER));
    lookup.mockResolvedValue({ id: CATEGORY, isActive: false } as never);
    await expect(loadProduct(ID)).resolves.toBeNull();
  });

  it('returns null when the category is not found', async () => {
    read.mockResolvedValue(product);
    categories.mockResolvedValue(active(OTHER));
    lookup.mockResolvedValue(null);
    await expect(loadProduct(ID)).resolves.toBeNull();
  });

  it('throws when the category lookup fails', async () => {
    read.mockResolvedValue(product);
    categories.mockResolvedValue(active(OTHER));
    lookup.mockRejectedValue(new Error('lookup down'));
    await expect(loadProduct(ID)).rejects.toThrow('lookup down');
  });

  it('returns the product when the list fails and the category is active', async () => {
    read.mockResolvedValue(product);
    categories.mockRejectedValue(new Error('categories down'));
    lookup.mockResolvedValue({ id: CATEGORY, isActive: true } as never);
    await expect(loadProduct(ID)).resolves.toBe(product);
    expect(lookup).toHaveBeenCalledWith(CATEGORY);
  });

  it('returns null when the list fails and the category is inactive', async () => {
    read.mockResolvedValue(product);
    categories.mockRejectedValue(new Error('categories down'));
    lookup.mockResolvedValue({ id: CATEGORY, isActive: false } as never);
    await expect(loadProduct(ID)).resolves.toBeNull();
  });

  it('throws when the list and the category lookup both fail', async () => {
    read.mockResolvedValue(product);
    categories.mockRejectedValue(new Error('categories down'));
    lookup.mockRejectedValue(new Error('lookup down'));
    await expect(loadProduct(ID)).rejects.toThrow('lookup down');
  });
});
