'use client';

import { useState } from 'react';

import { Select } from '@/shared/ui';

import { colorOptions, sizeOptions } from '../config/select';
import styles from './examples.module.scss';

// The colour and size selects of a product page, live: what is picked shows under them.
export function SelectDemo() {
  const [color, setColor] = useState<string | null>('white');
  const [size, setSize] = useState<string | null>(null);

  const colorLabel = colorOptions.find((option) => option.value === color)?.label;
  const sizeLabel = sizeOptions.find((option) => option.value === size)?.label;

  return (
    <div className={[styles.example, styles.select].join(' ')}>
      <Select aria-label="Цвет" options={colorOptions} value={color} onValueChange={setColor} />
      <Select
        aria-label="Размер"
        options={sizeOptions}
        placeholder="Выберите размер"
        value={size}
        onValueChange={setSize}
      />
      <p className={styles.props} aria-live="polite">
        Цвет: {colorLabel ?? '—'}, размер: {sizeLabel ?? 'не выбран'}
      </p>
    </div>
  );
}
