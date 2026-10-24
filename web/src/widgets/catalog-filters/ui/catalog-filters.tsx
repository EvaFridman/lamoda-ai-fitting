'use client';

import {
  AttributeFilter,
  BrandFilter,
  ColorFilter,
  defaultProductSort,
  DiscountFilter,
  PriceRangeFilter,
  type ProductFacets,
  ProductSortFilter,
  SizeFilter,
  splitFacetAttributes,
} from '@/entities/product';
import { useTrackedElement } from '@/shared/analytics';
import { FilterChips } from '@/shared/ui';

import {
  attributeChoice,
  type CatalogFilterValue,
  clearFilters,
  hasAppliedFilters,
  priceChoice,
  withAttributeChoice,
  withPriceChoice,
} from '../lib/filter-value';
import { CatalogFiltersDrawer } from './catalog-filters-drawer';

import styles from './catalog-filters.module.scss';

const chips = { surface: 'chips' } as const;

export interface CatalogFiltersProps {
  // The filter counts of the current selection; until they load (or when they fail) the row has
  // only the sort and "Очистить фильтры".
  facets?: ProductFacets;
  // The current selection; the page reads it from the address.
  value: CatalogFilterValue;
  // A filter, the sort or "Очистить фильтры" changed it; the page puts it in the address.
  onChange: (value: CatalogFilterValue) => void;
  // The page's category, within which the phone drawer counts its draft.
  categoryId?: string;
  // Moves the focus after the row's "Очистить фильтры" (the page's heading, plan §3.4); the drawer
  // keeps its own on "Показать" (O90).
  focusAfterClear?: () => void;
  // One of the two forms, for a page that places them apart (spec 0020 W27): `row`, the chips;
  // `sheet`, the "Фильтры" button and its sheet. Both when omitted.
  part?: 'row' | 'sheet';
  className?: string;
}

// The filters above the list: the desktop row of chips and, below a 1024px window, the phone
// drawer (O6, O88); a page may place the two apart (`part`, spec 0020 W27).
export function CatalogFilters({
  className,
  focusAfterClear,
  part,
  ...filters
}: CatalogFiltersProps) {
  return (
    <div className={className}>
      {part === 'sheet' ? null : <FilterRow {...filters} focusAfterClear={focusAfterClear} />}
      {part === 'row' ? null : (
        <div className={styles.phone}>
          <CatalogFiltersDrawer {...filters} />
        </div>
      )}
    </div>
  );
}

// The desktop row of chips (O5): the sort, then the filters in 0009's order, then "Только со
// скидкой", and "Очистить фильтры" while a filter or the search is applied. An applied filter is
// its own black chip with its value and a ×; there is no separate row of chosen values. Its chips'
// clicks and hovers are tracked, one element per kind of filter (plan §3.6), with `surface` the
// chips; the sheet's rows send the same elements with `surface` the sheet (spec 0020 W15).
function FilterRow({
  facets,
  value,
  onChange,
  focusAfterClear,
}: Omit<CatalogFiltersProps, 'className' | 'part'>) {
  const change = (patch: Partial<CatalogFilterValue>) => onChange({ ...value, ...patch });
  const sortChip = useTrackedElement('catalog.sort', chips);

  return (
    <FilterChips
      className={styles.row}
      onClearAll={hasAppliedFilters(value) ? () => onChange(clearFilters(value)) : undefined}
      focusAfterClearAll={focusAfterClear}
    >
      <ProductSortFilter
        value={value.sort ?? defaultProductSort}
        onValueChange={(sort) => change({ sort: sort === defaultProductSort ? undefined : sort })}
        chipEvents={sortChip}
      />
      {facets === undefined ? null : (
        <FacetFilters facets={facets} value={value} onChange={onChange} />
      )}
    </FilterChips>
  );
}

// The filters drawn from the counts, in 0009's order, then "Только со скидкой".
function FacetFilters({
  facets,
  value,
  onChange,
}: Required<Omit<CatalogFiltersProps, 'className' | 'categoryId' | 'focusAfterClear' | 'part'>>) {
  const { colours, others } = splitFacetAttributes(facets.attributes);
  const change = (patch: Partial<CatalogFilterValue>) => onChange({ ...value, ...patch });
  const colorChip = useTrackedElement('catalog.filter-color', chips);
  const attributeChip = useTrackedElement('catalog.filter-attribute', chips);
  const brandChip = useTrackedElement('catalog.filter-brand', chips);
  const sizeChip = useTrackedElement('catalog.filter-size', chips);
  const priceChip = useTrackedElement('catalog.filter-price', chips);
  const discountChip = useTrackedElement('catalog.filter-discount', chips);

  return (
    <>
      {colours.map((attribute) => (
        <ColorFilter
          key={attribute.id}
          attribute={attribute}
          value={attributeChoice(value, attribute)}
          onApply={(chosen) => onChange(withAttributeChoice(value, attribute, chosen))}
          chipEvents={colorChip}
        />
      ))}
      {others.map((attribute) => (
        <AttributeFilter
          key={attribute.id}
          attribute={attribute}
          value={attributeChoice(value, attribute)}
          onApply={(chosen) => onChange(withAttributeChoice(value, attribute, chosen))}
          chipEvents={attributeChip}
        />
      ))}
      <BrandFilter
        brands={facets.brands}
        value={[...(value.brandId ?? [])]}
        onApply={(brandId) => change({ brandId: brandId.length > 0 ? brandId : undefined })}
        chipEvents={brandChip}
      />
      <SizeFilter
        sizes={facets.sizes}
        value={[...(value.size ?? [])]}
        onApply={(size) => change({ size: size.length > 0 ? size : undefined })}
        chipEvents={sizeChip}
      />
      <PriceRangeFilter
        price={facets.price}
        value={facets.price === null ? undefined : priceChoice(value, facets.price)}
        onApply={(range) => {
          if (facets.price !== null) onChange(withPriceChoice(value, facets.price, range));
        }}
        chipEvents={priceChip}
      />
      <DiscountFilter
        checked={value.hasDiscount === true}
        onCheckedChange={(checked) => change({ hasDiscount: checked ? true : undefined })}
        chipEvents={discountChip}
      />
    </>
  );
}
