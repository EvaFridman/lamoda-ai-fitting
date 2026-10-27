'use client';

import { type FittingRoom, useFittingRoom } from '@/entities/fitting-room';
import { useTrackedElement } from '@/shared/analytics';
import { formatPrice, plural } from '@/shared/lib';
import { LinkButton } from '@/shared/ui';

import { ItemRow } from './item-row';
import { PickerItemActions } from './picker-item-actions';

import styles from './look-subject.module.scss';

const ITEMS = ['вещь', 'вещи', 'вещей'] as const;

// «4 вещи».
export function itemsText(count: number): string {
  return `${count} ${plural(count, ITEMS)}`;
}

// An item of the look a picker tries on, as its card shows it.
export interface LookItem {
  productId: string;
  name: string;
  imageUrl: string | null;
  price: number;
  finalPrice: number;
  attributeValueId: string | null;
  // The colour's name.
  colour: string | null;
}

// The look a picker tries on: the room's, or a shown fitting's on another photo.
export interface LookItems {
  items: LookItem[];
  sum: number;
}

// The room's look, in its colours.
export function roomLook(room: FittingRoom): LookItems {
  return {
    items: room.items.map(({ product, attributeValueId, colour }) => ({
      productId: product.id,
      name: product.name,
      imageUrl: product.image?.url ?? null,
      price: product.price,
      finalPrice: product.finalPrice,
      attributeValueId,
      colour,
    })),
    sum: room.sum,
  };
}

export interface LookSubjectProps {
  look: LookItems;
  // «Изменить»: back to the fitting room.
  onChange: () => void;
}

// Board 3.2's head, «Образ · N вещей», the sum and «Изменить» (`room.open` from `picker`, A94.4),
// then the look's items as the single try-on's item cards, one under another (spec 0023 P22).
export function LookSubject({ look, onChange }: LookSubjectProps) {
  const room = useFittingRoom();
  const tracked = useTrackedElement('room.open', {
    source: 'picker',
    items: room.data?.count ?? 0,
  });
  return (
    <div className={styles.subject}>
      <div className={styles.head}>
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
      <ul className={styles.items}>
        {look.items.map((item) => (
          <li key={item.productId}>
            <ItemRow
              name={item.name}
              imageUrl={item.imageUrl}
              details={item.colour}
              price={item.price}
              finalPrice={item.finalPrice}
              action={<PickerItemActions kind="look" />}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
