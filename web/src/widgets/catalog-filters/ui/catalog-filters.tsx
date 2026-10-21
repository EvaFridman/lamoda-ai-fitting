'use client';

import {
  AttributeFilter,
  BrandFilter,
  ColorFilter,
  DiscountFilter,
  PriceRangeFilter,
  type ProductFacets,
  type ProductSort,
  ProductSortFilter,
  SizeFilter,
  splitFacetAttributes,
} from '@/entities/product';
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

// The api's default order, `new` when the address leaves `sort` out.
const defaultSort: ProductSort = 'new';

export interface CatalogFiltersProps {
  // The filter counts of the current selection; until they load (or when they fail) the row has
  // only the sort and "Очистить фильтры".
  facets?: ProductFacets;
  // The current selection; the page reads it from the address.
  value: CatalogFilterValue;
  // A filter, the sort or "Очистить фильтры" changed it; the page puts it in the address.
  onChange: (value: CatalogFilterValue) => void;
  className?: string;
}

// The desktop row of chips above the list (O5): the sort, then the filters in 0009's order, then
// "Только со скидкой", and "Очистить фильтры" while a filter or the search is applied. An applied
// filter is its own black chip with its value and a ×; there is no separate row of chosen values.
export function CatalogFilters({ facets, value, onChange, className }: CatalogFiltersProps) {
  const change = (patch: Partial<CatalogFilterValue>) => onChange({ ...value, ...patch });

  return (
    <FilterChips
      className={className}
      onClearAll={hasAppliedFilters(value) ? () => onChange(clearFilters(value)) : undefined}
    >
      <ProductSortFilter
        value={value.sort ?? defaultSort}
        onValueChange={(sort) => change({ sort: sort === defaultSort ? undefined : sort })}
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
}: Required<Omit<CatalogFiltersProps, 'className'>>) {
  const { colours, others } = splitFacetAttributes(facets.attributes);
  const change = (patch: Partial<CatalogFilterValue>) => onChange({ ...value, ...patch });

  return (
    <>
      {colours.map((attribute) => (
        <ColorFilter
          key={attribute.id}
          attribute={attribute}
          value={attributeChoice(value, attribute)}
          onApply={(chosen) => onChange(withAttributeChoice(value, attribute, chosen))}
        />
      ))}
      {others.map((attribute) => (
        <AttributeFilter
          key={attribute.id}
          attribute={attribute}
          value={attributeChoice(value, attribute)}
          onApply={(chosen) => onChange(withAttributeChoice(value, attribute, chosen))}
        />
      ))}
      <BrandFilter
        brands={facets.brands}
        value={[...(value.brandId ?? [])]}
        onApply={(brandId) => change({ brandId: brandId.length > 0 ? brandId : undefined })}
      />
      <SizeFilter
        sizes={facets.sizes}
        value={[...(value.size ?? [])]}
        onApply={(size) => change({ size: size.length > 0 ? size : undefined })}
      />
      <PriceRangeFilter
        price={facets.price}
        value={facets.price === null ? undefined : priceChoice(value, facets.price)}
        onApply={(range) => {
          if (facets.price !== null) onChange(withPriceChoice(value, facets.price, range));
        }}
      />
      <DiscountFilter
        checked={value.hasDiscount === true}
        onCheckedChange={(checked) => change({ hasDiscount: checked ? true : undefined })}
      />
    </>
  );
}
