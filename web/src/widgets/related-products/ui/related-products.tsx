'use client';

import { Suspense, useEffect, useId, useMemo, useState } from 'react';

import { categorySlots, type OutfitSlot, useActiveCategories } from '@/entities/category';
import {
  CatalogProductCard,
  CatalogProductCardSkeleton,
  type ProductListItem,
  useRelatedProducts,
} from '@/entities/product';
import { LoginModal } from '@/features/auth';
import { RoomLookToggle } from '@/features/fitting-room';
import { CartStubButton, FavoriteStub } from '@/features/product-stubs';
import { useTrackedElement } from '@/shared/analytics';
import { errorText, reportFailure } from '@/shared/api';
import { ScrollRow } from '@/shared/ui';

import styles from './related-products.module.scss';

export interface RelatedProductsProps {
  productId: string;
  className?: string;
}

// As many as the api answers (A36: six).
const SKELETONS = 6;

interface RelatedItemProps {
  product: ProductListItem;
  // From 1, in the block.
  position: number;
  // The product's slot of the fitting room (A36: the api answers only products with one), unknown
  // while the categories load: no hanger then.
  slot: OutfitSlot | undefined;
  onSignIn: () => void;
}

// A card of the block: its link is tracked by position, never by product, its «В корзину» and its
// hanger as one element each for every card (A84, A90.9). The heart sends nothing (A83.10).
function RelatedItem({ product, position, slot, onSignIn }: RelatedItemProps) {
  const cardEvents = useTrackedElement('related.card', { position });
  const cartEvents = useTrackedElement('related.add-to-cart');
  return (
    <li>
      <CatalogProductCard
        product={product}
        variant="compact"
        href={`/products/${encodeURIComponent(product.id)}`}
        // Off as the grid's: a card's prefetch reads the api on the visitor's quota (A82.1).
        prefetch={false}
        linkEvents={cardEvents}
        lookToggle={
          slot ? (
            <RoomLookToggle
              product={product}
              slot={slot}
              element="related.to-look"
              onSignIn={onSignIn}
            />
          ) : null
        }
        favorite={<FavoriteStub size={32} />}
        footer={
          <CartStubButton size={32} textSize="body-s" events={cartEvents}>
            В корзину
          </CartStubButton>
        }
      />
    </li>
  );
}

// Board 1's «С этим товаром выбирают» (spec 0019 A36, A83): the compact cards with the hanger
// (which puts the product into the fitting room, A90.1), the heart and «В корзину» stubs (A33), in one row that
// scrolls sideways on every width with «‹» «›» from 600px (A87.3). The page prefetches the list;
// the browser asks only when that failed. None hides the block (A83.8).
export function RelatedProducts({ productId, className }: RelatedProductsProps) {
  const related = useRelatedProducts(productId);
  const { error } = related;
  const headingId = useId();
  // The arrows, not a swipe (A87.8).
  const prevEvents = useTrackedElement('related.scroll', { direction: 'prev' });
  const nextEvents = useTrackedElement('related.scroll', { direction: 'next' });
  const categories = useActiveCategories();
  const slots = useMemo(() => categorySlots(categories.data?.items), [categories.data]);
  // One sign-in window for every hanger of a visitor (A12, AC16).
  const [signIn, setSignIn] = useState(false);

  useEffect(() => {
    if (error !== null) reportFailure(error);
  }, [error]);

  if (related.data !== undefined && related.data.length === 0) return null;

  let content;
  if (related.data !== undefined) {
    content = (
      <ScrollRow className={styles.row} events={{ prev: prevEvents, next: nextEvents }}>
        {related.data.map((product, index) => (
          <RelatedItem
            key={product.id}
            product={product}
            position={index + 1}
            slot={slots.get(product.category.id)}
            onSignIn={() => setSignIn(true)}
          />
        ))}
      </ScrollRow>
    );
  } else if (error !== null) {
    content = (
      <p role="alert" className={styles.alert}>
        {errorText(error)}
      </p>
    );
  } else {
    // The row's own sizes, with no arrows: the cards in view and a part of the next.
    content = (
      <div aria-hidden className={styles.row}>
        <ul className={styles.skeletons}>
          {Array.from({ length: SKELETONS }, (_, index) => (
            <li key={index}>
              <CatalogProductCardSkeleton variant="compact" />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <section
      aria-labelledby={headingId}
      className={[styles.related, className].filter(Boolean).join(' ')}
    >
      <h2 id={headingId} className={styles.heading}>
        С этим товаром выбирают
      </h2>
      {content}
      {/* It reads the query (`useSearchParams`). */}
      <Suspense fallback={null}>
        <LoginModal open={signIn} onOpenChange={setSignIn} handlesReturnedError={false} />
      </Suspense>
    </section>
  );
}
