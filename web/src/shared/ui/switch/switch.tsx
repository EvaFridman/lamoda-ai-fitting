'use client';

import { Switch as BaseSwitch } from '@base-ui/react/switch';
import type { ReactNode } from 'react';

import styles from './switch.module.scss';

export interface SwitchProps extends Omit<
  BaseSwitch.Root.Props,
  'className' | 'style' | 'render' | 'children' | 'nativeButton'
> {
  // The label to the left of the switch; it is the switch's accessible name.
  children: ReactNode;
  className?: string;
}

// Lamoda's filter switch ("Только со скидкой"): the label, then a 34×14 track with a 20px white
// thumb that slides right when on. Base UI renders role="switch" with aria-checked and handles
// Space; the whole row is clickable through the enclosing <label>.
export function Switch({ children, className, ...root }: SwitchProps) {
  return (
    <label className={[styles.switch, className].filter(Boolean).join(' ')}>
      <span className={styles.label}>{children}</span>
      <BaseSwitch.Root className={styles.track} {...root}>
        <BaseSwitch.Thumb className={styles.thumb} />
      </BaseSwitch.Root>
    </label>
  );
}
