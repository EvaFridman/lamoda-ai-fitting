'use client';

import { type MouseEvent, useState } from 'react';

import { CatalogCategoryList } from '@/entities/category';
import {
  AttributeFilter,
  BrandFilter,
  ColorFilter,
  DiscountFilter,
  PriceRangeFilter,
  type ProductSort,
  ProductSortFilter,
  SizeFilter,
  splitFacetAttributes,
} from '@/entities/product';
import { FilterChips, type PriceRange } from '@/shared/ui';

import { catalogFacets } from '../config/catalog';

import styles from './examples.module.scss';

const { colours, others } = splitFacetAttributes(catalogFacets.attributes);

const defaultSort: ProductSort = 'new';

// A category row's address; the demo takes the id back from it.
const categoryHashPrefix = '#category-';

// The catalog's filters over the example counts, live. The components keep no applied state (0009
// K7): this demo holds it, as the catalog page will, and shows the last value a filter reported.
export function CatalogFiltersDemo() {
  const [sort, setSort] = useState<ProductSort>(defaultSort);
  // The chosen value ids per attribute id.
  const [attributes, setAttributes] = useState<Record<string, string[]>>({});
  const [brands, setBrands] = useState<string[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [price, setPrice] = useState<PriceRange | undefined>();
  const [discounted, setDiscounted] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [lastCall, setLastCall] = useState<string>();

  const report = (call: string, value: unknown) => {
    setLastCall(`${call}: ${JSON.stringify(value) ?? 'undefined'}`);
  };
  const applyAttribute = (component: string, id: string) => (value: string[]) => {
    setAttributes((current) => ({ ...current, [id]: value }));
    report(`${component} onApply`, value);
  };

  const anyApplied =
    sort !== defaultSort ||
    Object.values(attributes).some((value) => value.length > 0) ||
    brands.length > 0 ||
    sizes.length > 0 ||
    price !== undefined ||
    discounted;

  // A row is a link to its own address (the page keeps filters in the URL later, K7); here a click
  // marks it chosen and stays on the page. Caught on capture: next/link navigates in its own
  // onClick unless the click is already prevented.
  const chooseCategory = (event: MouseEvent<HTMLDivElement>) => {
    const href = (event.target as Element).closest('a')?.getAttribute('href');
    if (!href?.startsWith(categoryHashPrefix)) return;
    event.preventDefault();
    const id = href.slice(categoryHashPrefix.length);
    setCategory(id);
    report('CatalogCategoryList value', id);
  };

  return (
    <div className={styles.example}>
      <FilterChips
        onClearAll={
          anyApplied
            ? () => {
                setSort(defaultSort);
                setAttributes({});
                setBrands([]);
                setSizes([]);
                setPrice(undefined);
                setDiscounted(false);
                setLastCall('FilterChips onClearAll');
              }
            : undefined
        }
      >
        <ProductSortFilter
          value={sort}
          onValueChange={(value) => {
            setSort(value);
            report('ProductSortFilter onValueChange', value);
          }}
        />
        {colours.map((attribute) => (
          <ColorFilter
            key={attribute.id}
            attribute={attribute}
            value={attributes[attribute.id] ?? []}
            onApply={applyAttribute('ColorFilter', attribute.id)}
          />
        ))}
        {others.map((attribute) => (
          <AttributeFilter
            key={attribute.id}
            attribute={attribute}
            value={attributes[attribute.id] ?? []}
            onApply={applyAttribute('AttributeFilter', attribute.id)}
          />
        ))}
        <BrandFilter
          brands={catalogFacets.brands}
          value={brands}
          onApply={(value) => {
            setBrands(value);
            report('BrandFilter onApply', value);
          }}
        />
        <SizeFilter
          sizes={catalogFacets.sizes}
          value={sizes}
          onApply={(value) => {
            setSizes(value);
            report('SizeFilter onApply', value);
          }}
        />
        <PriceRangeFilter
          price={catalogFacets.price}
          value={price}
          onApply={(value) => {
            setPrice(value);
            report('PriceRangeFilter onApply', value);
          }}
        />
        <DiscountFilter
          checked={discounted}
          onCheckedChange={(checked) => {
            setDiscounted(checked);
            report('DiscountFilter onCheckedChange', checked);
          }}
        />
      </FilterChips>

      <h4 className={styles.groupTitle}>CatalogCategoryList</h4>
      {/* Links answer Enter with a click too, so the click alone covers the keyboard. */}
      <div className={styles.filterColumn} onClickCapture={chooseCategory}>
        <CatalogCategoryList
          categories={catalogFacets.categories}
          value={category}
          getHref={(id) => `${categoryHashPrefix}${id}`}
        />
      </div>

      <p className={styles.props} aria-live="polite">
        Последний вызов: {lastCall ?? '—'}
      </p>
    </div>
  );
}
