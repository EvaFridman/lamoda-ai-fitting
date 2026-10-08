'use client';

import { useState } from 'react';

import {
  CheckboxFilter,
  type CheckboxFilterOption,
  FilterChip,
  FilterChips,
  FilterDropdown,
  PriceFilter,
  type PriceRange,
  SortFilter,
} from '@/shared/ui';

import {
  brandOptions,
  defaultSort,
  priceBounds,
  sortOptions,
  styleOptions,
} from '../config/filters';
import { priceLabel } from '../lib/price-label';

import styles from './examples.module.scss';

// The labels of the picked values, for the chip: "вечерний", "Annen, Lime".
function labels(options: CheckboxFilterOption[], picked: string[], lowerCase = false) {
  if (picked.length === 0) return undefined;
  const text = options
    .filter((option) => picked.includes(option.value))
    .map((option) => option.label)
    .join(', ');
  return lowerCase ? text.toLocaleLowerCase('ru') : text;
}

// The live example: a row of filters as above Lamoda's catalog. What is applied shows under it.
export function FiltersDemo() {
  const [sort, setSort] = useState(defaultSort);
  const [style, setStyle] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [price, setPrice] = useState<PriceRange>(priceBounds);
  const [saleOnly, setSaleOnly] = useState(false);

  const sortLabel = sortOptions.find((option) => option.value === sort)?.label ?? '';
  const priceText = priceLabel(priceBounds, price);
  const anyApplied =
    sort !== defaultSort ||
    style.length > 0 ||
    brands.length > 0 ||
    priceText !== undefined ||
    saleOnly;
  const applied = [
    `сортировка «${sortLabel}»`,
    style.length > 0 && `стиль: ${labels(styleOptions, style, true)}`,
    brands.length > 0 && `бренд: ${labels(brandOptions, brands)}`,
    priceText && `цена ${priceText}`,
    saleOnly && 'только со скидкой',
  ].filter(Boolean);

  return (
    <div className={styles.example}>
      <FilterChips
        onClearAll={
          anyApplied
            ? () => {
                setSort(defaultSort);
                setStyle([]);
                setBrands([]);
                setPrice(priceBounds);
                setSaleOnly(false);
              }
            : undefined
        }
      >
        <FilterDropdown title={sortLabel} label="Сортировка" applied={sort !== defaultSort}>
          <SortFilter options={sortOptions} value={sort} onValueChange={setSort} />
        </FilterDropdown>
        <FilterDropdown
          title="Стиль"
          value={labels(styleOptions, style, true)}
          onClear={() => setStyle([])}
        >
          <CheckboxFilter options={styleOptions} value={style} onApply={setStyle} />
        </FilterDropdown>
        <FilterDropdown
          title="Бренд"
          value={labels(brandOptions, brands)}
          onClear={() => setBrands([])}
        >
          <CheckboxFilter
            options={brandOptions}
            value={brands}
            onApply={setBrands}
            searchable
            searchPlaceholder="Найти бренд"
          />
        </FilterDropdown>
        <FilterDropdown title="Цена" value={priceText} onClear={() => setPrice(priceBounds)}>
          <PriceFilter min={priceBounds[0]} max={priceBounds[1]} value={price} onApply={setPrice} />
        </FilterDropdown>
        <FilterChip title="Только со скидкой" pressed={saleOnly} onPressedChange={setSaleOnly} />
      </FilterChips>
      <p className={styles.props} aria-live="polite">
        Применено: {applied.join('; ')}
      </p>
    </div>
  );
}
