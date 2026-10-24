'use client';

import { Progress } from '@base-ui/react/progress';

import styles from './progress-bar.module.scss';

export interface ProgressBarProps {
  // 0–100; outside it is clamped, and a value that is not a finite number (an estimate of 0 s)
  // is 0.
  value: number;
  // The bar's accessible name ("Примерка"): its text on the page sits next to it, not inside.
  'aria-label': string;
  className?: string;
}

// A thin bar of how far something got (board 6's wait: the stage, the percent and the time left
// are the page's text around it). Base UI's Progress gives it role="progressbar" and its value.
// The fill moves with the kit's short transition.
export function ProgressBar({ value, 'aria-label': label, className }: ProgressBarProps) {
  const clamped = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  return (
    <Progress.Root
      value={clamped}
      aria-label={label}
      className={[styles.root, className].filter(Boolean).join(' ')}
    >
      <Progress.Track className={styles.track}>
        <Progress.Indicator className={styles.indicator} />
      </Progress.Track>
    </Progress.Root>
  );
}
