'use client';

import { useState } from 'react';

import {
  Accordion,
  CheckboxFilterPanel,
  PriceFilterPanel,
  type PriceRange,
  SortFilterPanel,
} from '@/shared/ui';

import {
  brandOptions,
  colorOptions,
  defaultSort,
  priceBounds,
  sortOptions,
} from '../config/filters';

import styles from './examples.module.scss';

// The filters' bodies alone, in an accordion as in the phone drawer: each reports every change at
// once, with no "Применить". The column is a phone's width; under it, what the panels hold now.
export function FilterPanelsDemo() {
  const [sort, setSort] = useState(defaultSort);
  const [brands, setBrands] = useState<string[]>([]);
  const [price, setPrice] = useState<PriceRange>(priceBounds);

  return (
    <div className={styles.example}>
      <div className={styles.panelColumn}>
        <Accordion
          multiple
          defaultValue={['sort']}
          items={[
            {
              value: 'sort',
              title: 'Сортировка',
              content: (
                <SortFilterPanel
                  label="Сортировка"
                  options={sortOptions}
                  value={sort}
                  onValueChange={setSort}
                />
              ),
            },
            {
              value: 'brand',
              title: 'Бренд',
              content: (
                <CheckboxFilterPanel
                  label="Бренд"
                  options={brandOptions}
                  value={brands}
                  onValueChange={setBrands}
                  searchable
                  searchPlaceholder="Найдите бренд"
                />
              ),
            },
            {
              value: 'price',
              title: 'Цена',
              content: (
                <PriceFilterPanel
                  label="Цена"
                  min={priceBounds[0]}
                  max={priceBounds[1]}
                  value={price}
                  onValueChange={setPrice}
                />
              ),
            },
          ]}
        />
      </div>
      <p className={styles.props} aria-live="polite">
        {JSON.stringify({ sort, brands, price })}
      </p>
    </div>
  );
}

// The sheet forms of the panels (`layout="sheet"`), as on the screens of the phone filters' sheet:
// the control on the right, hairlines between rows; the colours with a search and "Выбрать все",
// which ticks what the search leaves shown.
export function SheetPanelsDemo() {
  const [sort, setSort] = useState(defaultSort);
  const [colors, setColors] = useState<string[]>([]);

  return (
    <div className={styles.example}>
      <div className={styles.panelColumn}>
        <SortFilterPanel
          label="Сортировка"
          layout="sheet"
          options={sortOptions}
          value={sort}
          onValueChange={setSort}
        />
      </div>
      <div className={styles.panelColumn}>
        <CheckboxFilterPanel
          label="Цвет"
          layout="sheet"
          options={colorOptions}
          value={colors}
          onValueChange={setColors}
          swatches
          searchable
          selectAll
        />
      </div>
      <p className={styles.props} aria-live="polite">
        {JSON.stringify({ sort, colors })}
      </p>
    </div>
  );
}
