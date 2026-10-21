import { describe, expect, it } from 'vitest';

import { CATEGORY_LIST_MAX } from '@/entities/category';

import { catalogCategoriesQuery, categoryRows } from './categories';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('catalogCategoriesQuery', () => {
  it('asks for the active categories, up to the api page maximum', () => {
    expect(catalogCategoriesQuery).toEqual({ isActive: true, limit: CATEGORY_LIST_MAX });
    expect(CATEGORY_LIST_MAX).toBe(100);
  });
});

describe('categoryRows', () => {
  const facets = {
    categories: [
      { id: id(1), name: 'Платья', count: 5 },
      { id: id(2), name: 'Юбки', count: 3 },
      { id: id(3), name: 'Скрытая', count: 1 },
    ],
  };

  it('keeps the counts categories that have a page, in the counts order', () => {
    const { rows } = categoryRows(facets, [
      { id: id(2), slug: 'skirts' },
      { id: id(1), slug: 'dresses' },
    ]);
    expect(rows.map((row) => row.id)).toEqual([id(1), id(2)]);
    expect(rows[0]).toEqual({ id: id(1), name: 'Платья', count: 5 });
  });

  it('maps ids to slugs', () => {
    const { slugs } = categoryRows(facets, [
      { id: id(1), slug: 'dresses' },
      { id: id(2), slug: 'skirts' },
    ]);
    expect(slugs.get(id(1))).toBe('dresses');
    expect(slugs.get(id(2))).toBe('skirts');
    expect(slugs.get(id(3))).toBeUndefined();
  });

  it('gives no rows until the categories are known', () => {
    expect(categoryRows(facets, []).rows).toEqual([]);
  });

  it('gives no rows without counts', () => {
    expect(categoryRows({ categories: [] }, [{ id: id(1), slug: 'dresses' }]).rows).toEqual([]);
  });
});
