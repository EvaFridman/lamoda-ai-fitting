'use client';

import Image from 'next/image';
import NextLink from 'next/link';
import type { ButtonHTMLAttributes } from 'react';

import type { FittingItem } from '@/entities/fitting';
import { MiniSwatches } from '@/entities/fitting-room';
import { productColours, useProduct } from '@/entities/product';
import { CartStubButton, FavoriteStub } from '@/features/product-stubs';
import { useTrackedElement } from '@/shared/analytics';
import { BagIcon, LinkButton, Price } from '@/shared/ui';

import styles from './look-result.module.scss';

export interface LookItemRowProps {
  item: FittingItem;
  // Off while the look regenerates (board 8.2).
  disabled: boolean;
  // Another colour of this item: the whole look again on the same photo (AC15).
  onColour: (attributeValueId: string) => void;
  // «Заменить»: the window closes and the room opens at this item's slot (spec 0024 Z8).
  onReplace: () => void;
  // The hovers of «Заменить» (the result's `room.open`).
  replaceEvents?: Pick<
    ButtonHTMLAttributes<HTMLButtonElement>,
    'onPointerEnter' | 'onPointerLeave'
  >;
}

// Board 8's LookItemRow: the catalog picture and the name (to the product), the price, the
// product's colours as `MiniSwatches` (A91; nothing for one colour, spec 0024 AC12), and at the
// card's top «В корзину», the favourite's stub (A33) and «Заменить» (Z8); on a narrow card
// «В корзину» is the bag icon beside the heart and «Заменить» goes under the text (Z37). The
// colours come from the product's page read, which the result's colour line reads too.
export function LookItemRow({
  item,
  disabled,
  onColour,
  onReplace,
  replaceEvents,
}: LookItemRowProps) {
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
        {colours.length > 1 && (
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
        )}
      </div>
      <span className={styles.rowActions}>
        <CartStubButton size={32} textSize="body-s" className={styles.rowCart} events={cartElement}>
          <BagIcon size={16} className={styles.rowCartIcon} />
          <span className={styles.rowCartLabel}>В корзину</span>
        </CartStubButton>
        <FavoriteStub size={32} />
      </span>
      <LinkButton
        {...replaceEvents}
        className={styles.rowReplace}
        aria-label={`Заменить: ${item.name}`}
        onClick={onReplace}
      >
        Заменить
      </LinkButton>
    </div>
  );
}
