'use client';

import {
  CheckboxFilter,
  type CheckboxFilterOption,
  FilterChip,
  type FilterChipEvents,
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
// (K7), and so do the chip's own handlers (`chipEvents`, the page's analytics). Their phone forms
// are in `catalog-filter-panels.tsx`.

interface ChipEventsProps {
  chipEvents?: FilterChipEvents;
}

// The chip's text for the chosen values: their names in the order of the list, or how many are
// chosen when some are not in the list (the counts no longer have them, the filter still applies).
function chosenText(options: readonly CheckboxFilterOption[], value: readonly string[]) {
  const names = options
    .filter((option) => value.includes(option.value))
    .map((option) => option.label);
  return names.length === value.length ? chipValue(names) : String(value.length);
}

interface FacetFilterProps extends ChipEventsProps {
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
  chipEvents,
}: FacetFilterProps) {
  return (
    <FilterDropdown
      title={title}
      value={chosenText(options, value)}
      applied={value.length > 0}
      onClear={() => onApply([])}
      chipEvents={chipEvents}
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

export interface AttributeFilterProps extends ChipEventsProps {
  attribute: FacetAttribute;
  // The chosen attribute value ids.
  value: string[];
  onApply: (value: string[]) => void;
}

// A colour attribute: a swatch per value, an empty circle for a value with no colour (AC6).
export function ColorFilter({ attribute, value, onApply, chipEvents }: AttributeFilterProps) {
  return (
    <FacetFilter
      title={attribute.name}
      options={attributeOptions(attribute)}
      value={value}
      onApply={onApply}
      searchPlaceholder="Найдите цвет"
      swatches
      chipEvents={chipEvents}
    />
  );
}

// Any other attribute (material, season, one added later: K5) from the same component.
export function AttributeFilter({ attribute, value, onApply, chipEvents }: AttributeFilterProps) {
  return (
    <FacetFilter
      title={attribute.name}
      options={attributeOptions(attribute)}
      value={value}
      onApply={onApply}
      searchPlaceholder={attributeSearchPlaceholder(attribute)}
      chipEvents={chipEvents}
    />
  );
}

export interface BrandFilterProps extends ChipEventsProps {
  brands: FacetBrand[];
  // The chosen brand ids.
  value: string[];
  onApply: (value: string[]) => void;
}

// Brands with a search by part of the name; no "Премиум" tab (K5).
export function BrandFilter({ brands, value, onApply, chipEvents }: BrandFilterProps) {
  return (
    <FacetFilter
      title={productFilterTitles.brand}
      options={brandOptions(brands)}
      value={value}
      onApply={onApply}
      searchPlaceholder="Найдите бренд"
      chipEvents={chipEvents}
    />
  );
}

export interface SizeFilterProps extends ChipEventsProps {
  sizes: FacetSize[];
  // The chosen sizes themselves: sizes have no ids.
  value: string[];
  onApply: (value: string[]) => void;
}

// Sizes in clothing order whatever the api's order (K13): a plain checkbox list with counts, as
// Lamoda's size dropdown, not SizePicker.
export function SizeFilter({ sizes, value, onApply, chipEvents }: SizeFilterProps) {
  return (
    <FacetFilter
      title={productFilterTitles.size}
      options={sizeOptions(sizes)}
      value={value}
      onApply={onApply}
      chipEvents={chipEvents}
    />
  );
}

export interface PriceRangeFilterProps extends ChipEventsProps {
  // The cheapest and the dearest product; null when there are no products.
  price: FacetPrice | null;
  // The applied range; undefined when no price is applied.
  value?: PriceRange;
  // Called with the chosen range, or undefined when it is the whole of the bounds or cleared.
  onApply: (value: PriceRange | undefined) => void;
}

// The price slider over the data's bounds; nothing when there are no products to price.
export function PriceRangeFilter({ price, value, onApply, chipEvents }: PriceRangeFilterProps) {
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
      chipEvents={chipEvents}
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

export interface DiscountFilterProps extends ChipEventsProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

// "Только со скидкой": an on/off chip.
export function DiscountFilter({ checked, onCheckedChange, chipEvents }: DiscountFilterProps) {
  return (
    <FilterChip
      {...chipEvents}
      title={productFilterTitles.discount}
      pressed={checked}
      onPressedChange={(pressed) => onCheckedChange(pressed)}
    />
  );
}

export interface ProductSortFilterProps extends ChipEventsProps {
  value: ProductSort;
  // Called at once with every pick (D7f).
  onValueChange: (value: ProductSort) => void;
}

// The sort chip shows the current order as its title, as on Lamoda; it is black once the order is
// not the default one.
export function ProductSortFilter({ value, onValueChange, chipEvents }: ProductSortFilterProps) {
  return (
    <FilterDropdown
      title={productSortLabels[value]}
      label={productFilterTitles.sort}
      applied={value !== defaultProductSort}
      chipEvents={chipEvents}
    >
      <SortFilter
        options={productSortOptions}
        value={value}
        onValueChange={(next) => onValueChange(next as ProductSort)}
      />
    </FilterDropdown>
  );
}
