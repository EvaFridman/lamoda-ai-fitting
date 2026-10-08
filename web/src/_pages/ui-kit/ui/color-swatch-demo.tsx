'use client';

import { useId, useState } from 'react';

import { CheckboxGroup, ColorSwatch, type SwatchColor } from '@/shared/ui';

import styles from './examples.module.scss';

// Lamoda's colour filter: every colour of the palette with its name and a product count.
const colors: { value: SwatchColor; label: string; count: number }[] = [
  { value: 'black', label: 'Черный', count: 50213 },
  { value: 'gray', label: 'Серый', count: 14820 },
  { value: 'white', label: 'Белый', count: 31570 },
  { value: 'beige', label: 'Бежевый', count: 18344 },
  { value: 'red', label: 'Красный', count: 6129 },
  { value: 'pink', label: 'Розовый', count: 9873 },
  { value: 'orange', label: 'Оранжевый', count: 2311 },
  { value: 'multicolor', label: 'Мультиколор', count: 12045 },
  { value: 'yellow', label: 'Желтый', count: 2702 },
  { value: 'green', label: 'Зеленый', count: 7481 },
  { value: 'navy-blue', label: 'Синий', count: 15327 },
  { value: 'blue', label: 'Голубой', count: 6604 },
  { value: 'purple', label: 'Фиолетовый', count: 3158 },
  { value: 'vinous', label: 'Бордовый', count: 3912 },
  { value: 'coral', label: 'Коралловый', count: 1067 },
  { value: 'turquoise', label: 'Бирюзовый', count: 845 },
  { value: 'fuchsia', label: 'Фуксия', count: 712 },
  { value: 'gold', label: 'Золотой', count: 1394 },
  { value: 'silver', label: 'Серебряный', count: 1188 },
  { value: 'khaki', label: 'Хаки', count: 2476 },
  { value: 'brown', label: 'Коричневый', count: 9035 },
  { value: 'transparent', label: 'Прозрачный', count: 96 },
];

// The live colour filter: several colours can be picked; they show under it.
export function ColorSwatchDemo() {
  const headingId = useId();
  const [value, setValue] = useState<string[]>(['beige']);

  return (
    <div className={[styles.example, styles.filterColumn].join(' ')}>
      <p id={headingId} className={styles.groupLabel}>
        Цвет
      </p>
      <CheckboxGroup aria-labelledby={headingId} value={value} onValueChange={setValue}>
        {colors.map((color) => (
          <ColorSwatch
            key={color.value}
            value={color.value}
            color={color.value}
            count={color.count}
          >
            {color.label}
          </ColorSwatch>
        ))}
      </CheckboxGroup>
      <p className={styles.props} aria-live="polite">
        {value.length === 0 ? 'Ничего не выбрано' : `Выбрано: ${value.join(', ')}`}
      </p>
    </div>
  );
}
