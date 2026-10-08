'use client';

import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import type { ReactNode } from 'react';

import styles from './checkbox.module.scss';

export interface CheckboxProps extends Omit<
  BaseCheckbox.Root.Props,
  'className' | 'style' | 'render' | 'children' | 'indeterminate' | 'parent' | 'nativeButton'
> {
  // The label to the right of the box; it is the checkbox's accessible name. Rows of a filter put
  // their count in it too.
  children: ReactNode;
  className?: string;
}

// Lamoda's x-checkbox: a 14px box and a 16px label, the whole row clickable through the enclosing
// <label>. Base UI renders the box as role="checkbox" with aria-checked, handles Space, and keeps
// a hidden input for forms. Inside a CheckboxGroup the `value` names it in the group's value.
// No error and no indeterminate state (D7e).
export function Checkbox({ children, className, ...root }: CheckboxProps) {
  return (
    <label className={[styles.checkbox, className].filter(Boolean).join(' ')}>
      <BaseCheckbox.Root className={styles.box} {...root}>
        <BaseCheckbox.Indicator keepMounted className={styles.tick} />
      </BaseCheckbox.Root>
      <span className={styles.label}>{children}</span>
    </label>
  );
}
