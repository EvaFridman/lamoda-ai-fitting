'use client';

import { useId, useState } from 'react';

import { Chip, ChipGroup } from '@/shared/ui';

import styles from './examples.module.scss';

// The look's items of board 8.3's «Какая именно?» (the reasons' chips of board 7.3 are gone, spec
// 0023 P33).
const items = [
  { value: 'shirt', label: 'Рубашка' },
  { value: 'skirt', label: 'Юбка' },
  { value: 'trench', label: 'Тренч' },
  { value: 'boots', label: 'Ботильоны' },
];

// The live example of a chip group: one chip at a time may be pressed, as «Какая именно?»; the
// choice shows under it.
export function ChipsDemo() {
  const headingId = useId();
  const [value, setValue] = useState<string[]>(['trench']);

  return (
    <div className={styles.example}>
      <p id={headingId} className={styles.groupLabel}>
        Какая именно?
      </p>
      <ChipGroup
        aria-labelledby={headingId}
        value={value}
        multiple={false}
        onValueChange={setValue}
      >
        {items.map((item) => (
          <Chip key={item.value} value={item.value}>
            {item.label}
          </Chip>
        ))}
      </ChipGroup>
      <p className={styles.props} aria-live="polite">
        Выбрано: {value.length > 0 ? value.join(', ') : 'ничего'}
      </p>
    </div>
  );
}

const keep = () => {};

// The fixed states. Here, not in the server section: a server component cannot pass a ChipGroup
// its `onValueChange`.
export function ChipStates() {
  return (
    <ul className={styles.row}>
      <li className={styles.example}>
        <ChipGroup aria-label="Обычный" value={[]} onValueChange={keep}>
          <Chip value="shirt">Рубашка</Chip>
        </ChipGroup>
        <code className={styles.props}>обычный</code>
      </li>
      <li className={styles.example}>
        <ChipGroup aria-label="Нажатый" value={['trench']} onValueChange={keep}>
          <Chip value="trench">Тренч</Chip>
        </ChipGroup>
        <code className={styles.props}>нажатый</code>
      </li>
      <li className={styles.example}>
        <ChipGroup aria-label="Недоступный" value={[]} onValueChange={keep} disabled>
          <Chip value="skirt">Юбка</Chip>
        </ChipGroup>
        <code className={styles.props}>disabled</code>
      </li>
    </ul>
  );
}
