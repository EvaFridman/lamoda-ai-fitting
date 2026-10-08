import { formatPrice } from '@/shared/lib';

import styles from './price.module.scss';

export type PriceVariant = 'catalog' | 'product';

export interface PriceProps {
  // The price to pay, in rubles.
  price: number;
  // Struck-out prices before it, the oldest first: the price before any discount and, as Lamoda
  // shows it, the one before the club discount. With any, the price turns red.
  oldPrices?: readonly [number] | readonly [number, number];
  // `catalog`: the old prices 13px, the price 16px bold. `product`: all 16px regular.
  variant?: PriceVariant;
  className?: string;
}

// A product's price as Lamoda shows it: "4 500 ₽" alone, or "13 999 9 799 7 746 ₽" with the old
// prices struck out, without "₽", and the price in red. A screen reader does not announce the
// strike, so hidden words name each price: "Старая цена 13 999 ₽, … цена 7 746 ₽" (D7r).
export function Price({ price, oldPrices, variant = 'catalog', className }: PriceProps) {
  const [first, second] = oldPrices ?? [];
  const discounted = first !== undefined;

  return (
    <span
      className={[styles.price, styles[variant], className].filter(Boolean).join(' ')}
      data-discounted={discounted || undefined}
    >
      {first === undefined ? null : <OldPrice value={first} />}
      {second === undefined ? null : <OldPrice value={second} />}
      <span className={styles.current}>
        {discounted ? <span className={styles.hidden}>цена </span> : null}
        {formatPrice(price)}
      </span>
    </span>
  );
}

function OldPrice({ value }: { value: number }) {
  return (
    <s className={styles.old}>
      <span className={styles.hidden}>Старая цена </span>
      {formatPrice(value, { currency: false })}
      <span className={styles.hidden}> ₽, </span>
    </s>
  );
}
