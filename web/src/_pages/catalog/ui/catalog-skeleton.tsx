import { Skeleton } from '@/shared/ui';
import { ProductGridSkeleton } from '@/widgets/product-grid';

import { CatalogBackSlot } from './catalog-back-slot';
import { CatalogHeading } from './catalog-heading';

import styles from './catalog-page.module.scss';

// Chips of the desktop row: the sort, then a few filters; each width once (the chips' keys).
const CHIP_WIDTHS = [148, 88, 96, 84, 92, 160];
const CATEGORY_ROWS = 8;

export interface CatalogSkeletonProps {
  // The page's title once known: the heading shows it, and the breadcrumbs are already above.
  // Without it (the category is not read yet) the breadcrumbs and the title are lines too.
  title?: string;
}

// The page while it loads (spec 0020 plan §1, W2): its shape in its own classes, so the page that
// replaces it starts where it does, and at least a window high, so the footer stays out of sight.
// No state and no script: it is part of the prerendered shells (AC17).
export function CatalogSkeleton({ title }: CatalogSkeletonProps) {
  return (
    <div className={styles.skeleton}>
      <p className={styles.status} role="status">
        Загружаем товары
      </p>
      {title === undefined ? (
        <>
          <div className={styles.inset}>
            <Skeleton width={160} height={16} />
          </div>
          <div className={styles.headingRow}>
            <CatalogBackSlot />
            <div className={styles.heading}>
              <Skeleton width={200} height={28} />
            </div>
          </div>
        </>
      ) : (
        <CatalogHeading title={title} countPending back={false} />
      )}
      {/* Busy itself (D7af); the status stays outside, so it is read at once. */}
      <div className={styles.layout} aria-busy>
        <div className={styles.aside}>
          <div className={styles.skeletonCategories}>
            {Array.from({ length: CATEGORY_ROWS }, (_, index) => (
              <Skeleton key={index} width="70%" height={24} />
            ))}
          </div>
        </div>
        <div className={styles.column}>
          <div className={styles.skeletonChips}>
            {CHIP_WIDTHS.map((width) => (
              <Skeleton key={width} width={width} height={36} radius="var(--radius-s)" />
            ))}
          </div>
          <div className={styles.skeletonFiltersButton}>
            <Skeleton width={112} height={48} radius="var(--radius-s)" />
          </div>
          <ProductGridSkeleton />
        </div>
      </div>
    </div>
  );
}
