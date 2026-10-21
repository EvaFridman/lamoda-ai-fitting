import type { Ref } from 'react';

import { productCount } from '../lib/product-count';

import styles from './catalog-page.module.scss';

export interface CatalogHeadingProps {
  // The category's name, or "Каталог".
  title: string;
  // The filter counts' total (O49); none until they load.
  total?: number;
  ref?: Ref<HTMLHeadingElement>;
}

// The page's one `<h1>` with the number of products after it, small and grey ("Платья 128
// товаров", O5). The server shows it without the count while the products load. `tabIndex={-1}`:
// the focus comes here after "Очистить фильтры" (plan §3.4, O91).
export function CatalogHeading({ title, total, ref }: CatalogHeadingProps) {
  return (
    <h1 ref={ref} className={styles.heading} tabIndex={-1}>
      {title}
      {total === undefined ? null : (
        <>
          {' '}
          <span className={styles.count}>{productCount(total)}</span>
        </>
      )}
    </h1>
  );
}
