'use client';

import { useState } from 'react';

import {
  CheckboxFilter,
  type CheckboxFilterOption,
  FilterChip,
  FilterChips,
  FilterDropdown,
  SortFilter,
} from '@/shared/ui';

import { brandOptions, defaultSort, sortOptions, styleOptions } from '../config/filters';

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
  const [saleOnly, setSaleOnly] = useState(false);

  const sortLabel = sortOptions.find((option) => option.value === sort)?.label ?? '';
  const anyApplied = sort !== defaultSort || style.length > 0 || brands.length > 0 || saleOnly;
  const applied = [
    `сортировка «${sortLabel}»`,
    style.length > 0 && `стиль: ${labels(styleOptions, style, true)}`,
    brands.length > 0 && `бренд: ${labels(brandOptions, brands)}`,
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
        <FilterChip title="Только со скидкой" pressed={saleOnly} onPressedChange={setSaleOnly} />
      </FilterChips>
      <p className={styles.props} aria-live="polite">
        Применено: {applied.join('; ')}
      </p>
    </div>
  );
}
