import type { Ref } from 'react';

import { Skeleton } from '@/shared/ui';

import { productCount } from '../lib/product-count';
import { CatalogBack } from './catalog-back';
import { CatalogBackSlot } from './catalog-back-slot';

import styles from './catalog-page.module.scss';

export interface CatalogHeadingProps {
  // The category's name, or "Каталог".
  title: string;
  // The filter counts' total (O49); none until they load.
  total?: number;
  // A placeholder of the count's size while there is no total: the page's placeholders (0020 W2)
  // and the page while its counts load (W14).
  countPending?: boolean;
  // `false` keeps only the arrow's slot: the page's placeholders hold nothing to use (plan §1).
  // The arrow reads the path, so only a page rendered per request shows it (`CatalogBrowser`),
  // never a prerendered shell.
  back?: boolean;
  ref?: Ref<HTMLHeadingElement>;
}

// A row: the "←" below a 600px window (spec 0020 W4), then the page's one `<h1>` with the number of
// products after it, small and grey ("Платья 128 товаров", O5); below 600px the number is a line of
// its own under the title. `tabIndex={-1}`: the focus comes here after "Очистить фильтры" (plan
// §3.4, O91).
export function CatalogHeading({
  title,
  total,
  countPending = false,
  back = true,
  ref,
}: CatalogHeadingProps) {
  let count = null;
  if (total !== undefined) count = <span className={styles.count}>{productCount(total)}</span>;
  else if (countPending) {
    count = <Skeleton width={88} height={16} className={styles.countSkeleton} />;
  }
  return (
    <div className={styles.headingRow}>
      {back ? <CatalogBack /> : <CatalogBackSlot />}
      <h1 ref={ref} className={styles.heading} tabIndex={-1}>
        {title}
        {count === null ? null : <> {count}</>}
      </h1>
    </div>
  );
}
