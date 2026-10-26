import Image from 'next/image';
import NextLink from 'next/link';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

import { Badges, Price, Rating, Skeleton } from '@/shared/ui';

import type { ProductListItem } from '../model/schemas';

import styles from './catalog-product-card.module.scss';

// `catalog`: the grid's card. `compact`: «С этим товаром выбирают» on board 1, a photo of fixed
// height and no rating (A83.4).
export type CatalogProductCardVariant = 'catalog' | 'compact';

// An empty slot renders nothing (a feature may answer `null` or `false`).
function filled(node: ReactNode): boolean {
  return !(node === undefined || node === null || typeof node === 'boolean' || node === '');
}

export interface CatalogProductCardProps {
  product: ProductListItem;
  variant?: CatalogProductCardVariant;
  // Where the card leads; whoever places the card gives the address (0009 K15, 0019 A40).
  href: string;
  // Next's prefetch of `href` (its default when left out); the grid turns it off (backlog
  // "Catalog card prefetch").
  prefetch?: boolean;
  // The link's own click and pointer handlers (the page's analytics); not the action's.
  linkEvents?: Pick<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    'onClick' | 'onPointerEnter' | 'onPointerLeave'
  >;
  // The photo's two corners (A63.1), filled by the placer: the hanger top left, the heart top right.
  lookToggle?: ReactNode;
  favorite?: ReactNode;
  // Under the text, outside the link: «В корзину» of the related cards.
  footer?: ReactNode;
  className?: string;
}

// Lamoda's catalog card: the photo 236:341 with the "−N%" badge, then the price, the brand, the
// name in two lines and the rating. The link covers the photo and the text; the corners and the
// footer are its siblings, not inside it, so a click on them does not follow the link (AC5). With a
// mouse its photo grows inside its frame, with no shadow (spec 0023 C7).
export function CatalogProductCard({
  product,
  variant = 'catalog',
  href,
  prefetch,
  linkEvents,
  lookToggle,
  favorite,
  footer,
  className,
}: CatalogProductCardProps) {
  const discounted = product.discount > 0;
  const compact = variant === 'compact';

  return (
    <article
      className={[styles.card, compact && styles.compact, className].filter(Boolean).join(' ')}
    >
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
              sizes={
                compact
                  ? '(max-width: 600px) 50vw, (max-width: 1023px) 33vw, 180px'
                  : '(max-width: 600px) 50vw, 236px'
              }
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
          {compact ? null : (
            <span className={styles.ratingRow}>
              <Rating value={product.rating} />
            </span>
          )}
        </div>
      </NextLink>
      {filled(lookToggle) && <div className={styles.lookToggle}>{lookToggle}</div>}
      {filled(favorite) && <div className={styles.favorite}>{favorite}</div>}
      {filled(footer) && <div className={styles.footer}>{footer}</div>}
    </article>
  );
}

export interface CatalogProductCardSkeletonProps {
  variant?: CatalogProductCardVariant;
  className?: string;
}

// The card while it loads: the same box, a grey photo and three text lines (the price, the brand,
// the name) in the card's rows, so nothing moves when the card replaces it (K11). Screen readers
// skip the grey boxes; the block marks itself busy (0003 D7af).
export function CatalogProductCardSkeleton({
  variant = 'catalog',
  className,
}: CatalogProductCardSkeletonProps) {
  const compact = variant === 'compact';
  return (
    <div
      aria-busy="true"
      className={[styles.skeleton, compact && styles.compact, className].filter(Boolean).join(' ')}
    >
      <div className={styles.photo}>
        <Skeleton height="100%" />
      </div>
      <div className={styles.description}>
        <Skeleton width="40%" height={20} />
        <Skeleton width="60%" height={16} />
        <span className={styles.name}>
          <Skeleton width="80%" height={16} />
        </span>
        {compact ? null : <span className={styles.ratingRow} />}
      </div>
    </div>
  );
}
