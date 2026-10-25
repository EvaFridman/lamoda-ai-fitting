import { Skeleton } from '@/shared/ui';

import styles from './product-page.module.scss';

// The page while the product loads: the breadcrumbs' line, then the gallery's and the buy box's
// places (board 1), in the page's own classes so the page that replaces it starts where it does.
// No state and no script: it is part of the prerendered shell.
export function ProductSkeleton() {
  return (
    <div className={styles.skeleton}>
      <p className={styles.status} role="status">
        Загружаем товар
      </p>
      <div className={styles.crumbs}>
        <Skeleton width={200} height={16} />
      </div>
      <div className={styles.main}>
        <div className={[styles.gallery, styles.gallerySkeleton].join(' ')}>
          <Skeleton height="100%" />
        </div>
        {/* On a phone the buy box's panel over the photo, as the page's (A88). */}
        <div className={styles.purchase}>
          <div className={styles.buyBox}>
            <Skeleton width={120} height={16} />
            <Skeleton width={160} height={28} />
            <Skeleton width={240} height={20} />
            <Skeleton width={140} height={28} />
          </div>
        </div>
      </div>
    </div>
  );
}
