'use client';

import {
  CheckboxFilterPanel,
  type CheckboxFilterPanelProps,
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
// list is named after its filter, the title of the section it goes in. `layout` is the kit's: `list`
// by default, `sheet` for a screen of the filters' sheet (spec 0020).

interface ListPanelProps {
  layout?: CheckboxFilterPanelProps['layout'];
}

export interface AttributeFilterPanelProps extends ListPanelProps {
  attribute: FacetAttribute;
  // The chosen attribute value ids.
  value: string[];
  onValueChange: (value: string[]) => void;
}

export interface ColorFilterPanelProps extends AttributeFilterPanelProps {
  // The kit's chip "Выбрать все" under the search (W24).
  selectAll?: boolean;
}

// A colour attribute's swatches (AC6); the sheet's search says "Поиск", as on Lamoda.
export function ColorFilterPanel({
  attribute,
  value,
  onValueChange,
  layout = 'list',
  selectAll,
}: ColorFilterPanelProps) {
  return (
    <CheckboxFilterPanel
      label={attribute.name}
      options={attributeOptions(attribute)}
      value={value}
      onValueChange={onValueChange}
      searchable
      searchPlaceholder={layout === 'sheet' ? 'Поиск' : 'Найдите цвет'}
      swatches
      layout={layout}
      selectAll={selectAll}
    />
  );
}

// Any other attribute.
export function AttributeFilterPanel({
  attribute,
  value,
  onValueChange,
  layout,
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
      layout={layout}
    />
  );
}

export interface BrandFilterPanelProps extends ListPanelProps {
  brands: FacetBrand[];
  // The chosen brand ids.
  value: string[];
  onValueChange: (value: string[]) => void;
}

export function BrandFilterPanel({ brands, value, onValueChange, layout }: BrandFilterPanelProps) {
  return (
    <CheckboxFilterPanel
      label={productFilterTitles.brand}
      options={brandOptions(brands)}
      value={value}
      onValueChange={onValueChange}
      searchable
      searchPlaceholder="Найдите бренд"
      layout={layout}
    />
  );
}

export interface SizeFilterPanelProps extends ListPanelProps {
  sizes: FacetSize[];
  // The chosen sizes themselves.
  value: string[];
  onValueChange: (value: string[]) => void;
}

// Sizes in clothing order (K13).
export function SizeFilterPanel({ sizes, value, onValueChange, layout }: SizeFilterPanelProps) {
  return (
    <CheckboxFilterPanel
      label={productFilterTitles.size}
      options={sizeOptions(sizes)}
      value={value}
      onValueChange={onValueChange}
      layout={layout}
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

export interface ProductSortFilterPanelProps extends ListPanelProps {
  value: ProductSort;
  onValueChange: (value: ProductSort) => void;
}

export function ProductSortFilterPanel({
  value,
  onValueChange,
  layout,
}: ProductSortFilterPanelProps) {
  return (
    <SortFilterPanel
      label={productFilterTitles.sort}
      options={productSortOptions}
      value={value}
      onValueChange={(next) => onValueChange(next as ProductSort)}
      layout={layout}
    />
  );
}
