import { describe, expect, it } from 'vitest';

import { productFacetsSchema, productListItemSchema } from '@/entities/product';

import { catalogFacets, catalogProducts } from './catalog';

// The catalog sections show these as the api would answer them: a change of web's schemas that
// the example data no longer meets fails here, not on the page (spec 0009, AC12).
describe('catalog example data', () => {
  it.each(Object.entries(catalogProducts))(
    'product "%s" matches the list item schema',
    (_, item) => {
      expect(productListItemSchema.safeParse(item).error).toBeUndefined();
    },
  );

  it('matches the facets schema', () => {
    expect(productFacetsSchema.safeParse(catalogFacets).error).toBeUndefined();
  });

  it('is refused when broken, so the checks above can fail', () => {
    const relativePhoto = { ...catalogProducts.discounted, image: { url: '/media/1.webp' } };
    // Every colour written as a word instead of `#RRGGBB`.
    const badHex = {
      ...catalogFacets,
      attributes: catalogFacets.attributes.map((attribute) => ({
        ...attribute,
        values: attribute.values.map((item) => ({
          ...item,
          colorHex: item.colorHex === null ? null : item.value,
        })),
      })),
    };

    expect(productListItemSchema.safeParse(relativePhoto).success).toBe(false);
    expect(productFacetsSchema.safeParse(badHex).success).toBe(false);
  });
});
