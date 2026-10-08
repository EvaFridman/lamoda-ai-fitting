'use client';

import { useId, useState } from 'react';

import { SizeSelector, type SizeSelectorOption } from '@/shared/ui';

import styles from './examples.module.scss';

const sizes: SizeSelectorOption[] = [
  { value: '40', label: '40' },
  { value: '42', label: '42', soldOut: true },
  { value: '44', label: '44' },
  { value: '46', label: '46' },
  { value: '48', label: '48', soldOut: true },
  { value: '50', label: '50' },
];

// The live size selector of a product: one size is picked; 42 and 48 are out of stock and cannot
// be picked (D7n).
export function SizeSelectorDemo() {
  const headingId = useId();
  const [value, setValue] = useState('44');

  return (
    <div className={styles.example}>
      <p id={headingId} className={styles.groupLabel}>
        Размер
      </p>
      <SizeSelector
        aria-labelledby={headingId}
        options={sizes}
        value={value}
        onValueChange={setValue}
      />
      <p className={styles.props} aria-live="polite">
        Выбрано: {value}
      </p>
    </div>
  );
}
