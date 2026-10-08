'use client';

import { CheckboxFilter, FilterChip, FilterDropdown, SortFilter } from '@/shared/ui';

import { sortOptions, styleOptions } from '../config/filters';

import styles from './examples.module.scss';

// Static examples hold no state of their own: what they apply goes nowhere.
function ignore() {}

// The chip in each state (D11a): default, applied with a ×, the sort chip applied (its title is the
// chosen order, it keeps the chevron), and the toggle off and on. The open state is the next
// example, an open dropdown.
export function FilterChipStates() {
  return (
    <ul className={styles.row}>
      <li className={styles.example}>
        <FilterDropdown title="Стиль">
          <CheckboxFilter options={styleOptions} value={[]} onApply={ignore} />
        </FilterDropdown>
        <code className={styles.props}>по умолчанию</code>
      </li>
      <li className={styles.example}>
        <FilterDropdown title="Стиль" value="вечерний" onClear={ignore}>
          <CheckboxFilter options={styleOptions} value={['evening']} onApply={ignore} />
        </FilterDropdown>
        <code className={styles.props}>applied · onClear</code>
      </li>
      <li className={styles.example}>
        <FilterDropdown title="Новинки" label="Сортировка" applied>
          <SortFilter options={sortOptions} value="new" onValueChange={ignore} />
        </FilterDropdown>
        <code className={styles.props}>applied, сортировка</code>
      </li>
      <li className={styles.example}>
        <FilterChip title="Только со скидкой" />
        <code className={styles.props}>FilterChip</code>
      </li>
      <li className={styles.example}>
        <FilterChip title="Только со скидкой" defaultPressed />
        <code className={styles.props}>FilterChip · pressed</code>
      </li>
    </ul>
  );
}

// The open state: a dropdown open from the start, in a box tall enough for it; the caption goes
// above the chip, since the dropdown covers what is under it.
export function OpenFilterState() {
  return (
    <div className={[styles.example, styles.openDropdown].join(' ')}>
      <code className={styles.props}>defaultOpen</code>
      <FilterDropdown title="Стиль" defaultOpen>
        <CheckboxFilter options={styleOptions} value={['evening']} onApply={ignore} />
      </FilterDropdown>
    </div>
  );
}
