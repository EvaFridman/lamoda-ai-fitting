'use client';

import {
  CheckboxFilterPanel,
  PriceFilterPanel,
  priceLabel,
  type PriceRange,
  SortFilterPanel,
  Switch,
} from '@/shared/ui';

import {
  attributeOptions,
  attributeSearchPlaceholder,
  brandOptions,
  priceRange,
  productFilterTitles,
  productSortOptions,
  sizeOptions,
} from '../lib/filter-options';
import type { ProductSort } from '../model/filters';
import type { FacetAttribute, FacetBrand, FacetPrice, FacetSize } from '../model/schemas';

// The phone forms of the catalog's filters (spec 0014 O6): the same lists as the dropdowns of
// `catalog-filters.tsx`, with no chip, no dropdown and no "Применить". Each reports every change
// at once; whoever places them keeps the choice and applies it (the drawer's "Показать N
// товаров"), as the dropdowns leave the applied value to whoever places them (0009 K7). A panel's
// list is named after its filter, the title of the section it goes in.

export interface AttributeFilterPanelProps {
  attribute: FacetAttribute;
  // The chosen attribute value ids.
  value: string[];
  onValueChange: (value: string[]) => void;
}

// A colour attribute's swatches (AC6).
export function ColorFilterPanel({ attribute, value, onValueChange }: AttributeFilterPanelProps) {
  return (
    <CheckboxFilterPanel
      label={attribute.name}
      options={attributeOptions(attribute)}
      value={value}
      onValueChange={onValueChange}
      searchable
      searchPlaceholder="Найдите цвет"
      swatches
    />
  );
}

// Any other attribute.
export function AttributeFilterPanel({
  attribute,
  value,
  onValueChange,
}: AttributeFilterPanelProps) {
  const searchPlaceholder = attributeSearchPlaceholder(attribute);
  return (
    <CheckboxFilterPanel
      label={attribute.name}
      options={attributeOptions(attribute)}
      value={value}
      onValueChange={onValueChange}
      searchable={searchPlaceholder !== undefined}
      searchPlaceholder={searchPlaceholder}
    />
  );
}

export interface BrandFilterPanelProps {
  brands: FacetBrand[];
  // The chosen brand ids.
  value: string[];
  onValueChange: (value: string[]) => void;
}

export function BrandFilterPanel({ brands, value, onValueChange }: BrandFilterPanelProps) {
  return (
    <CheckboxFilterPanel
      label={productFilterTitles.brand}
      options={brandOptions(brands)}
      value={value}
      onValueChange={onValueChange}
      searchable
      searchPlaceholder="Найдите бренд"
    />
  );
}

export interface SizeFilterPanelProps {
  sizes: FacetSize[];
  // The chosen sizes themselves.
  value: string[];
  onValueChange: (value: string[]) => void;
}

// Sizes in clothing order (K13).
export function SizeFilterPanel({ sizes, value, onValueChange }: SizeFilterPanelProps) {
  return (
    <CheckboxFilterPanel
      label={productFilterTitles.size}
      options={sizeOptions(sizes)}
      value={value}
      onValueChange={onValueChange}
    />
  );
}

export interface PriceRangeFilterPanelProps {
  // The cheapest and the dearest product; null when there are no products.
  price: FacetPrice | null;
  // The chosen range; undefined when none.
  value?: PriceRange;
  // Called with the chosen range, or undefined when it is the whole of the bounds.
  onValueChange: (value: PriceRange | undefined) => void;
}

// The price slider over the data's bounds; nothing when there are no products to price.
export function PriceRangeFilterPanel({ price, value, onValueChange }: PriceRangeFilterPanelProps) {
  if (price === null) return null;
  const bounds: PriceRange = [price.min, price.max];
  return (
    <PriceFilterPanel
      label={productFilterTitles.price}
      min={price.min}
      max={price.max}
      value={priceRange(price, value)}
      onValueChange={(next) =>
        onValueChange(priceLabel(bounds, next) === undefined ? undefined : next)
      }
    />
  );
}

export interface DiscountFilterPanelProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

// "Только со скидкой": a switch row, Lamoda's form of it in a list of filters.
export function DiscountFilterPanel({ checked, onCheckedChange }: DiscountFilterPanelProps) {
  return (
    <Switch checked={checked} onCheckedChange={(next) => onCheckedChange(next)}>
      {productFilterTitles.discount}
    </Switch>
  );
}

export interface ProductSortFilterPanelProps {
  value: ProductSort;
  onValueChange: (value: ProductSort) => void;
}

export function ProductSortFilterPanel({ value, onValueChange }: ProductSortFilterPanelProps) {
  return (
    <SortFilterPanel
      label={productFilterTitles.sort}
      options={productSortOptions}
      value={value}
      onValueChange={(next) => onValueChange(next as ProductSort)}
    />
  );
}
