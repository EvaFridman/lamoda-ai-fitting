import NextLink from 'next/link';
import type { AnchorHTMLAttributes } from 'react';

import styles from './catalog-category-list.module.scss';

// A category with its number of products. A type of its own, so the slice does not import
// `product` (FSD); the page passes the facets' categories.
export interface CatalogCategory {
  id: string;
  name: string;
  count: number;
}

export interface CatalogCategoryListProps {
  categories: CatalogCategory[];
  // The chosen category's id, or null when none is chosen.
  value: string | null;
  // Where a row leads: filter state in the URL belongs to the page (0009 K7).
  getHref: (id: string) => string;
  // Every row's own click and pointer handlers (the page's analytics).
  linkEvents?: Pick<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    'onClick' | 'onPointerEnter' | 'onPointerLeave'
  >;
  // `column`: the desktop column; `rows`: the phone list under the bar (spec 0020 plan §2).
  layout?: 'column' | 'rows';
  // For the phone bar's toggle (`aria-controls`), which hides the list with `hidden`.
  id?: string;
  hidden?: boolean;
  'aria-label'?: string;
  className?: string;
}

// Lamoda's category tree, flat as categories are (0009 K8): each row is a link with the name and
// a grey count; the chosen one is a black block with aria-current="page" and stays a link. The
// phone's rows (W27) are full-width lines split by hairlines, with no count; the chosen one is
// bold. Nothing renders for an empty list.
export function CatalogCategoryList({
  categories,
  value,
  getHref,
  linkEvents,
  layout = 'column',
  id,
  hidden,
  'aria-label': ariaLabel = 'Категории',
  className,
}: CatalogCategoryListProps) {
  if (categories.length === 0) return null;
  const rows = layout === 'rows';

  return (
    <nav aria-label={ariaLabel} id={id} hidden={hidden} className={className}>
      <ul className={rows ? styles.rows : styles.list}>
        {categories.map((category) => {
          const chosen = category.id === value;
          return (
            <li key={category.id} className={rows ? styles.row : undefined}>
              <NextLink
                {...linkEvents}
                href={getHref(category.id)}
                aria-current={chosen ? 'page' : undefined}
                className={[
                  rows ? styles.rowLink : styles.link,
                  chosen ? (rows ? styles.rowChosen : styles.chosen) : null,
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className={styles.name}>{category.name}</span>
                {rows ? null : (
                  <>
                    {' '}
                    <span className={styles.count}>{category.count}</span>
                  </>
                )}
              </NextLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
