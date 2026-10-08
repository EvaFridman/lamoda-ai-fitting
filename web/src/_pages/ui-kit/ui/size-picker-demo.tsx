'use client';

import { useId, useState } from 'react';

import { SizePicker } from '@/shared/ui';

import styles from './examples.module.scss';

const sizes = ['40', '42', '44', '46', '48', '50', '52', '54'].map((size) => ({
  value: size,
  label: size,
}));

// The live size filter: several sizes can be picked (D7m); they show under it.
export function SizePickerDemo() {
  const headingId = useId();
  const [value, setValue] = useState<string[]>(['44']);

  return (
    <div className={[styles.example, styles.filterColumn].join(' ')}>
      <p id={headingId} className={styles.groupLabel}>
        Размер
      </p>
      <SizePicker
        aria-labelledby={headingId}
        options={sizes}
        value={value}
        onValueChange={setValue}
      />
      <p className={styles.props} aria-live="polite">
        {value.length === 0 ? 'Ничего не выбрано' : `Выбрано: ${value.join(', ')}`}
      </p>
    </div>
  );
}
