import { priceLabel, type PriceRange } from '@/shared/ui';

import type { ProductSort } from '../model/filters';
import type { FacetAttribute, FacetBrand, FacetPrice, FacetSize } from '../model/schemas';
import { isColourAttribute } from './facets';
import { defaultProductSort } from './filter-options';
import { sortSizes } from './sizes';
import { productSortLabels } from './sorts';

// The grey text of a row of the filters' sheet (spec 0020 plan §3): what is chosen in that filter,
// the chosen names joined by ", " in the order of the filter's list; undefined when nothing is. A
// chosen value missing from the current counts is left out, as the filter's list leaves it out.
// The row cuts a long text with an ellipsis; these never cut it.

function joined(names: readonly string[]): string | undefined {
  return names.length === 0 ? undefined : names.join(', ');
}

export const filterSummary = {
  // The chosen values in the api's order; a colour attribute's in lower case, as on Lamoda
  // ("бежевый, черный").
  attribute(attribute: FacetAttribute, value: readonly string[]): string | undefined {
    const coloured = isColourAttribute(attribute);
    return joined(
      attribute.values
        .filter((item) => value.includes(item.id))
        .map((item) => (coloured ? item.value.toLocaleLowerCase('ru') : item.value)),
    );
  },

  brand(brands: readonly FacetBrand[], value: readonly string[]): string | undefined {
    return joined(brands.filter((brand) => value.includes(brand.id)).map((brand) => brand.name));
  },

  // In clothing order (0009 K13), whatever the order they were ticked in.
  size(sizes: readonly FacetSize[], value: readonly string[]): string | undefined {
    const shown = new Set(sizes.map((item) => item.size));
    return joined(sortSizes(value.filter((size) => shown.has(size))));
  },

  // The price chip's text: the chosen range as it is, both sides when it equals the bounds or
  // there are no products to bound it.
  price(price: FacetPrice | null, value: PriceRange | undefined): string | undefined {
    if (!value) return undefined;
    return (
      (price ? priceLabel([price.min, price.max], value) : undefined) ??
      priceLabel([-Infinity, Infinity], value)
    );
  },

  // The desktop chip's label of the order (W12); nothing for the default one, which is no choice.
  sort(value: ProductSort): string | undefined {
    return value === defaultProductSort ? undefined : productSortLabels[value];
  },
};
