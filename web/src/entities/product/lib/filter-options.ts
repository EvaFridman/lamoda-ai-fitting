import type { CheckboxFilterOption, HexColor, PriceRange } from '@/shared/ui';

import type { ProductSort } from '../model/filters';
import type { FacetAttribute, FacetBrand, FacetPrice, FacetSize } from '../model/schemas';
import { sortSizes } from './sizes';
import { PRODUCT_SORT_ORDER, productSortLabels } from './sorts';

// The lists of the catalog's filters, built from the filter counts once for both forms of a filter:
// the desktop dropdown and the phone drawer's panel.

// The filters' names, on a chip and over a section of the drawer. An attribute's is its own.
export const productFilterTitles = {
  brand: 'Бренд',
  size: 'Размер',
  price: 'Цена',
  discount: 'Только со скидкой',
  sort: 'Сортировка',
} as const;

// An attribute filter is searchable above this many values, as on Lamoda.
const attributeSearchAbove = 7;

export function attributeOptions(attribute: FacetAttribute): CheckboxFilterOption[] {
  return attribute.values.map((item) => ({
    value: item.id,
    label: item.value,
    count: item.count,
    // The schema checked it is `#RRGGBB`.
    color: (item.colorHex ?? undefined) as HexColor | undefined,
  }));
}

// The search of an attribute that is not a colour: only for a long list.
export function attributeSearchPlaceholder(attribute: FacetAttribute): string | undefined {
  return attribute.values.length > attributeSearchAbove ? 'Введите наименование' : undefined;
}

export function brandOptions(brands: FacetBrand[]): CheckboxFilterOption[] {
  return brands.map((brand) => ({ value: brand.id, label: brand.name, count: brand.count }));
}

// Sizes in clothing order whatever the api's order (K13).
export function sizeOptions(sizes: FacetSize[]): CheckboxFilterOption[] {
  const counts = new Map(sizes.map((item) => [item.size, item.count]));
  return sortSizes(sizes.map((item) => item.size)).map((size) => ({
    value: size,
    label: size,
    count: counts.get(size),
  }));
}

// The slider's range for a chosen price: within the current products' prices, the whole of them
// when none is chosen.
export function priceRange(price: FacetPrice, value: PriceRange | undefined): PriceRange {
  const clamp = (amount: number) => Math.min(Math.max(amount, price.min), price.max);
  return value ? [clamp(value[0]), clamp(value[1])] : [price.min, price.max];
}

// The api's default order, `new` when the query leaves `sort` out.
export const defaultProductSort: ProductSort = 'new';

export const productSortOptions = PRODUCT_SORT_ORDER.map((sort) => ({
  value: sort,
  label: productSortLabels[sort],
}));
