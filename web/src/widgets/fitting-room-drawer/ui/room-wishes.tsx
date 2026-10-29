'use client';

import { useId } from 'react';

import { ROOM_WISHES_MAX, useRoomStore, useRoomWishes } from '@/entities/fitting-room';

import styles from './fitting-room-drawer.module.scss';

export interface RoomWishesProps {
  userId: string;
  phone: boolean;
}

// Board 2's PromptField «Пожелания к образу» (A16, A62), with no «· по желанию» or hint, only the
// counter (spec 0023 Y6): up to 200 characters, kept in the tab's
// memory for this user (A90.5) and sent with the look's try-on (T26). The text is personal: the
// block is `mp-block`, and the text stays out of attributes (recordings keep them).
export function RoomWishes({ userId, phone }: RoomWishesProps) {
  const id = useId();
  const metaId = useId();
  const wishes = useRoomWishes(userId);
  const setWishes = useRoomStore((state) => state.setWishes);
  return (
    <div className={['mp-block', styles.wishes].join(' ')}>
      <label htmlFor={id} className={styles.wishesLabel}>
        Пожелания к образу
      </label>
      <textarea
        id={id}
        className={styles.wishesArea}
        value={wishes}
        rows={5}
        maxLength={ROOM_WISHES_MAX}
        placeholder={
          phone
            ? 'Например: заправить рубашку в юбку'
            : 'Например: заправить рубашку в юбку, тренч накинуть на плечи'
        }
        aria-describedby={metaId}
        onChange={(event) => setWishes(userId, event.target.value)}
      />
      <div id={metaId} className={styles.wishesMeta}>
        <span>
          {wishes.length} / {ROOM_WISHES_MAX}
        </span>
      </div>
    </div>
  );
}
