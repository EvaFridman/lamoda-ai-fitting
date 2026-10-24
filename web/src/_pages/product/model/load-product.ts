import 'server-only';

import { cache } from 'react';

import type { OutfitSlot } from '@/entities/category';
import { findCategoryById, getActiveCategories } from '@/entities/category/server';
import type { ProductDetail } from '@/entities/product';
import { getProductById } from '@/entities/product/server';

export interface LoadedProduct {
  product: ProductDetail;
  // The fitting room's slot of the product's category; null shows no «К образу» (spec 0019 A18).
  slot: OutfitSlot | null;
}

// The page's product, once per render (`generateMetadata` and the page both ask): read on the
// visitor's behalf, then its category looked up in the cached list of active ones (spec 0019 A80,
// A81), as `getCategoryBySlug` does: a category not in it (activated since the list was read, or the
// list failed) is read on the visitor's behalf. `null` for an unknown id or a product of an inactive
// category (the page's 404, AC21); a failed read of the product or of that category throws.
export const loadProductWithSlot = cache(async (id: string): Promise<LoadedProduct | null> => {
  const product = await getProductById(id);
  if (product === null) return null;
  const listed = await getActiveCategories().then(
    ({ items }) => items.find((category) => category.id === product.category.id),
    () => undefined,
  );
  if (listed) return { product, slot: listed.slot };
  const category = await findCategoryById(product.category.id);
  return category?.isActive ? { product, slot: category.slot } : null;
});

export async function loadProduct(id: string): Promise<ProductDetail | null> {
  return (await loadProductWithSlot(id))?.product ?? null;
}
