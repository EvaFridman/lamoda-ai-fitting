import Image from 'next/image';
import type { ReactNode } from 'react';

import { Price } from '@/shared/ui';

import styles from './item-row.module.scss';

export interface ItemRowProps {
  name: string;
  imageUrl: string | null;
  // «белый», «белый · 42/44»: under the name.
  details?: string | null;
  price: number;
  finalPrice: number;
  // The buttons on the right (the cart's and the heart's stubs).
  action?: ReactNode;
}

// The item a try-on is about: its picture (60×80, 40×54 on a phone), name, colour and price
// (boards 3, 6, 7; the result's as the look's card, spec 0024 Z40).
export function ItemRow({ name, imageUrl, details, price, finalPrice, action }: ItemRowProps) {
  return (
    <div className={styles.row}>
      <span className={styles.image}>
        {imageUrl && <Image src={imageUrl} alt="" fill sizes="60px" unoptimized />}
      </span>
      <span className={styles.text}>
        <span className={styles.name}>{name}</span>
        {details && <span className={styles.details}>{details}</span>}
        <Price
          price={finalPrice}
          oldPrices={finalPrice < price ? [price] : undefined}
          variant="catalog"
        />
      </span>
      {action}
    </div>
  );
}
