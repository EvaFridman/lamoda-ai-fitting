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
  // A group with nothing to pick (disabled, or every size out of stock) leaves the Tab order, as
  // a radio group does (D7e): Base UI would otherwise keep a tab stop on a cell that cannot be
  // picked.
  const unreachable = group.disabled || options.every((option) => option.soldOut);

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
          // Only when unreachable: an explicit undefined would override Base UI's roving tabIndex.
          {...(unreachable ? { tabIndex: -1 } : {})}
        >
          {option.label}
        </BaseRadio.Root>
      ))}
    </BaseRadioGroup>
  );
}
