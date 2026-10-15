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

  it('exports the filter, size and sort helpers', async () => {
    const entry = await import('./index');
    for (const name of ['chipValue', 'splitFacetAttributes', 'compareSizes', 'sortSizes']) {
      expect(typeof (entry as Record<string, unknown>)[name], name).toBe('function');
    }
    expect(entry.PRODUCT_SORT_ORDER).toEqual([
      'new',
      'price_desc',
      'price_asc',
      'discount',
      'rating',
    ]);
    expect(entry.productSortLabels.new).toBe('Новинки');
    expect(entry.PRODUCT_SORTS).toContain('rating');
  });

  it('exports the catalog card and its skeleton', async () => {
    const entry = await import('./index');
    for (const name of ['CatalogProductCard', 'CatalogProductCardSkeleton']) {
      expect(typeof (entry as Record<string, unknown>)[name], name).toBe('function');
    }
  });

  it('exports the catalog filters', async () => {
    const entry = await import('./index');
    for (const name of [
      'ColorFilter',
      'AttributeFilter',
      'BrandFilter',
      'SizeFilter',
      'PriceRangeFilter',
      'DiscountFilter',
      'ProductSortFilter',
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
