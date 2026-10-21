import { plural } from '@/shared/lib';

import styles from './catalog-page.module.scss';

const productForms = ['товар', 'товара', 'товаров'] as const;

export interface CatalogHeadingProps {
  // The category's name, or "Каталог".
  title: string;
  // The filter counts' total (O49); none until they load.
  total?: number;
}

// The page's one `<h1>` with the number of products after it, small and grey ("Платья 128
// товаров", O5). The server shows it without the count while the products load. `tabIndex={-1}`:
// the focus comes here after "Очистить фильтры" (T18).
export function CatalogHeading({ title, total }: CatalogHeadingProps) {
  return (
    <h1 className={styles.heading} tabIndex={-1}>
      {title}
      {total === undefined ? null : (
        <>
          {' '}
          <span className={styles.count}>
            {total} {plural(total, productForms)}
          </span>
        </>
      )}
    </h1>
  );
}
