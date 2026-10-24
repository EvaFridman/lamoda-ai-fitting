'use client';

import { useEffect, useId } from 'react';

import {
  CatalogProductCard,
  CatalogProductCardSkeleton,
  LookToggle,
  type ProductListItem,
  useRelatedProducts,
} from '@/entities/product';
import { CartStubButton, FavoriteStub } from '@/features/product-stubs';
import { useTrackedElement } from '@/shared/analytics';
import { errorText, reportFailure } from '@/shared/api';

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
}

// A card of the block: its link is tracked by position, never by product, and its «В корзину» as
// one element for every card (A84). The hanger and the heart send nothing (A83.6, A83.10).
function RelatedItem({ product, position }: RelatedItemProps) {
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
        lookToggle={<LookToggle disabled />}
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
// (disabled until the fitting room, T26), the heart and «В корзину» stubs (A33). The page prefetches
// the list; the browser asks only when that failed. None hides the block (A83.8).
export function RelatedProducts({ productId, className }: RelatedProductsProps) {
  const related = useRelatedProducts(productId);
  const { error } = related;
  const headingId = useId();

  useEffect(() => {
    if (error !== null) reportFailure(error);
  }, [error]);

  if (related.data !== undefined && related.data.length === 0) return null;

  let content;
  if (related.data !== undefined) {
    content = (
      <ul className={styles.list}>
        {related.data.map((product, index) => (
          <RelatedItem key={product.id} product={product} position={index + 1} />
        ))}
      </ul>
    );
  } else if (error !== null) {
    content = (
      <p role="alert" className={styles.alert}>
        {errorText(error)}
      </p>
    );
  } else {
    content = (
      <ul aria-hidden className={styles.list}>
        {Array.from({ length: SKELETONS }, (_, index) => (
          <li key={index}>
            <CatalogProductCardSkeleton variant="compact" />
          </li>
        ))}
      </ul>
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
    </section>
  );
}
