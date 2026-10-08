import type { HTMLAttributes } from 'react';

import styles from './spinner.module.scss';

export type SpinnerSize = 24 | 64;

export interface SpinnerProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children' | 'role'> {
  size?: SpinnerSize;
  // The spinner's accessible name. A spinner inside a control that already says it is busy
  // (Button with `loading`) is hidden with `aria-hidden` instead.
  label?: string;
}

// Lamoda's ring loader: a ring that fades from transparent to the text colour and turns every 1.4s.
// Its colour comes from the text around it (currentColor), so it shows on black buttons too.
export function Spinner({ size = 24, label = 'Загрузка', className, ...props }: SpinnerProps) {
  return (
    <span
      role="progressbar"
      aria-label={label}
      className={[styles.spinner, styles[`size${size}`], className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}
