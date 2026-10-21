'use client';

import { useState } from 'react';

import {
  AttributeFilterPanel,
  BrandFilterPanel,
  ColorFilterPanel,
  DiscountFilterPanel,
  PriceRangeFilterPanel,
  productFilterTitles,
  type ProductSort,
  ProductSortFilterPanel,
  SizeFilterPanel,
  splitFacetAttributes,
} from '@/entities/product';
import { Accordion, type PriceRange } from '@/shared/ui';

import { catalogFacets } from '../config/catalog';

import styles from './examples.module.scss';

const { colours, others } = splitFacetAttributes(catalogFacets.attributes);

// The phone forms of the catalog's filters over the example counts, in an accordion as in the
// catalog's drawer. They keep no choice of their own (0009 K7): this demo holds it, as the drawer
// does, and shows the last value a panel reported.
export function CatalogFilterPanelsDemo() {
  const [sort, setSort] = useState<ProductSort>('new');
  // The chosen value ids per attribute id.
  const [attributes, setAttributes] = useState<Record<string, string[]>>({});
  const [brands, setBrands] = useState<string[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [price, setPrice] = useState<PriceRange | undefined>();
  const [discounted, setDiscounted] = useState(false);
  const [lastCall, setLastCall] = useState<string>();

  const report = (call: string, value: unknown) => {
    setLastCall(`${call}: ${JSON.stringify(value) ?? 'undefined'}`);
  };
  const changeAttribute = (component: string, id: string) => (value: string[]) => {
    setAttributes((current) => ({ ...current, [id]: value }));
    report(`${component} onValueChange`, value);
  };

  return (
    <div className={styles.example}>
      <div className={styles.panelColumn}>
        <Accordion
          multiple
          items={[
            {
              value: 'sort',
              title: productFilterTitles.sort,
              content: (
                <ProductSortFilterPanel
                  value={sort}
                  onValueChange={(value) => {
                    setSort(value);
                    report('ProductSortFilterPanel onValueChange', value);
                  }}
                />
              ),
            },
            ...colours.map((attribute) => ({
              value: attribute.id,
              title: attribute.name,
              content: (
                <ColorFilterPanel
                  attribute={attribute}
                  value={attributes[attribute.id] ?? []}
                  onValueChange={changeAttribute('ColorFilterPanel', attribute.id)}
                />
              ),
            })),
            ...others.map((attribute) => ({
              value: attribute.id,
              title: attribute.name,
              content: (
                <AttributeFilterPanel
                  attribute={attribute}
                  value={attributes[attribute.id] ?? []}
                  onValueChange={changeAttribute('AttributeFilterPanel', attribute.id)}
                />
              ),
            })),
            {
              value: 'brand',
              title: productFilterTitles.brand,
              content: (
                <BrandFilterPanel
                  brands={catalogFacets.brands}
                  value={brands}
                  onValueChange={(value) => {
                    setBrands(value);
                    report('BrandFilterPanel onValueChange', value);
                  }}
                />
              ),
            },
            {
              value: 'size',
              title: productFilterTitles.size,
              content: (
                <SizeFilterPanel
                  sizes={catalogFacets.sizes}
                  value={sizes}
                  onValueChange={(value) => {
                    setSizes(value);
                    report('SizeFilterPanel onValueChange', value);
                  }}
                />
              ),
            },
            {
              value: 'price',
              title: productFilterTitles.price,
              content: (
                <PriceRangeFilterPanel
                  price={catalogFacets.price}
                  value={price}
                  onValueChange={(value) => {
                    setPrice(value);
                    report('PriceRangeFilterPanel onValueChange', value);
                  }}
                />
              ),
            },
          ]}
        />
        <div className={styles.panelSwitch}>
          <DiscountFilterPanel
            checked={discounted}
            onCheckedChange={(checked) => {
              setDiscounted(checked);
              report('DiscountFilterPanel onCheckedChange', checked);
            }}
          />
        </div>
      </div>

      <p className={styles.props} aria-live="polite">
        Последний вызов: {lastCall ?? '—'}
      </p>
    </div>
  );
}
