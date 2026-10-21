'use client';

import {
  CheckboxFilter,
  type CheckboxFilterOption,
  FilterChip,
  FilterDropdown,
  PriceFilter,
  priceLabel,
  type PriceRange,
  SortFilter,
} from '@/shared/ui';

import { chipValue } from '../lib/facets';
import {
  attributeOptions,
  attributeSearchPlaceholder,
  brandOptions,
  defaultProductSort,
  priceRange,
  productFilterTitles,
  productSortOptions,
  sizeOptions,
} from '../lib/filter-options';
import { productSortLabels } from '../lib/sorts';
import type { ProductSort } from '../model/filters';
import type { FacetAttribute, FacetBrand, FacetPrice, FacetSize } from '../model/schemas';

// The catalog's filters, built from the filter counts (0009 plan §3). Each shows its slice of
// `ProductFacets` and reports the visitor's choice; the applied value comes from whoever places it
// (K7). Their phone forms are in `catalog-filter-panels.tsx`.

// The chip's text for the chosen values: their names in the order of the list, or how many are
// chosen when some are not in the list (the counts no longer have them, the filter still applies).
function chosenText(options: readonly CheckboxFilterOption[], value: readonly string[]) {
  const names = options
    .filter((option) => value.includes(option.value))
    .map((option) => option.label);
  return names.length === value.length ? chipValue(names) : String(value.length);
}

interface FacetFilterProps {
  title: string;
  options: CheckboxFilterOption[];
  value: string[];
  onApply: (value: string[]) => void;
  searchPlaceholder?: string;
  swatches?: boolean;
}

// A checkbox list in a dropdown whose chip names the choice and clears it with its ×.
function FacetFilter({
  title,
  options,
  value,
  onApply,
  searchPlaceholder,
  swatches,
}: FacetFilterProps) {
  return (
    <FilterDropdown
      title={title}
      value={chosenText(options, value)}
      applied={value.length > 0}
      onClear={() => onApply([])}
    >
      <CheckboxFilter
        options={options}
        value={value}
        onApply={onApply}
        searchable={searchPlaceholder !== undefined}
        searchPlaceholder={searchPlaceholder}
        swatches={swatches}
      />
    </FilterDropdown>
  );
}

export interface AttributeFilterProps {
  attribute: FacetAttribute;
  // The chosen attribute value ids.
  value: string[];
  onApply: (value: string[]) => void;
}

// A colour attribute: a swatch per value, an empty circle for a value with no colour (AC6).
export function ColorFilter({ attribute, value, onApply }: AttributeFilterProps) {
  return (
    <FacetFilter
      title={attribute.name}
      options={attributeOptions(attribute)}
      value={value}
      onApply={onApply}
      searchPlaceholder="Найдите цвет"
      swatches
    />
  );
}

// Any other attribute (material, season, one added later: K5) from the same component.
export function AttributeFilter({ attribute, value, onApply }: AttributeFilterProps) {
  return (
    <FacetFilter
      title={attribute.name}
      options={attributeOptions(attribute)}
      value={value}
      onApply={onApply}
      searchPlaceholder={attributeSearchPlaceholder(attribute)}
    />
  );
}

export interface BrandFilterProps {
  brands: FacetBrand[];
  // The chosen brand ids.
  value: string[];
  onApply: (value: string[]) => void;
}

// Brands with a search by part of the name; no "Премиум" tab (K5).
export function BrandFilter({ brands, value, onApply }: BrandFilterProps) {
  return (
    <FacetFilter
      title={productFilterTitles.brand}
      options={brandOptions(brands)}
      value={value}
      onApply={onApply}
      searchPlaceholder="Найдите бренд"
    />
  );
}

export interface SizeFilterProps {
  sizes: FacetSize[];
  // The chosen sizes themselves: sizes have no ids.
  value: string[];
  onApply: (value: string[]) => void;
}

// Sizes in clothing order whatever the api's order (K13): a plain checkbox list with counts, as
// Lamoda's size dropdown, not SizePicker.
export function SizeFilter({ sizes, value, onApply }: SizeFilterProps) {
  return (
    <FacetFilter
      title={productFilterTitles.size}
      options={sizeOptions(sizes)}
      value={value}
      onApply={onApply}
    />
  );
}

export interface PriceRangeFilterProps {
  // The cheapest and the dearest product; null when there are no products.
  price: FacetPrice | null;
  // The applied range; undefined when no price is applied.
  value?: PriceRange;
  // Called with the chosen range, or undefined when it is the whole of the bounds or cleared.
  onApply: (value: PriceRange | undefined) => void;
}

// The price slider over the data's bounds; nothing when there are no products to price.
export function PriceRangeFilter({ price, value, onApply }: PriceRangeFilterProps) {
  if (price === null) return null;
  const bounds: PriceRange = [price.min, price.max];
  // The slider starts within the current products' prices; the chip names the applied range as it
  // is, both sides when it equals the bounds: the counts may change, the range still applies.
  const chipText = value
    ? (priceLabel(bounds, value) ?? priceLabel([-Infinity, Infinity], value))
    : undefined;

  return (
    <FilterDropdown
      title={productFilterTitles.price}
      value={chipText}
      applied={value !== undefined}
      onClear={() => onApply(undefined)}
    >
      <PriceFilter
        min={price.min}
        max={price.max}
        value={priceRange(price, value)}
        onApply={(next) => onApply(priceLabel(bounds, next) === undefined ? undefined : next)}
      />
    </FilterDropdown>
  );
}

export interface DiscountFilterProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

// "Только со скидкой": an on/off chip.
export function DiscountFilter({ checked, onCheckedChange }: DiscountFilterProps) {
  return (
    <FilterChip
      title={productFilterTitles.discount}
      pressed={checked}
      onPressedChange={(pressed) => onCheckedChange(pressed)}
    />
  );
}

export interface ProductSortFilterProps {
  value: ProductSort;
  // Called at once with every pick (D7f).
  onValueChange: (value: ProductSort) => void;
}

// The sort chip shows the current order as its title, as on Lamoda; it is black once the order is
// not the default one.
export function ProductSortFilter({ value, onValueChange }: ProductSortFilterProps) {
  return (
    <FilterDropdown
      title={productSortLabels[value]}
      label={productFilterTitles.sort}
      applied={value !== defaultProductSort}
    >
      <SortFilter
        options={productSortOptions}
        value={value}
        onValueChange={(next) => onValueChange(next as ProductSort)}
      />
    </FilterDropdown>
  );
}
