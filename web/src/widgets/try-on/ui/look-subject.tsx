'use client';

import { ItemsStrip } from '@/entities/fitting';
import { type FittingRoom, useFittingRoom } from '@/entities/fitting-room';
import { useTrackedElement } from '@/shared/analytics';
import { formatPrice, plural } from '@/shared/lib';
import { LinkButton } from '@/shared/ui';

import styles from './look-subject.module.scss';

const ITEMS = ['вещь', 'вещи', 'вещей'] as const;

// «4 вещи».
export function itemsText(count: number): string {
  return `${count} ${plural(count, ITEMS)}`;
}

// The look a picker tries on: the room's, or a shown fitting's on another photo.
export interface LookItems {
  items: { productId: string; imageUrl: string | null; attributeValueId: string | null }[];
  sum: number;
}

// The room's look, in its colours.
export function roomLook(room: FittingRoom): LookItems {
  return {
    items: room.items.map(({ product, attributeValueId }) => ({
      productId: product.id,
      imageUrl: product.image?.url ?? null,
      attributeValueId,
    })),
    sum: room.sum,
  };
}

export interface LookSubjectProps {
  look: LookItems;
  // «Изменить»: back to the fitting room.
  onChange: () => void;
}

// Board 3.2's ItemsStrip row: the look's pictures, «Образ · N вещей», the sum and «Изменить»
// (`room.open` from `picker`, A94.4).
export function LookSubject({ look, onChange }: LookSubjectProps) {
  const room = useFittingRoom();
  const tracked = useTrackedElement('room.open', {
    source: 'picker',
    items: room.data?.count ?? 0,
  });
  return (
    <div className={styles.subject}>
      <ItemsStrip items={look.items} />
      <span className={styles.text}>
        <span>Образ · {itemsText(look.items.length)}</span>
        <b>{formatPrice(look.sum)}</b>
      </span>
      <LinkButton
        onPointerEnter={tracked.onPointerEnter}
        onPointerLeave={tracked.onPointerLeave}
        onClick={() => {
          tracked.onClick();
          onChange();
        }}
      >
        Изменить
      </LinkButton>
    </div>
  );
}
