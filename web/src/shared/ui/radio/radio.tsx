'use client';

import { Radio as BaseRadio } from '@base-ui/react/radio';
import { type ReactNode, use, useEffect } from 'react';

import { RadioGroupTabContext } from '../radio-group/radio-group';
import styles from './radio.module.scss';

export interface RadioProps<Value = string> extends Omit<
  BaseRadio.Root.Props<Value>,
  'className' | 'style' | 'render' | 'children' | 'nativeButton' | 'tabIndex'
> {
  // The label to the right of the circle; it is the radio's accessible name.
  children: ReactNode;
  className?: string;
}

// Lamoda's x-radio-group-material: a 20px circle with a 10px black dot and a 16px label, the whole
// row clickable through the enclosing <label>. Lives only inside a RadioGroup, which holds the
// value. Base UI renders role="radio" with aria-checked.
export function Radio<Value = string>({ children, className, ...root }: RadioProps<Value>) {
  const group = use(RadioGroupTabContext);
  const { registerEnabled } = group;
  const ownDisabled = root.disabled ?? false;

  useEffect(() => (ownDisabled ? undefined : registerEnabled()), [ownDisabled, registerEnabled]);

  // Base UI keeps one radio of a group in the Tab order (the checked one, else the first enabled),
  // even a disabled one when nothing in the group can be picked: a lone disabled radio, a disabled
  // group. Then it leaves the Tab order, as a disabled checkbox or switch does. A group with an
  // enabled radio stays reachable, so the arrows can move to it.
  const unreachable = group.disabled || (ownDisabled && !group.hasEnabled);

  return (
    <label className={[styles.radio, className].filter(Boolean).join(' ')}>
      <BaseRadio.Root<Value>
        className={styles.circle}
        {...root}
        // Only when unreachable: an explicit undefined would override Base UI's roving tabIndex.
        {...(unreachable ? { tabIndex: -1 } : {})}
      >
        <BaseRadio.Indicator className={styles.dot} />
      </BaseRadio.Root>
      <span className={styles.label}>{children}</span>
    </label>
  );
}
