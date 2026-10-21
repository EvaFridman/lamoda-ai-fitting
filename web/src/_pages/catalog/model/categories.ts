import {
  type CatalogCategory,
  type Category,
  CATEGORY_LIST_MAX,
  type CategoryListQuery,
} from '@/entities/category';
import type { ProductFacets } from '@/entities/product';

// The active categories, read for their slugs: the filter counts name a category by id only.
export const catalogCategoriesQuery: CategoryListQuery = {
  isActive: true,
  limit: CATEGORY_LIST_MAX,
};

// The list on the left (O5): the counts' categories under the current filters that have a page (an
// active category, by its slug), in the counts' order. The api leaves out a category with no
// product, unless it is the chosen one.
export function categoryRows(
  facets: Pick<ProductFacets, 'categories'>,
  categories: readonly Pick<Category, 'id' | 'slug'>[],
): { rows: CatalogCategory[]; slugs: Map<string, string> } {
  const slugs = new Map(categories.map((category) => [category.id, category.slug]));
  return { rows: facets.categories.filter((category) => slugs.has(category.id)), slugs };
}
