'use client';

import { CartStubButton, FavoriteStub } from '@/features/product-stubs';
import { useTrackedElement } from '@/shared/analytics';

import styles from './picker-item-actions.module.scss';

// An item card's buttons on the photo picker (spec 0023 P4, Y3): «В корзину» and the heart, both
// stubs of spec 0019 A33; the heart is `try-on.favourite` of a single item or a look's.
export function PickerItemActions({ kind }: { kind: 'single' | 'look' }) {
  const favourite = useTrackedElement('try-on.favourite', { kind });
  return (
    <span className={styles.actions}>
      <CartStubButton variant="outline" size={32} textSize="body-s">
        В корзину
      </CartStubButton>
      <FavoriteStub size={32} events={favourite} />
    </span>
  );
}
