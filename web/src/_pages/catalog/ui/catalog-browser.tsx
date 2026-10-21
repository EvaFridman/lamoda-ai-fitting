'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { CatalogCategoryList, useCategories } from '@/entities/category';
import { isRefusedCursor, useProductBatches, useProductFacets } from '@/entities/product';
import { errorText, reportFailure } from '@/shared/api';
import { CatalogFilters, clearFilters, hasAppliedFilters } from '@/widgets/catalog-filters';
import { ProductGrid } from '@/widgets/product-grid';

import { catalogCategoriesQuery, categoryRows } from '../model/categories';
import { type CatalogQuery, catalogSearch } from '../model/url-state';
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
  const batchQuery = categoryId === undefined ? query : { ...query, categoryId: [categoryId] };
  const [from, setFrom] = useState(start ?? null);
  const { data, error, hasNextPage, isFetching, isFetchNextPageError, fetchNextPage } =
    useProductBatches(batchQuery, from);
  const facets = useProductFacets(batchQuery);
  const categories = useCategories(catalogCategoriesQuery);

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
    router.replace(`${pathname}${catalogSearch({ query: next })}`, { scroll: false });
  };

  const { rows, slugs } = categoryRows(
    facets.data ?? { categories: [] },
    categories.data?.items ?? [],
  );

  return (
    <>
      <CatalogHeading title={title} total={facets.data?.total} />
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
          <CatalogFilters facets={facets.data} value={query} onChange={select} />
          {renderList()}
        </div>
      </div>
    </>
  );

  function renderList() {
    if (data === undefined) {
      const text = error === null ? failureText : errorText(error);
      return text === undefined ? null : <p role="alert">{text}</p>;
    }
    const products = data.pages.flatMap((page) => page.items);
    if (products.length === 0) {
      return (
        <CatalogEmpty
          onClear={hasAppliedFilters(query) ? () => select(clearFilters(query)) : undefined}
        />
      );
    }
    const next = data.pages.at(-1)?.nextCursor ?? null;
    return (
      <>
        <ProductGrid
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
