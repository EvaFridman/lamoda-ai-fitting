import { CatalogProductCardSkeleton } from '@/entities/product';

import styles from './product-grid.module.scss';

// The widest grid's columns (`columnsFor`).
const MAX_COLUMNS = 4;

export interface ProductGridSkeletonProps {
  // Rows of placeholders, whatever the columns; 3 by default.
  rows?: number;
}

// The grid while its first batch loads (spec 0020 plan §1, W2): the grid's own container and
// columns, filled with card placeholders (0009 K11), so the grid that replaces it starts at the
// same place. The widest grid's cards are drawn; the stylesheet hides those of the extra rows at 2
// and 3 columns. Screen readers skip it: the block that holds it marks itself `aria-busy` (D7af).
export function ProductGridSkeleton({ rows = 3 }: ProductGridSkeletonProps) {
  return (
    <div className={styles.grid} aria-hidden>
      <ul className={styles.list}>
        {Array.from({ length: rows * MAX_COLUMNS }, (_, index) => (
          <li key={index} className={visibleFrom(index, rows)}>
            <CatalogProductCardSkeleton />
          </li>
        ))}
      </ul>
    </div>
  );
}

// A card past the rows at 2 columns shows only from 3, past them at 3 only from 4.
function visibleFrom(index: number, rows: number): string | undefined {
  if (index >= rows * 3) return styles.fromFour;
  if (index >= rows * 2) return styles.fromThree;
  return undefined;
}
