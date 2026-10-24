import 'server-only';

import { cache } from 'react';

import { findCategoryById, getActiveCategories } from '@/entities/category/server';
import type { ProductDetail } from '@/entities/product';
import { getProductById } from '@/entities/product/server';

// The page's product, once per render (`generateMetadata` and the page both ask): read on the
// visitor's behalf, then its category looked up in the cached list of active ones (spec 0019 A80,
// A81), as `getCategoryBySlug` does: a category not in it (activated since the list was read, or the
// list failed) is read on the visitor's behalf. `null` for an unknown id or a product of an inactive
// category (the page's 404, AC21); a failed read of the product or of that category throws.
export const loadProduct = cache(async (id: string): Promise<ProductDetail | null> => {
  const product = await getProductById(id);
  if (product === null) return null;
  const listed = await getActiveCategories().then(
    ({ items }) => items.some((category) => category.id === product.category.id),
    () => false,
  );
  if (listed) return product;
  const category = await findCategoryById(product.category.id);
  return category?.isActive ? product : null;
});
