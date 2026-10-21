import Image from 'next/image';
import NextLink from 'next/link';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

import { Badges, Price, Rating, Skeleton } from '@/shared/ui';

import type { ProductListItem } from '../model/schemas';

import styles from './catalog-product-card.module.scss';

export interface CatalogProductCardProps {
  product: ProductListItem;
  // Where the card leads. No product page exists yet, so whoever places the card gives the
  // address (0009 K15; backlog "Product card link").
  href: string;
  // Next's prefetch of `href` (its default when left out); off while the address has no page.
  prefetch?: boolean;
  // The link's own click and pointer handlers (the page's analytics); not the action's.
  linkEvents?: Pick<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    'onClick' | 'onPointerEnter' | 'onPointerLeave'
  >;
  // One action in the photo's upper right corner (favourites, try-on), filled by a feature.
  action?: ReactNode;
  className?: string;
}

// Lamoda's catalog card: the photo 236:341 with the "−N%" badge, then the price, the brand, the
// name in two lines and the rating. The link covers the photo and the text; the action is its
// sibling, not inside it, so a click on the action does not follow the link (AC5).
export function CatalogProductCard({
  product,
  href,
  prefetch,
  linkEvents,
  action,
  className,
}: CatalogProductCardProps) {
  const discounted = product.discount > 0;

  return (
    <article className={[styles.card, className].filter(Boolean).join(' ')}>
      <NextLink {...linkEvents} href={href} prefetch={prefetch} className={styles.link}>
        <div className={styles.photo}>
          {product.image === null ? (
            // Visual only, like the photo's empty alt: the link's name starts with the product.
            <span aria-hidden className={styles.noPhoto}>
              Нет фото
            </span>
          ) : (
            // The brand and name below name the link; the photo repeats them, so its alt is empty.
            // The api's files are already webp and their URLs absolute: no optimizer.
            <Image
              src={product.image.url}
              alt=""
              fill
              sizes="(max-width: 600px) 50vw, 236px"
              unoptimized
              className={styles.image}
            />
          )}
          {discounted ? (
            <Badges
              badges={[{ tone: 'discount', label: `−${product.discount}%` }]}
              className={styles.badge}
            />
          ) : null}
        </div>
        <div className={styles.description}>
          <Price
            price={product.finalPrice}
            oldPrices={discounted ? [product.price] : undefined}
            variant="catalog"
          />
          <span className={styles.brand}>{product.brand.name}</span>
          <span className={styles.name}>{product.name}</span>
          <span className={styles.ratingRow}>
            <Rating value={product.rating} />
          </span>
        </div>
      </NextLink>
      {action === undefined ||
      action === null ||
      typeof action === 'boolean' ||
      action === '' ? null : (
        <div className={styles.action}>{action}</div>
      )}
    </article>
  );
}

export interface CatalogProductCardSkeletonProps {
  className?: string;
}

// The card while it loads: the same box, a grey photo and three text lines (the price, the brand,
// the name) in the card's rows, so nothing moves when the card replaces it (K11). Screen readers
// skip the grey boxes; the block marks itself busy (0003 D7af).
export function CatalogProductCardSkeleton({ className }: CatalogProductCardSkeletonProps) {
  return (
    <div aria-busy="true" className={[styles.card, className].filter(Boolean).join(' ')}>
      <div className={styles.photo}>
        <Skeleton height="100%" />
      </div>
      <div className={styles.description}>
        <Skeleton width="40%" height={20} />
        <Skeleton width="60%" height={16} />
        <span className={styles.name}>
          <Skeleton width="80%" height={16} />
        </span>
        <span className={styles.ratingRow} />
      </div>
    </div>
  );
}
