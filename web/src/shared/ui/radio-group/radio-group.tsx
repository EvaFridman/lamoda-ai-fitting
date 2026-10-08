'use client';

import { RadioGroup as BaseRadioGroup } from '@base-ui/react/radio-group';
import { createContext, useCallback, useState } from 'react';

import styles from './radio-group.module.scss';

// A group needs a name for screen readers: a visible heading's id or a text of its own.
type GroupName = { 'aria-labelledby': string } | { 'aria-label': string };

export type RadioGroupProps<Value = string> = Omit<
  BaseRadioGroup.Props<Value>,
  'className' | 'style' | 'render' | 'aria-label' | 'aria-labelledby'
> &
  GroupName & { className?: string };

interface RadioGroupTabContext {
  // The whole group is disabled.
  disabled: boolean;
  // At least one radio of the group can be picked.
  hasEnabled: boolean;
  // An enabled Radio registers itself while mounted; returns the cleanup.
  registerEnabled: () => () => void;
}

// Lets a disabled Radio leave the Tab order when its group has nothing to pick (see Radio).
export const RadioGroupTabContext = createContext<RadioGroupTabContext>({
  disabled: false,
  hasEnabled: false,
  registerEnabled: () => () => {},
});

// A column of Radios with one value. Base UI renders role="radiogroup": Tab enters on the checked
// radio (or the first enabled one), the arrow keys move and select within the group.
export function RadioGroup<Value = string>({ className, ...group }: RadioGroupProps<Value>) {
  const [enabledCount, setEnabledCount] = useState(0);
  const registerEnabled = useCallback(() => {
    setEnabledCount((count) => count + 1);
    return () => setEnabledCount((count) => count - 1);
  }, []);

  return (
    <RadioGroupTabContext
      value={{ disabled: group.disabled ?? false, hasEnabled: enabledCount > 0, registerEnabled }}
    >
      <BaseRadioGroup<Value>
        className={[styles.radioGroup, className].filter(Boolean).join(' ')}
        {...group}
      />
    </RadioGroupTabContext>
  );
}
