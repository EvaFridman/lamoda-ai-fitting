import NextLink from 'next/link';

import styles from './breadcrumbs.module.scss';

export interface Crumb {
  label: string;
  // Every crumb but the last links to its page; the last one is the current page.
  href?: string;
}

export interface BreadcrumbsProps {
  // From the home page down to the current one.
  items: Crumb[];
  'aria-label'?: string;
  className?: string;
}

// Lamoda's breadcrumbs: 13px grey links that turn black on hover, "/" between them. The last
// crumb is the current page: plain grey text with aria-current="page" (D7w). The crumbs wrap on a
// narrow screen.
export function Breadcrumbs({
  items,
  'aria-label': ariaLabel = 'Навигация по разделам',
  className,
}: BreadcrumbsProps) {
  return (
    <nav aria-label={ariaLabel} className={className}>
      <ol className={styles.list}>
        {items.map((crumb, index) => {
          const current = index === items.length - 1;
          return (
            <li key={`${crumb.label} ${crumb.href ?? ''}`} className={styles.item}>
              {current || crumb.href === undefined ? (
                <span aria-current={current ? 'page' : undefined}>{crumb.label}</span>
              ) : (
                <NextLink href={crumb.href} className={styles.link}>
                  {crumb.label}
                </NextLink>
              )}
              {current ? null : (
                <span className={styles.separator} aria-hidden>
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
