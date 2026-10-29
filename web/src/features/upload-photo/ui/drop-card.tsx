import type { ReactNode } from 'react';

import { FileInput, type FileInputProps, PlusIcon } from '@/shared/ui';

import styles from './drop-card.module.scss';

export interface DropCardProps {
  // A device whose primary pointer is a finger: the hint names the camera, `actions` are the two
  // tiles.
  touch?: boolean;
  // A file is dragged over the card.
  dragging?: boolean;
  // Off: the circle does not answer the pointer.
  disabled?: boolean;
  // A control over the whole card, under its text: a click anywhere picks a file.
  area?: ReactNode;
  // «Выбрать файл» (`dropCardClass.link`) with a mouse, the two tiles (`dropCardClass.tile`) on a
  // touch device.
  actions: ReactNode;
}

// The classes of the card's own controls: the button over the whole card, «Выбрать файл» and a
// tile.
export const dropCardClass = { area: styles.dropArea, link: styles.chooseLink, tile: styles.tile };

export type DropCardPickerProps = Omit<FileInputProps, 'bare' | 'className'> & {
  kind: keyof typeof dropCardClass;
};

// One of the card's file pickers drawn in its place, for a page that picks files with no consents
// to wait for (`/ui-kit`).
export function DropCardPicker({ kind, ...props }: DropCardPickerProps) {
  return <FileInput bare className={dropCardClass[kind]} {...props} />;
}

// The empty drop zone (spec 0024 Z17, Z47): a card of the photo frame's size with a hairline
// border, white: a thin «+» in a hairline circle in the middle of the space over the text, in the
// card's lower part the call, one muted line and the pickers, the formats at the bottom. A pointer over it blackens the circle; a file dragged over it blackens the border,
// greys the card and grows the circle. It only draws: the page owns the drop and the pickers.
// The classes carry the card's name: tests keep CSS modules' names unscoped, and a shared name
// would take another module's rules there. `tile`, `dragging` and `disabled` stay plain, the names
// the tests look for: nothing of theirs reaches another element.
export function DropCard({
  touch = false,
  dragging = false,
  disabled = false,
  area,
  actions,
}: DropCardProps) {
  return (
    <div
      className={[styles.dropCard, dragging && styles.dragging, disabled && styles.disabled]
        .filter(Boolean)
        .join(' ')}
    >
      {area}
      <div className={styles.dropBody}>
        <span className={styles.dropCircleSlot} aria-hidden>
          <span className={styles.dropCircle}>
            <PlusIcon />
          </span>
        </span>
        <p className={styles.dropTitle}>Загрузите своё фото</p>
        <p className={styles.dropLine}>
          {touch
            ? 'Выберите файл или сделайте фото'
            : 'Перетащите, вставьте Ctrl+V или выберите файл'}
        </p>
        <div className={touch ? styles.dropTiles : styles.dropActions}>{actions}</div>
      </div>
      <p className={styles.dropFormats}>JPG, PNG, WebP, HEIC · до 20 МБ</p>
    </div>
  );
}
