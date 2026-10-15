'use client';

import { Button as BaseButton } from '@base-ui/react/button';
import { Input } from '@base-ui/react/input';
import { useRef, useState } from 'react';

import { Button } from '../button/button';
import { Checkbox } from '../checkbox/checkbox';
import { CheckboxGroup } from '../checkbox-group/checkbox-group';
import { ColorSwatch, type HexColor, type SwatchColor } from '../color-swatch/color-swatch';
import { useFilterDropdown } from '../filter-dropdown/filter-dropdown';
import { CloseIcon, SearchIcon } from '../icon/icons';

import styles from './checkbox-filter.module.scss';

export interface CheckboxFilterOption {
  value: string;
  label: string;
  // The number of products with this value, grey on the right.
  count?: number;
  disabled?: boolean;
  // The swatch of the row when the filter has `swatches`; none is an empty bordered circle.
  color?: SwatchColor | HexColor;
}

export interface CheckboxFilterProps {
  options: CheckboxFilterOption[];
  // The applied values: the boxes ticked when the dropdown opens.
  value: string[];
  // Called by "Применить" with the ticked values in the order of `options`; the dropdown closes.
  onApply: (value: string[]) => void;
  // A search field over the list, for long lists.
  searchable?: boolean;
  searchPlaceholder?: string;
  // Rows of the colour filter: a ColorSwatch with the option's `color` in place of each checkbox.
  swatches?: boolean;
}

// The content of a FilterDropdown: a list of checkboxes (or colour swatches) with counts, an
// optional search that narrows it, and "Применить". Ticks are a draft until applied; the list is
// named after the chip.
export function CheckboxFilter({
  options,
  value,
  onApply,
  searchable = false,
  searchPlaceholder = 'Поиск',
  swatches = false,
}: CheckboxFilterProps) {
  const { label, close } = useFilterDropdown('CheckboxFilter');
  const [draft, setDraft] = useState(value);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const needle = query.trim().toLocaleLowerCase('ru');
  const shown = needle
    ? options.filter((option) => option.label.toLocaleLowerCase('ru').includes(needle))
    : options;

  function apply() {
    onApply(options.filter((option) => draft.includes(option.value)).map((option) => option.value));
    close();
  }

  return (
    <div className={styles.checkboxFilter}>
      <div className={styles.body}>
        {searchable ? (
          <div className={styles.searchRow}>
            <div className={styles.search}>
              <SearchIcon className={styles.searchIcon} />
              <Input
                ref={searchRef}
                type="search"
                className={styles.input}
                aria-label={`Поиск: ${label}`}
                placeholder={searchPlaceholder}
                value={query}
                onValueChange={setQuery}
              />
              {query ? (
                <BaseButton
                  className={styles.reset}
                  aria-label="Очистить"
                  onClick={() => {
                    setQuery('');
                    searchRef.current?.focus();
                  }}
                >
                  <CloseIcon />
                </BaseButton>
              ) : null}
            </div>
          </div>
        ) : null}
        {/* Mounted while there is a search, so that screen readers announce the text when it
            appears: a live region that is inserted along with its text is often not read. */}
        {searchable ? (
          <p className={styles.status} role="status">
            {shown.length === 0 ? 'Ничего не найдено' : null}
          </p>
        ) : null}
        {shown.length > 0 ? (
          <CheckboxGroup
            aria-label={label}
            className={styles.list}
            value={draft}
            onValueChange={setDraft}
          >
            {shown.map((option) =>
              swatches ? (
                <ColorSwatch
                  key={option.value}
                  value={option.value}
                  color={option.color}
                  count={option.count}
                  disabled={option.disabled}
                  className={styles.row}
                >
                  {option.label}
                </ColorSwatch>
              ) : (
                <Checkbox
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className={styles.row}
                >
                  <span className={styles.option}>
                    <span>{option.label}</span>{' '}
                    {option.count === undefined ? null : (
                      <span className={styles.count}>{option.count}</span>
                    )}
                  </span>
                </Checkbox>
              ),
            )}
          </CheckboxGroup>
        ) : null}
      </div>
      <div className={styles.footer}>
        <Button fullWidth onClick={apply}>
          Применить
        </Button>
      </div>
    </div>
  );
}
