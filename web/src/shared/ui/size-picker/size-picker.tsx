'use client';

import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import { CheckboxGroup as BaseCheckboxGroup } from '@base-ui/react/checkbox-group';

import styles from './size-picker.module.scss';

export interface SizePickerOption {
  value: string;
  // The size as the cell shows it ("42", "XS"); it is the cell's accessible name.
  label: string;
  disabled?: boolean;
}

// A group needs a name for screen readers: a visible heading's id or a text of its own.
type GroupName = { 'aria-labelledby': string } | { 'aria-label': string };

export type SizePickerProps = Omit<
  BaseCheckboxGroup.Props,
  'className' | 'style' | 'render' | 'children' | 'allValues' | 'aria-label' | 'aria-labelledby'
> &
  GroupName & {
    options: SizePickerOption[];
    className?: string;
  };

// The size filter of the catalog: a wrapping row of 46×46 cells, several of them can be picked
// (D7m). Each cell is a Base UI checkbox (role="checkbox", aria-checked, Space toggles, Tab moves
// from cell to cell); the value is the list of picked sizes.
export function SizePicker({ options, className, ...group }: SizePickerProps) {
  return (
    <BaseCheckboxGroup
      className={[styles.sizePicker, className].filter(Boolean).join(' ')}
      {...group}
    >
      {options.map((option) => (
        <BaseCheckbox.Root
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className={styles.cell}
        >
          {option.label}
        </BaseCheckbox.Root>
      ))}
    </BaseCheckboxGroup>
  );
}
