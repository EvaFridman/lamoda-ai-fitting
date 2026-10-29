'use client';

import Image from 'next/image';
import NextLink from 'next/link';

import type { FittingItem } from '@/entities/fitting';
import { MiniSwatches } from '@/entities/fitting-room';
import { productColours, useProduct } from '@/entities/product';
import { CartStubButton, FavoriteStub } from '@/features/product-stubs';
import { useTrackedElement } from '@/shared/analytics';
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
  // An item with no slot sends no colour (A94.2): the hook runs, its handlers are not used.
  const colourElement = useTrackedElement('result.item-colour', { slot: item.slot ?? 'top' });
  const cartElement = useTrackedElement('result.add-to-cart', { kind: 'look' });
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
            events={item.slot === null ? undefined : colourElement}
            onValueChange={(id) => {
              if (id === item.attributeValueId) return;
              if (item.slot !== null) colourElement.onClick();
              onColour(id);
            }}
          />
        ) : (
          colours.length === 1 && <span className={styles.muted}>один цвет</span>
        )}
      </div>
      <span className={styles.rowActions}>
        <CartStubButton size={32} textSize="body-s" events={cartElement}>
          В корзину
        </CartStubButton>
        <FavoriteStub size={32} />
      </span>
    </div>
  );
}
