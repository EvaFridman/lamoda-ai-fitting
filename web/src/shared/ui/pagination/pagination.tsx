import NextLink from 'next/link';
import type { MouseEvent, ReactNode } from 'react';

import { Button } from '../button/button';
import { ArrowBackIcon, ArrowForwardIcon } from '../icon/icons';

import { pageItems } from './page-items';
import styles from './pagination.module.scss';

// One of the two, never both or neither: a server page passes getHref, a client one either.
type PaginationMode =
  | {
      // Links: the address of a page (the catalog's pages have addresses).
      getHref: (page: number) => string;
      onPageChange?: never;
    }
  | {
      // Buttons: called with the page picked, never with the current one.
      onPageChange: (page: number) => void;
      getHref?: never;
    };

export type PaginationProps = PaginationMode & {
  // The current page, from 1.
  page: number;
  pageCount: number;
  // "10 из 11" on the right: items shown and items in all, both needed.
  shown?: number;
  total?: number;
  // "Показать ещё" over the pages, while pages remain.
  onShowMore?: () => void;
  showMoreLoading?: boolean;
  'aria-label'?: string;
  className?: string;
};

// Lamoda's pagination (D7x): page numbers with the current one on a grey square, "← Назад" and
// "Дальше →" (not shown on the first and the last page), "10 из 11" in grey on the right and an
// outline "Показать ещё" above. Works without JavaScript when given getHref. Not a client
// component itself, so a server page can pass getHref; onPageChange and onShowMore come from a
// client one.
export function Pagination({
  page,
  pageCount,
  getHref,
  onPageChange,
  shown,
  total,
  onShowMore,
  showMoreLoading,
  'aria-label': ariaLabel = 'Страницы',
  className,
}: PaginationProps) {
  const current = Math.min(Math.max(page, 1), Math.max(pageCount, 1));
  const counted = shown !== undefined && total !== undefined;

  // "Назад" to the first page, "Дальше" to the last and "Показать ещё" up to the last go away once
  // pressed. The focus moves first to the number of the page they lead to, which stays, instead
  // of falling to the body: for "Назад" and "Дальше" as buttons only (a link leaves the page, and
  // the focus with it), for "Показать ещё" in both modes unless it loads (showMoreLoading given):
  // then the button stays while it loads, and the page moves the focus once it is done.
  const focusPage = (target: number, event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget
      .closest('[data-pagination]')
      ?.querySelector<HTMLElement>(`[data-page="${target}"]`)
      ?.focus();
  };

  const go = (target: number, step: boolean, event: MouseEvent<HTMLButtonElement>) => {
    if (target === current || !onPageChange) return;
    if (step && (target === 1 || target === pageCount)) focusPage(target, event);
    onPageChange(target);
  };

  const showMore = (event: MouseEvent<HTMLButtonElement>) => {
    if (current + 1 === pageCount && showMoreLoading === undefined) focusPage(pageCount, event);
    onShowMore?.();
  };

  // A page number is named "Страница 2"; "Назад" and "Дальше" are named by their text.
  const control = (target: number, content: ReactNode, step = false) => {
    const props = {
      className: styles.control,
      'aria-label': step ? undefined : `Страница ${target}`,
      'aria-current': !step && target === current ? ('page' as const) : undefined,
      'data-page': step ? undefined : target,
    };
    return getHref ? (
      <NextLink href={getHref(target)} {...props}>
        {content}
      </NextLink>
    ) : (
      <button type="button" onClick={(event) => go(target, step, event)} {...props}>
        {content}
      </button>
    );
  };

  return (
    <div className={[styles.pagination, className].filter(Boolean).join(' ')} data-pagination>
      {onShowMore && current < pageCount ? (
        <Button variant="outline" size={40} fullWidth loading={showMoreLoading} onClick={showMore}>
          Показать ещё
        </Button>
      ) : null}
      <div className={styles.row}>
        {pageCount > 1 ? (
          <nav aria-label={ariaLabel}>
            <ul className={styles.pages}>
              {current > 1 ? (
                <li>
                  {control(
                    current - 1,
                    <>
                      <ArrowBackIcon className={styles.arrow} />
                      Назад
                    </>,
                    true,
                  )}
                </li>
              ) : null}
              {pageItems(current, pageCount).map((item) =>
                typeof item === 'number' ? (
                  <li key={item}>{control(item, item)}</li>
                ) : (
                  <li key={item} className={styles.gap}>
                    …
                  </li>
                ),
              )}
              {current < pageCount ? (
                <li>
                  {control(
                    current + 1,
                    <>
                      Дальше
                      <ArrowForwardIcon className={styles.arrow} />
                    </>,
                    true,
                  )}
                </li>
              ) : null}
            </ul>
          </nav>
        ) : null}
        {counted ? (
          <p className={styles.counter}>
            {shown} из {total}
          </p>
        ) : null}
      </div>
    </div>
  );
}
