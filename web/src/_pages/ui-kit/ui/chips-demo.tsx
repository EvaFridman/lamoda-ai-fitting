'use client';

import { useId, useState } from 'react';

import { Chip, ChipGroup } from '@/shared/ui';

import styles from './examples.module.scss';

// The reasons of board 7's «Что поменять?».
const reasons = [
  { value: 'face', label: 'Лицо' },
  { value: 'figure', label: 'Фигура' },
  { value: 'item', label: 'Вещь' },
  { value: 'background', label: 'Фон' },
  { value: 'other', label: 'Другое' },
];

// The live example of a chip group: several chips may be pressed; the choice shows under it.
export function ChipsDemo() {
  const headingId = useId();
  const [value, setValue] = useState<string[]>(['item']);

  return (
    <div className={styles.example}>
      <p id={headingId} className={styles.groupLabel}>
        Что поменять?
      </p>
      <ChipGroup aria-labelledby={headingId} value={value} onValueChange={setValue}>
        {reasons.map((reason) => (
          <Chip key={reason.value} value={reason.value}>
            {reason.label}
          </Chip>
        ))}
      </ChipGroup>
      <p className={styles.props} aria-live="polite">
        Выбрано: {value.length > 0 ? value.join(', ') : 'ничего'}
      </p>
    </div>
  );
}
