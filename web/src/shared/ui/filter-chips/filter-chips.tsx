'use client';

import { Button as BaseButton } from '@base-ui/react/button';
import { type ReactNode, useRef } from 'react';

import styles from './filter-chips.module.scss';

export interface FilterChipsProps {
  // FilterDropdowns and FilterChips.
  children: ReactNode;
  // Given, "Очистить фильтры" follows the chips and calls it; pass it while a filter is applied.
  onClearAll?: () => void;
  className?: string;
}

// The row of filter chips, wrapping with 8px gaps, as above Lamoda's catalog. "Очистить фильтры"
// looks like a link but is a button: it acts on the page and goes nowhere.
export function FilterChips({ children, onClearAll, className }: FilterChipsProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={rowRef} className={[styles.filterChips, className].filter(Boolean).join(' ')}>
      {children}
      {onClearAll ? (
        <BaseButton
          className={styles.clearAll}
          onClick={() => {
            onClearAll();
            // The button goes away once nothing is applied: the focus moves to the first chip.
            rowRef.current?.querySelector('button')?.focus();
          }}
        >
          Очистить фильтры
        </BaseButton>
      ) : null}
    </div>
  );
}
