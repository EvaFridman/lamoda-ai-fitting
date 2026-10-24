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
  // A button on the right (the cart's stub).
  action?: ReactNode;
  // 60×80 on the picker, 72×96 on the result (board 3, board 7).
  size?: 'm' | 'l';
}

// The item a try-on is about: its picture, name, colour and price (boards 3, 6, 7).
export function ItemRow({
  name,
  imageUrl,
  details,
  price,
  finalPrice,
  action,
  size = 'm',
}: ItemRowProps) {
  return (
    <div className={styles.row}>
      <span className={[styles.image, size === 'l' && styles.large].filter(Boolean).join(' ')}>
        {imageUrl && <Image src={imageUrl} alt="" fill sizes="72px" unoptimized />}
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
