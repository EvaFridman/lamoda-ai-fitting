'use client';

import Image from 'next/image';
import NextLink from 'next/link';

import type { FittingItem } from '@/entities/fitting';
import { MiniSwatches } from '@/entities/fitting-room';
import { productColours, useProduct } from '@/entities/product';
import { CartStubButton, FavoriteStub } from '@/features/product-stubs';
import { Price } from '@/shared/ui';

import styles from './look-result.module.scss';

export interface LookItemRowProps {
  item: FittingItem;
  // Off while the look regenerates (board 8.2).
  disabled: boolean;
  // Another colour of this item: the whole look again on the same photo (AC15).
  onColour: (attributeValueId: string) => void;
}

// Board 8's LookItemRow: the catalog picture and the name (to the product), the price, the
// product's colours as `MiniSwatches` (A91; «один цвет» for one), «В корзину» and the favourite's
// stub (A33). The colours come from the product's page read, cached by the other rows' pages.
export function LookItemRow({ item, disabled, onColour }: LookItemRowProps) {
  const product = useProduct(item.productId);
  const colours = productColours(product.data);
  const href = `/products/${encodeURIComponent(item.productId)}`;
  return (
    <div className={styles.row}>
      <NextLink href={href} prefetch={false} className={styles.rowImage} tabIndex={-1} aria-hidden>
        {item.imageUrl && <Image src={item.imageUrl} alt="" fill sizes="60px" unoptimized />}
      </NextLink>
      <div className={styles.rowText}>
        <NextLink href={href} prefetch={false} className={styles.rowName}>
          {item.name}
        </NextLink>
        <Price
          price={item.finalPrice}
          oldPrices={item.finalPrice < item.price ? [item.price] : undefined}
          variant="catalog"
        />
        {colours.length > 1 ? (
          <MiniSwatches
            label={`Цвет: ${item.name}`}
            colours={colours}
            value={item.attributeValueId}
            disabled={disabled}
            onValueChange={(id) => {
              if (id !== item.attributeValueId) onColour(id);
            }}
          />
        ) : (
          colours.length === 1 && <span className={styles.muted}>один цвет</span>
        )}
      </div>
      <CartStubButton size={32} textSize="body-s" className={styles.rowCart}>
        В корзину
      </CartStubButton>
      <FavoriteStub size={32} />
    </div>
  );
}
