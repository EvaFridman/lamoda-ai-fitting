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

interface CheckboxListOptions {
  options: CheckboxFilterOption[];
  // A search field over the list, for long lists.
  searchable?: boolean;
  searchPlaceholder?: string;
  // Rows of the colour filter: a ColorSwatch with the option's `color` in place of each checkbox.
  swatches?: boolean;
}

export interface CheckboxFilterProps extends CheckboxListOptions {
  // The applied values: the boxes ticked when the dropdown opens.
  value: string[];
  // Called by "Применить" with the ticked values in the order of `options`; the dropdown closes.
  onApply: (value: string[]) => void;
}

export interface CheckboxFilterPanelProps extends CheckboxListOptions {
  // The name of the list for screen readers: the title of the section it is in.
  label: string;
  // The ticked values.
  value: string[];
  // Called at every tick with the ticked values in the order of `options`. There is no
  // "Применить": whoever places the panel applies them (the phone drawer's "Показать N товаров").
  onValueChange: (value: string[]) => void;
}

// The content of a FilterDropdown: the list of CheckboxFilterPanel and "Применить". Ticks are a
// draft until applied; the list is named after the chip.
export function CheckboxFilter({ value, onApply, ...list }: CheckboxFilterProps) {
  const { label, close } = useFilterDropdown('CheckboxFilter');
  const [draft, setDraft] = useState(value);

  // A value no longer in the list goes too, ticks or not.
  function apply() {
    onApply(list.options.filter((option) => draft.includes(option.value)).map((o) => o.value));
    close();
  }

  return (
    <div className={styles.checkboxFilter}>
      <div className={styles.body}>
        <CheckboxFilterPanel {...list} label={label} value={draft} onValueChange={setDraft} />
      </div>
      <div className={styles.footer}>
        <Button fullWidth onClick={apply}>
          Применить
        </Button>
      </div>
    </div>
  );
}

// A list of checkboxes (or colour swatches) with counts and an optional search that narrows it,
// with no dropdown and no "Применить" of its own: a section of the phone drawer (spec 0014 O6).
export function CheckboxFilterPanel({
  options,
  label,
  value,
  onValueChange,
  searchable = false,
  searchPlaceholder = 'Поиск',
  swatches = false,
}: CheckboxFilterPanelProps) {
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const needle = query.trim().toLocaleLowerCase('ru');
  const shown = needle
    ? options.filter((option) => option.label.toLocaleLowerCase('ru').includes(needle))
    : options;

  return (
    <div className={styles.panel}>
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
          value={value}
          // In the order of the options, whatever order they were ticked in.
          onValueChange={(ticked) =>
            onValueChange(
              options
                .filter((option) => ticked.includes(option.value))
                .map((option) => option.value),
            )
          }
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
  );
}
