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
  // A first row «Все товары» (the phone's sheet, spec 0024 Z3): where it leads and its count. It
  // is the chosen one while `value` is null.
  all?: { href: string; count: number };
  // Every row's own click and pointer handlers (the page's analytics).
  linkEvents?: Pick<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    'onClick' | 'onPointerEnter' | 'onPointerLeave'
  >;
  // `column`: the desktop column; `rows`: the phone's sheet of categories (spec 0024 Z3).
  layout?: 'column' | 'rows';
  'aria-label'?: string;
  className?: string;
}

// Lamoda's category tree, flat as categories are (0009 K8): each row is a link with the name and
// a grey count; the chosen one is a black block with aria-current="page" and stays a link. The
// phone's rows are the sheet's lines split by hairlines, the count grey after the name; the
// chosen one is bold. Nothing renders for an empty list.
export function CatalogCategoryList({
  categories,
  value,
  getHref,
  all,
  linkEvents,
  layout = 'column',
  'aria-label': ariaLabel = 'Категории',
  className,
}: CatalogCategoryListProps) {
  if (categories.length === 0) return null;
  const rows = layout === 'rows';
  const items = [
    ...(all === undefined ? [] : [{ key: '', name: 'Все товары', ...all, chosen: value === null }]),
    ...categories.map((category) => ({
      key: category.id,
      name: category.name,
      count: category.count,
      href: getHref(category.id),
      chosen: category.id === value,
    })),
  ];

  return (
    <nav aria-label={ariaLabel} className={className}>
      <ul className={rows ? styles.rows : styles.list}>
        {items.map((item) => (
          <li key={item.key} className={rows ? styles.row : undefined}>
            <NextLink
              {...linkEvents}
              href={item.href}
              aria-current={item.chosen ? 'page' : undefined}
              className={[
                rows ? styles.rowLink : styles.link,
                item.chosen ? (rows ? styles.rowChosen : styles.chosen) : null,
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className={styles.name}>{item.name}</span>{' '}
              <span className={styles.count}>{item.count}</span>
            </NextLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
