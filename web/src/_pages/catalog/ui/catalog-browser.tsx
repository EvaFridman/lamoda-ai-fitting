'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { CatalogCategoryList, useCategories } from '@/entities/category';
import { isRefusedCursor, useProductBatches, useProductFacets } from '@/entities/product';
import { errorText, reportFailure } from '@/shared/api';
import { CatalogFilters, clearFilters, hasAppliedFilters } from '@/widgets/catalog-filters';
import { ProductGrid } from '@/widgets/product-grid';

import { catalogCategoriesQuery, categoryRows } from '../model/categories';
import { productCount } from '../lib/product-count';
import { type CatalogQuery, catalogSearch, parseCatalogUrl } from '../model/url-state';
import { CatalogEmpty } from './catalog-empty';
import { CatalogHeading } from './catalog-heading';

import styles from './catalog-page.module.scss';

export interface CatalogBrowserProps {
  // The category's name, or "Каталог".
  title: string;
  // The address's state.
  query: CatalogQuery;
  // The path's category, if any (O73).
  categoryId?: string;
  // The batch to start from: the address's cursor, unless the api refused it (O72).
  start?: string;
  // The server's error text when its first batch failed: shown, without JavaScript too, until
  // the browser's own request answers (O74).
  failureText?: string;
}

// The client part of the page (plan §3.2): the title with the count, the categories, the row of
// filters and the list. It starts from the batch, the counts and the categories the server
// prefetched under the same keys, so it makes no request on load; after a server failure it
// requests them itself.
export function CatalogBrowser({
  title,
  query,
  categoryId,
  start,
  failureText,
}: CatalogBrowserProps) {
  const router = useRouter();
  const pathname = usePathname();
  const columnRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const batchQuery = categoryId === undefined ? query : { ...query, categoryId: [categoryId] };
  const [from, setFrom] = useState(start ?? null);
  // Another start (a selection made on a batch page leaves its cursor) is another list, from that
  // start, and another grid (its key). The rest of the page stays mounted, so the heading, the live
  // regions and the focused chip go on as on a first page.
  const [shownStart, setShownStart] = useState(start);
  if (start !== shownStart) {
    setShownStart(start);
    setFrom(start ?? null);
  }
  const {
    data,
    error,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  } = useProductBatches(batchQuery, from);
  const facets = useProductFacets(batchQuery);
  const categories = useCategories(catalogCategoriesQuery);
  // The address of the visitor's last change, which the live region's count is read for (plan
  // §3.4): nothing on load, and not the old selection's count before the address changes.
  const [foundFor, setFoundFor] = useState<string | null>(null);

  // A start cursor the api refused in the browser's own request (the server's failed first): the
  // first batch instead, as on the server (O72). A refused next cursor keeps the loaded batches.
  if (from !== null && data === undefined && isRefusedCursor(error)) setFrom(null);

  useEffect(() => {
    if (error !== null) reportFailure(error);
  }, [error]);

  // A new selection replaces the address from its first batch: no history entry, so Back leaves
  // the catalog (O82). Next keeps the scroll; the page goes up to the list's column only when the
  // visitor is below its top.
  const select = (next: CatalogQuery) => {
    const column = columnRef.current;
    if (column !== null) {
      const top = column.getBoundingClientRect().top + window.scrollY;
      if (window.scrollY > top) window.scrollTo({ top });
    }
    const search = catalogSearch({ query: next });
    // As the address will read back: the page's `query` is parsed from it, which drops what the
    // parser refuses.
    setFoundFor(catalogSearch(parseCatalogUrl(new URLSearchParams(search))));
    router.replace(`${pathname}${search}`, { scroll: false });
  };

  // "Очистить фильтры" goes away with the filters: the focus moves to the heading (plan §3.4),
  // without scrolling past the list's column (O82).
  const focusHeading = () => headingRef.current?.focus({ preventScroll: true });

  const { rows, slugs } = categoryRows(
    facets.data ?? { categories: [] },
    categories.data?.items ?? [],
  );

  return (
    <>
      <CatalogHeading ref={headingRef} title={title} total={facets.data?.total} />
      {/* Two live regions, so a batch loading right after a change cannot replace the count
          before it is read. */}
      <p className={styles.status} aria-live="polite">
        {foundText()}
      </p>
      <p className={styles.status} aria-live="polite">
        {isFetchingNextPage ? 'Загружаем ещё' : ''}
      </p>
      <div className={styles.layout}>
        <aside aria-label="Категории" className={styles.aside}>
          <CatalogCategoryList
            aria-label="Список категорий"
            categories={rows}
            value={categoryId ?? null}
            // A category is a page (O73); its row keeps the selection, whose counts it shows.
            getHref={(id) =>
              `/catalog/${encodeURIComponent(slugs.get(id) ?? '')}${catalogSearch({ query })}`
            }
          />
        </aside>
        <div ref={columnRef} className={styles.column}>
          <CatalogFilters
            facets={facets.data}
            value={query}
            onChange={select}
            categoryId={categoryId}
            focusAfterClear={focusHeading}
          />
          {renderList()}
        </div>
      </div>
    </>
  );

  // The new selection's count once it loads; empty while it loads, so the count itself is read.
  // It stays as it is while batches load, so it is not read again after each.
  function foundText() {
    if (foundFor === catalogSearch({ query }) && facets.data !== undefined) {
      return `Найдено ${productCount(facets.data.total)}`;
    }
    return '';
  }

  function renderList() {
    if (data === undefined) {
      const text = error === null ? failureText : errorText(error);
      return text === undefined ? null : <p role="alert">{text}</p>;
    }
    const products = data.pages.flatMap((page) => page.items);
    if (products.length === 0) {
      return (
        <CatalogEmpty
          onClear={
            hasAppliedFilters(query)
              ? () => {
                  select(clearFilters(query));
                  focusHeading();
                }
              : undefined
          }
        />
      );
    }
    const next = data.pages.at(-1)?.nextCursor ?? null;
    return (
      <>
        <ProductGrid
          key={shownStart ?? ''}
          products={products}
          total={facets.data?.total}
          // Not during a refetch of the loaded batches either: a next batch asked for then is
          // dropped, and the grid asks again once this turns back on.
          canLoadMore={hasNextPage && !isFetching && !isFetchNextPageError}
          onLoadMore={() => void fetchNextPage({ cancelRefetch: false })}
          moreHref={next === null ? undefined : catalogSearch({ query, cursor: next })}
          showMore={isFetchNextPageError}
        />
        {isFetchNextPageError ? <p role="alert">{errorText(error)}</p> : null}
      </>
    );
  }
}
