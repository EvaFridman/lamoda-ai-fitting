import Image from 'next/image';

import type { FittingItem } from '@/entities/fitting';

import styles from './wait-items.module.scss';

export interface WaitItemsProps {
  items: Pick<FittingItem, 'productId' | 'imageUrl' | 'name' | 'colour'>[];
}

// The wait's items (spec 0024 Z7): every item's catalog picture at 72×96 in one row with 8 px gaps
// (scrolling sideways on a narrow phone), a single item's name and colour beside it, on every
// width. The pictures are the catalog's; their text alternative is empty, since a single item is
// named beside it and a look's items are named on the result.
export function WaitItems({ items }: WaitItemsProps) {
  const single = items.length === 1 ? items[0] : undefined;
  return (
    <div className={styles.items}>
      <ul className={styles.row}>
        {/* A look's items are distinct products (one per slot). */}
        {items.map((item) => (
          <li key={item.productId} className={styles.thumb}>
            {item.imageUrl && (
              // `unoptimized`: the catalog's `/media/` skips Next's optimizer.
              <Image src={item.imageUrl} alt="" fill sizes="72px" unoptimized />
            )}
          </li>
        ))}
      </ul>
      {single && (
        <span className={styles.text}>
          <span className={styles.name}>{single.name}</span>
          {single.colour && <span className={styles.colour}>{single.colour}</span>}
        </span>
      )}
    </div>
  );
}
