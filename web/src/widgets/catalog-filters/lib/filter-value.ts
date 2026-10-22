import type { FacetAttribute, FacetPrice, ProductListQuery } from '@/entities/product';
import type { PriceRange } from '@/shared/ui';

// The catalog's selection as the row shows and changes it: the filters, the search and the sort.
// The category is the page's path (O73), the batch the list's.
export type CatalogFilterValue = Omit<ProductListQuery, 'categoryId' | 'limit'>;

// A filter or the search narrows the list; the sort only orders it.
export function hasAppliedFilters(value: CatalogFilterValue): boolean {
  return (
    value.q !== undefined ||
    (value.brandId?.length ?? 0) > 0 ||
    (value.size?.length ?? 0) > 0 ||
    (value.attributeValueId?.length ?? 0) > 0 ||
    value.minPrice !== undefined ||
    value.maxPrice !== undefined ||
    value.hasDiscount !== undefined
  );
}

// "Очистить фильтры": every filter and the search go, the sort stays (O5, AC7).
export function clearFilters(value: CatalogFilterValue): CatalogFilterValue {
  return { sort: value.sort };
}

function nonEmpty(values: string[]): string[] | undefined {
  return values.length > 0 ? values : undefined;
}

// The chosen values of one attribute, out of the one list of every attribute's values.
export function attributeChoice(value: CatalogFilterValue, attribute: FacetAttribute): string[] {
  const own = new Set(attribute.values.map((item) => item.id));
  return (value.attributeValueId ?? []).filter((id) => own.has(id));
}

// One attribute's choice replaced, the other attributes' kept.
export function withAttributeChoice(
  value: CatalogFilterValue,
  attribute: FacetAttribute,
  chosen: readonly string[],
): CatalogFilterValue {
  const own = new Set(attribute.values.map((item) => item.id));
  const rest = (value.attributeValueId ?? []).filter((id) => !own.has(id));
  return { ...value, attributeValueId: nonEmpty([...rest, ...chosen]) };
}

// The applied price as the slider's range; an open side is the current products' bound, so the
// chip names only the applied side ("от 2 000 ₽").
export function priceChoice(value: CatalogFilterValue, price: FacetPrice): PriceRange | undefined {
  if (value.minPrice === undefined && value.maxPrice === undefined) return undefined;
  return [value.minPrice ?? price.min, value.maxPrice ?? price.max];
}

// A side at the current products' bound leaves the address: it narrows nothing.
export function withPriceChoice(
  value: CatalogFilterValue,
  price: FacetPrice,
  range: PriceRange | undefined,
): CatalogFilterValue {
  return {
    ...value,
    minPrice: range === undefined || range[0] <= price.min ? undefined : range[0],
    maxPrice: range === undefined || range[1] >= price.max ? undefined : range[1],
  };
}
