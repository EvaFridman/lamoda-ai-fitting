import Image from 'next/image';
import NextLink from 'next/link';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

import { Link, Price, Skeleton } from '@/shared/ui';

import { emptySlotCaption, roomItemName, SLOT_TITLES } from '../config/slots';
import type { FittingRoomItem, OutfitSlot as Slot } from '../model/schemas';

import styles from './outfit-slot.module.scss';

export interface OutfitSlotRowProps {
  item: FittingRoomItem;
  // The product's page: the photo and the name link there.
  href: string;
  // Under the price: the colour and the size (board 2), the placer's controls.
  controls?: ReactNode;
  // On the right: «В корзину» and «Убрать», or the phone's ×.
  aside?: ReactNode;
  // A click on the photo or the name: the drawer closes, even for a link to the page it is on.
  onNavigate?: () => void;
}

// Board 13's OutfitSlot, filled: the item's photo, the slot, the name and the price, then the
// placer's controls (spec 0019 A62, A63.3). The catalog's photo and name, not the user's.
export function OutfitSlotRow({ item, href, controls, aside, onNavigate }: OutfitSlotRowProps) {
  const { product } = item;
  const discounted = product.discount > 0;
  return (
    <div className={styles.slot}>
      <NextLink
        href={href}
        prefetch={false}
        className={styles.photo}
        tabIndex={-1}
        aria-hidden
        onClick={onNavigate}
      >
        {product.image && (
          // `unoptimized`: the catalog's `/media/` skips Next's optimizer.
          <Image src={product.image.url} alt="" fill sizes="72px" unoptimized />
        )}
      </NextLink>
      <div className={styles.body}>
        <span className={styles.kind}>{SLOT_TITLES[item.slot]}</span>
        <NextLink href={href} prefetch={false} className={styles.name} onClick={onNavigate}>
          {roomItemName(product)}
        </NextLink>
        <Price
          price={product.finalPrice}
          oldPrices={discounted ? [product.price] : undefined}
          variant="catalog"
        />
        {controls && <div className={styles.controls}>{controls}</div>}
      </div>
      {aside && <div className={styles.aside}>{aside}</div>}
    </div>
  );
}

export interface EmptySlotRowProps {
  slot: Slot;
  // «Подобрать в каталоге»: the slot's first category; none for the accessory (A90.8).
  href?: string;
  linkEvents?: Pick<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    'onClick' | 'onPointerEnter' | 'onPointerLeave'
  >;
}

// An empty slot of board 2: the dashed «+» box, the slot, its caption and the catalog's link.
export function EmptySlotRow({ slot, href, linkEvents }: EmptySlotRowProps) {
  return (
    <div className={styles.slot}>
      <span className={styles.placeholder} aria-hidden>
        +
      </span>
      <div className={styles.body}>
        <span className={styles.kind}>{SLOT_TITLES[slot]}</span>
        <span className={styles.caption}>{emptySlotCaption(slot)}</span>
        {href && (
          <Link href={href} prefetch={false} className={styles.fill} {...linkEvents}>
            Подобрать в каталоге
          </Link>
        )}
      </div>
    </div>
  );
}

// A slot while the room loads (board 2.4): the photo's box and three lines.
export function SlotRowSkeleton() {
  return (
    <div className={styles.slot} aria-hidden>
      <span className={styles.photo}>
        <Skeleton height="100%" />
      </span>
      <div className={styles.body}>
        <Skeleton width="40%" height={12} />
        <Skeleton width="70%" height={14} />
        <Skeleton width="30%" height={14} />
      </div>
    </div>
  );
}
