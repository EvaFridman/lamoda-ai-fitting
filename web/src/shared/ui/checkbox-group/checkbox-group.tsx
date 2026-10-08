'use client';

import { CheckboxGroup as BaseCheckboxGroup } from '@base-ui/react/checkbox-group';

import styles from './checkbox-group.module.scss';

// A group needs a name for screen readers: a visible heading's id or a text of its own.
type GroupName = { 'aria-labelledby': string } | { 'aria-label': string };

export type CheckboxGroupProps = Omit<
  BaseCheckboxGroup.Props,
  'className' | 'style' | 'render' | 'allValues' | 'aria-label' | 'aria-labelledby'
> &
  GroupName & { className?: string };

// A column of Checkboxes that share one value: the `value`s of the ticked ones. Base UI renders
// role="group"; Tab moves from box to box. No parent checkbox (D7e).
export function CheckboxGroup({ className, ...group }: CheckboxGroupProps) {
  return (
    <BaseCheckboxGroup
      className={[styles.checkboxGroup, className].filter(Boolean).join(' ')}
      {...group}
    />
  );
}
