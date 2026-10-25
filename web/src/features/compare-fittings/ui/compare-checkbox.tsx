'use client';

import { CheckIcon } from '@/shared/ui';

import styles from './compare-fittings.module.scss';

export interface CompareCheckboxProps {
  checked: boolean;
  // Two others are chosen already: this one waits, dimmed (board 9).
  disabled: boolean;
  onToggle: () => void;
}

// Board 9's box over a card's top right corner in the selection mode: white with a black frame,
// black with a white tick once chosen.
export function CompareCheckbox({ checked, disabled, onToggle }: CompareCheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label="Выбрать для сравнения"
      className={styles.checkbox}
      disabled={disabled}
      onClick={onToggle}
    >
      {checked && <CheckIcon size={16} />}
    </button>
  );
}
