'use client';

import type { PointerEvent } from 'react';

import { IconButton, LinkButton, Radio, RadioGroup, TrashIcon } from '@/shared/ui';

import type { UserPhoto } from '../model/schemas';
import { PhotoThumb } from './photo-thumb';

import styles from './saved-photo-card.module.scss';

// The tracked element's handlers of «Сделать основным», from the page's `useTrackedElement`.
export interface SavedPhotoEvents {
  onClick?: () => void;
  onPointerEnter?: (event: PointerEvent) => void;
  onPointerLeave?: () => void;
}

export interface SavedPhotoCardProps {
  photo: Pick<UserPhoto, 'id' | 'url' | 'isDefault' | 'width' | 'height' | 'createdAt'>;
  // The photo's place in the list, from 1: its name ("Фото 2"), never its data.
  position: number;
  // `card`: board 10's grid cell; `row`: the phone's row with a small thumbnail.
  layout: 'card' | 'row';
  // «Сделать основным» is off while a change of the default is on its way.
  busy?: boolean;
  onMakeDefault: () => void;
  onDelete: () => void;
  makeDefaultEvents?: SavedPhotoEvents;
}

const DAY = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const DAY_OF_YEAR = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** "12 октября", with the year when it is not this one. */
export function uploadedOn(iso: string, now = new Date()): string {
  const date = new Date(iso);
  return (date.getFullYear() === now.getFullYear() ? DAY : DAY_OF_YEAR).format(date);
}

// A saved photo of «Мои фото» (spec 0019 board 10, A63.8). The card: the photo with the badge
// «По умолчанию» on the default one, under it the upload's date for the default and the radio
// «Сделать основным» for any other, and the bin «Удалить фото N». The row: a 72×96 thumbnail, the
// badge or «Сделать основным» as a text button, the date, and the bin. It only displays: the page
// owns the requests and the confirmation.
export function SavedPhotoCard({
  photo,
  position,
  layout,
  busy = false,
  onMakeDefault,
  onDelete,
  makeDefaultEvents,
}: SavedPhotoCardProps) {
  const name = `фото ${position}`;
  const date = uploadedOn(photo.createdAt);
  const remove = (
    <IconButton
      variant="plain"
      size={44}
      className={styles.delete}
      aria-label={`Удалить ${name}`}
      onClick={onDelete}
    >
      <TrashIcon />
    </IconButton>
  );

  if (layout === 'row') {
    return (
      <div className={styles.row}>
        <PhotoThumb
          photo={photo}
          alt={`Фото ${position}`}
          showDefault={false}
          className={styles.rowThumb}
        />
        <div className={styles.rowText}>
          {photo.isDefault ? (
            <span className={styles.badge}>По умолчанию</span>
          ) : (
            <LinkButton
              disabled={busy}
              onClick={() => {
                makeDefaultEvents?.onClick?.();
                onMakeDefault();
              }}
              onPointerEnter={makeDefaultEvents?.onPointerEnter}
              onPointerLeave={makeDefaultEvents?.onPointerLeave}
              aria-label={`Сделать основным ${name}`}
            >
              Сделать основным
            </LinkButton>
          )}
          <span className={styles.date}>{date}</span>
        </div>
        {remove}
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <PhotoThumb photo={photo} alt={`Фото ${position}`} />
      <div className={styles.cardRow}>
        {photo.isDefault ? (
          <span className={styles.date}>Загружено {date}</span>
        ) : (
          // One radio, never checked here: choosing it makes this photo the default, and the list
          // read again shows it as the default card. Named by its label, «Сделать основным фото
          // N», the visible words first: the photo's place is hidden from the eye only (Base UI
          // names the radio by its label, over an `aria-label`). Its value is a constant, not the photo's id: Base UI
          // writes it into a hidden input, and recordings keep attributes (spec 0008).
          <RadioGroup<string>
            aria-label={`Фото ${position}`}
            value=""
            disabled={busy}
            onValueChange={() => onMakeDefault()}
            className={styles.radioGroup}
          >
            <Radio<string>
              value="make-default"
              onClick={() => makeDefaultEvents?.onClick?.()}
              onPointerEnter={makeDefaultEvents?.onPointerEnter}
              onPointerLeave={makeDefaultEvents?.onPointerLeave}
            >
              Сделать основным <span className={styles.hidden}>{name}</span>
            </Radio>
          </RadioGroup>
        )}
        {remove}
      </div>
    </div>
  );
}
