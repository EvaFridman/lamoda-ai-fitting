'use client';

import { useId, useState } from 'react';

import { Radio, RadioGroup } from '@/shared/ui';

import styles from './examples.module.scss';

// Lamoda's sort options, as in its "Подобрали для вас" dropdown.
const sorts = [
  { value: 'popular', label: 'Подобрали для вас' },
  { value: 'new', label: 'Новинки' },
  { value: 'price-desc', label: 'Сначала дороже' },
  { value: 'price-asc', label: 'Сначала дешевле' },
  { value: 'discount', label: 'По величине скидки' },
];

// The live example of a radio group: the arrow keys move the choice, which shows under it.
export function RadioGroupDemo() {
  const headingId = useId();
  const [value, setValue] = useState('popular');

  return (
    <div className={styles.example}>
      <p id={headingId} className={styles.groupLabel}>
        Сортировка
      </p>
      <RadioGroup aria-labelledby={headingId} value={value} onValueChange={setValue}>
        {sorts.map((sort) => (
          <Radio key={sort.value} value={sort.value}>
            {sort.label}
          </Radio>
        ))}
      </RadioGroup>
      <p className={styles.props} aria-live="polite">
        Выбрано: {value}
      </p>
    </div>
  );
}
