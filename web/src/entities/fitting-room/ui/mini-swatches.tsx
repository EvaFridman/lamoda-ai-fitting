'use client';

import { type HexColor, SwatchDot } from '@/shared/ui';

import styles from './mini-swatches.module.scss';

export interface SwatchChoice {
  // The attribute value's id, its name and its swatch colour.
  id: string;
  value: string;
  colorHex: string | null;
}

export interface MiniSwatchesProps {
  // The group's name: «Цвет рубашки».
  label: string;
  colours: readonly SwatchChoice[];
  value: string | null;
  onValueChange: (id: string) => void;
  // Off while a choice is being applied (a look's colour regenerating, board 8.2).
  disabled?: boolean;
  className?: string;
}

// Board 13's MiniSwatches: a compact colour choice in lists, a row of 22px circles as the kit's
// ColorSwatch draws them, the chosen one ringed, and its name after them («выбран белый»). Each
// circle is a button pressed when chosen; the group names the item.
export function MiniSwatches({
  label,
  colours,
  value,
  onValueChange,
  disabled = false,
  className,
}: MiniSwatchesProps) {
  const chosen = colours.find((colour) => colour.id === value);
  return (
    <div className={[styles.swatches, className].filter(Boolean).join(' ')}>
      <div role="group" aria-label={label} className={styles.row}>
        {colours.map((colour) => (
          <button
            key={colour.id}
            type="button"
            className={styles.choice}
            aria-label={colour.value}
            aria-pressed={colour.id === value}
            disabled={disabled}
            onClick={() => onValueChange(colour.id)}
          >
            <SwatchDot
              color={colour.colorHex === null ? undefined : (colour.colorHex as HexColor)}
              className={styles.dot}
            />
          </button>
        ))}
      </div>
      {chosen && (
        <span className={styles.chosen}>выбран {chosen.value.toLocaleLowerCase('ru-RU')}</span>
      )}
    </div>
  );
}
