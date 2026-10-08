'use client';

import { useFilterDropdown } from '../filter-dropdown/filter-dropdown';
import { Radio } from '../radio/radio';
import { RadioGroup } from '../radio-group/radio-group';

import styles from './sort-filter.module.scss';

export interface SortFilterOption {
  value: string;
  label: string;
}

export interface SortFilterProps {
  options: SortFilterOption[];
  value: string;
  // Called at once with every pick; there is no "Применить".
  onValueChange: (value: string) => void;
}

// The content of the sort FilterDropdown: radios that apply as they are picked (D7f). A click, or
// Space or Enter on a radio, closes the dropdown; the arrow keys pick without closing it.
export function SortFilter({ options, value, onValueChange }: SortFilterProps) {
  const { label, close } = useFilterDropdown('SortFilter');

  return (
    <RadioGroup
      aria-label={label}
      className={styles.sortFilter}
      value={value}
      onValueChange={(next) => onValueChange(next)}
      // Clicks of the mouse and of Space on a row (each Radio is a <label>) reach the group; the
      // arrows pick through the hidden input, whose click Base UI keeps from bubbling. A click on
      // the list's padding or scrollbar picks nothing and leaves it open. The close waits for the
      // end of the task: a click on a label's text reaches the group before the label picks its
      // radio, and closing at once would unmount the radio first (at once when there is no
      // fade-out: reduced motion, tests).
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest('label')) setTimeout(close);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') close();
      }}
    >
      {options.map((option) => (
        <Radio key={option.value} value={option.value} className={styles.row}>
          {option.label}
        </Radio>
      ))}
    </RadioGroup>
  );
}
