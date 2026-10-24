import Image from 'next/image';

import type { FittingItem } from '../model/schemas';

import styles from './items-strip.module.scss';

// Board 9 shows three items, then «+N».
export const STRIP_MAX = 3;

export interface ItemsStripProps {
  items: Pick<FittingItem, 'productId' | 'imageUrl'>[];
  className?: string;
}

// Board 13's ItemsStrip, at the history card's size: the items' catalog pictures, at most three,
// then «+N» for the rest. The pictures are the catalog's, not the user's; their text alternative is
// empty, since the card names the items beside them.
export function ItemsStrip({ items, className }: ItemsStripProps) {
  const shown = items.slice(0, STRIP_MAX);
  const rest = items.length - shown.length;
  return (
    <ul className={[styles.strip, className].filter(Boolean).join(' ')}>
      {/* A look's items are distinct products (one per slot). */}
      {shown.map((item) => (
        <li key={item.productId} className={styles.thumb}>
          {item.imageUrl && (
            // `unoptimized`: the catalog's `/media/` skips Next's optimizer.
            <Image src={item.imageUrl} alt="" width={28} height={38} unoptimized />
          )}
        </li>
      ))}
      {rest > 0 && (
        <li className={styles.more} aria-label={`ещё ${rest}`}>
          +{rest}
        </li>
      )}
    </ul>
  );
}
