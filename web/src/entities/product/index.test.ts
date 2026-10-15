import { describe, expect, it } from 'vitest';

describe('entities/product public entry', () => {
  // Client code imports this entry; it must not pull in `server-only` (no mock here on purpose).
  it('loads without server-only and exports the hooks and options', async () => {
    const entry = await import('./index');
    for (const name of [
      'useProducts',
      'useProductFacets',
      'useProduct',
      'useProductImages',
      'useProductVariations',
      'useProductAttributeValues',
      'productListOptions',
      'productFacetsOptions',
      'productOptions',
      'productImageListOptions',
      'productVariationListOptions',
      'productAttributeValueListOptions',
    ]) {
      expect(typeof (entry as Record<string, unknown>)[name], name).toBe('function');
    }
  });

  it('exports nothing built on apiFetch', async () => {
    const entry = await import('./index');
    for (const name of [
      'getProducts',
      'getProductFacets',
      'getProduct',
      'getProductImages',
      'getProductVariations',
      'getProductAttributeValues',
    ]) {
      expect(name in entry, name).toBe(false);
    }
  });
});
