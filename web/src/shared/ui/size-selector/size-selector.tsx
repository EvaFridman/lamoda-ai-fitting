'use client';

import { Radio as BaseRadio } from '@base-ui/react/radio';
import { RadioGroup as BaseRadioGroup } from '@base-ui/react/radio-group';

import styles from './size-selector.module.scss';

export interface SizeSelectorOption {
  value: string;
  // The size as the cell shows it ("44", "M"); it is the cell's accessible name.
  label: string;
  // Out of stock: announced as unavailable, cannot be picked (D7n).
  soldOut?: boolean;
}

// A group needs a name for screen readers: a visible heading's id or a text of its own.
type GroupName = { 'aria-labelledby': string } | { 'aria-label': string };

export type SizeSelectorProps = Omit<
  BaseRadioGroup.Props<string>,
  'className' | 'style' | 'render' | 'children' | 'aria-label' | 'aria-labelledby'
> &
  GroupName & {
    options: SizeSelectorOption[];
    className?: string;
  };

// The sizes of a product: a wrapping row of 56×52 cells, one of them picked. Base UI renders
// role="radiogroup" with role="radio" cells: Tab enters on the picked cell (or the first one in
// stock), the arrow keys move and pick. An out-of-stock cell has aria-disabled, which screen
// readers announce as unavailable and Base UI's arrow keys pass by; it is read-only for Base UI,
// so a click does not pick it either (D7n).
export function SizeSelector({ options, className, ...group }: SizeSelectorProps) {
  return (
    <BaseRadioGroup<string>
      className={[styles.sizeSelector, className].filter(Boolean).join(' ')}
      {...group}
    >
      {options.map((option) => (
        <BaseRadio.Root<string>
          key={option.value}
          value={option.value}
          readOnly={option.soldOut}
          aria-disabled={option.soldOut || undefined}
          className={styles.cell}
          // A disabled group has nothing to pick: it leaves the Tab order, as a disabled radio
          // group does (D7e). An explicit undefined would override Base UI's roving tabIndex.
          {...(group.disabled ? { tabIndex: -1 } : {})}
        >
          {option.label}
        </BaseRadio.Root>
      ))}
    </BaseRadioGroup>
  );
}
