import { Button } from '@/shared/ui';

import styles from './catalog-page.module.scss';

export interface CatalogEmptyProps {
  // Given while a filter or the search is applied: the button clears them, as the row's link does.
  onClear?: () => void;
}

// A selection with no products (AC10, O83).
export function CatalogEmpty({ onClear }: CatalogEmptyProps) {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>Ничего не нашлось</p>
      {onClear === undefined ? null : (
        <>
          <p className={styles.emptyText}>Попробуйте изменить или сбросить фильтры</p>
          <Button variant="secondary" onClick={onClear}>
            Очистить фильтры
          </Button>
        </>
      )}
    </div>
  );
}
