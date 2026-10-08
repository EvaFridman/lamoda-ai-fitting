'use client';

import { useId, useState } from 'react';

import { Checkbox, CheckboxGroup } from '@/shared/ui';

import styles from './examples.module.scss';

const materials = [
  { value: 'cotton', label: 'Хлопок' },
  { value: 'wool', label: 'Шерсть' },
  { value: 'viscose', label: 'Вискоза' },
  { value: 'linen', label: 'Лён', disabled: true },
];

// The live example of a checkbox group: the picked values show under it.
export function CheckboxGroupDemo() {
  const headingId = useId();
  const [value, setValue] = useState<string[]>(['wool']);

  return (
    <div className={styles.example}>
      <p id={headingId} className={styles.groupLabel}>
        Материал
      </p>
      <CheckboxGroup aria-labelledby={headingId} value={value} onValueChange={setValue}>
        {materials.map((material) => (
          <Checkbox key={material.value} value={material.value} disabled={material.disabled}>
            {material.label}
          </Checkbox>
        ))}
      </CheckboxGroup>
      <p className={styles.props} aria-live="polite">
        {value.length === 0 ? 'Ничего не выбрано' : `Выбрано: ${value.join(', ')}`}
      </p>
    </div>
  );
}
