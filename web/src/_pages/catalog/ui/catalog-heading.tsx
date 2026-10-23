import type { Ref } from 'react';

import { Skeleton } from '@/shared/ui';

import { productCount } from '../lib/product-count';

import styles from './catalog-page.module.scss';

export interface CatalogHeadingProps {
  // The category's name, or "Каталог".
  title: string;
  // The filter counts' total (O49); none until they load.
  total?: number;
  // A placeholder of the count's size while there is no total (the page's placeholders, 0020 W2).
  countPending?: boolean;
  ref?: Ref<HTMLHeadingElement>;
}

// The page's one `<h1>` with the number of products after it, small and grey ("Платья 128
// товаров", O5). The page's placeholders show a placeholder of the count (`countPending`, 0020 W2)
// while the products load. `tabIndex={-1}`:
// the focus comes here after "Очистить фильтры" (plan §3.4, O91).
export function CatalogHeading({ title, total, countPending = false, ref }: CatalogHeadingProps) {
  let count = null;
  if (total !== undefined) count = <span className={styles.count}>{productCount(total)}</span>;
  else if (countPending) {
    count = <Skeleton width={88} height={16} className={styles.countSkeleton} />;
  }
  return (
    <h1 ref={ref} className={styles.heading} tabIndex={-1}>
      {title}
      {count === null ? null : <> {count}</>}
    </h1>
  );
}
