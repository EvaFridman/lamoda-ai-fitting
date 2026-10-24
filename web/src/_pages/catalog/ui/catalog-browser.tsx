'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';

import { CatalogCategoryList, CatalogCategoryToggle, useCategories } from '@/entities/category';
import {
  isRefusedCursor,
  type ProductFacets,
  useProductBatches,
  useProductFacets,
} from '@/entities/product';
import { isSubmitFresh, useSubmittedSearch } from '@/features/header-search';
import { track, useTrackedElement } from '@/shared/analytics';
import { errorText, reportFailure } from '@/shared/api';
import { CatalogFilters, clearFilters, hasAppliedFilters } from '@/widgets/catalog-filters';
import { ProductGrid, ProductGridSkeleton } from '@/widgets/product-grid';

import { filterChanges, sortChange } from '../model/analytics';
import { catalogCategoriesQuery, categoryRows } from '../model/categories';
import { isDocumentEntry } from '../lib/document-entry';
import { productCount } from '../lib/product-count';
import { scrollTarget, underStuck } from '../lib/scroll-target';
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

// What `Catalog Searched` already counted in the tab (O105): the last header submit, and whether
// the tab's first catalog page was checked for being the one the document was loaded at. Each
// category's page mounts anew.
const searchSeen = { submitId: 0, entryChecked: false };

// The page the header's search opens: the catalog with the query only (O15, O81).
function isHeaderSearchPage(query: CatalogQuery, categoryId?: string, start?: string): boolean {
  return (
    categoryId === undefined &&
    start === undefined &&
    Object.entries(query).every(([key, value]) => key === 'q' || value === undefined)
  );
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
  const topRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // The phone list under the bar (spec 0020 plan §2): closed on every new page, since each
  // category's page mounts anew.
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const phoneCategoriesId = useId();
  // Opened on a page scrolled past it, the list would open above the window, under the stuck
  // block: the page goes up so it starts right under the block (W28).
  useEffect(() => {
    const top = topRef.current;
    const list = document.getElementById(phoneCategoriesId);
    if (!categoriesOpen || top === null || list === null) return;
    if (getComputedStyle(top).position !== 'sticky') return;
    const target = underStuck(list.getBoundingClientRect().top + window.scrollY, top.offsetHeight);
    if (window.scrollY > target) window.scrollTo({ top: target });
  }, [categoriesOpen, phoneCategoriesId]);
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
  // The filters' counts while the new ones load or after they fail: the last answer, for the
  // category it was counted for, so the chips stay mounted and keep the focus (0020 plan §4).
  const [kept, setKept] = useState<{ facets: ProductFacets; categoryId?: string } | null>(null);
  if (facets.data !== undefined && facets.data !== kept?.facets) {
    setKept({ facets: facets.data, categoryId });
  }
  const filterFacets =
    facets.data ?? (kept !== null && kept.categoryId === categoryId ? kept.facets : undefined);
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

  // "Catalog Searched" for an act of searching (O105), when its first batch arrives with the total:
  // a query submitted in the header, counted on the page it opens (not on the page it was submitted
  // from), or the page a link opened. A category with the same `q`, Back, Forward and a reload are
  // not searches; a start from a cursor has no total.
  const submitted = useSubmittedSearch();
  const firstBatch = data?.pages[0];
  const q = query.q;
  const searchPage = isHeaderSearchPage(query, categoryId, start);
  // Whether this mount shows the address the document was loaded at by a link: decided once, at
  // the tab's first catalog mount, so a later visit back to it is not an entry.
  const entryRef = useRef(false);
  useEffect(() => {
    if (searchSeen.entryChecked) return;
    searchSeen.entryChecked = true;
    entryRef.current = isDocumentEntry();
  }, []);
  useEffect(() => {
    if (firstBatch === undefined) return;
    const entry = entryRef.current;
    entryRef.current = false;
    const bySubmit =
      searchPage &&
      submitted !== null &&
      submitted.id !== searchSeen.submitId &&
      submitted.q === q &&
      isSubmitFresh(submitted);
    if (bySubmit) searchSeen.submitId = submitted.id;
    if (q === undefined || !(entry || bySubmit) || firstBatch.total === null) return;
    track('Catalog Searched', { query_length: [...q].length, results: firstBatch.total });
  }, [q, firstBatch, submitted, searchPage]);

  // The list a next batch is asked for: the address and its start.
  const listKey = `${pathname}${catalogSearch({ query })}|${shownStart ?? ''}`;
  const listKeyRef = useRef(listKey);
  useEffect(() => {
    listKeyRef.current = listKey;
  });

  const categoryLink = useTrackedElement('catalog.category');
  // `expanded`: the state a click opens to (W16).
  const categoryToggle = useTrackedElement('catalog.category-toggle', {
    expanded: !categoriesOpen,
  });

  // A new selection replaces the address from its first batch: no history entry, so Back leaves
  // the catalog (O82). Next keeps the scroll; the page goes up to the list's top only when the
  // visitor is below it (`scrollTarget`: under the stuck heading and bar on phones, W28).
  const select = (next: CatalogQuery) => {
    const column = columnRef.current;
    const top = topRef.current;
    const bar = barRef.current;
    if (column !== null && top !== null) {
      const target = scrollTarget({
        stuckHeight: getComputedStyle(top).position === 'sticky' ? top.offsetHeight : null,
        barTop:
          bar !== null && bar.getClientRects().length > 0
            ? bar.getBoundingClientRect().top + window.scrollY
            : null,
        columnTop: column.getBoundingClientRect().top + window.scrollY,
      });
      if (window.scrollY > target) window.scrollTo({ top: target });
    }
    const search = catalogSearch({ query: next });
    // As the address will read back: the page's `query` is parsed from it, which drops what the
    // parser refuses.
    const parsed = parseCatalogUrl(new URLSearchParams(search));
    setFoundFor(catalogSearch(parsed));
    // One event per changed choice, the row's and the drawer's alike (O101).
    for (const change of filterChanges(query, parsed.query, filterFacets?.attributes ?? [])) {
      track('Catalog Filter Applied', change);
    }
    const sort = sortChange(query, parsed.query);
    if (sort !== undefined) track('Catalog Sorted', { sort });
    router.replace(`${pathname}${search}`, { scroll: false });
  };

  // A batch the visitor scrolled to, numbered in the list shown; not one the grid loads itself to
  // go back to the place (O97). Only when that batch arrived for the same list: a selection changed
  // meanwhile, or nothing loaded, sends nothing.
  const loadMore = (restoring: boolean) => {
    const batch = (data?.pages.length ?? 0) + 1;
    const key = listKey;
    void fetchNextPage({ cancelRefetch: false }).then((result) => {
      if (
        !restoring &&
        !result.isError &&
        result.data?.pages.length === batch &&
        listKeyRef.current === key
      ) {
        track('Catalog Batch Loaded', { batch });
      }
    });
  };

  // "Очистить фильтры" goes away with the filters: the focus moves to the heading (plan §3.4),
  // without scrolling past the list's column (O82).
  const focusHeading = () => headingRef.current?.focus({ preventScroll: true });

  // From the counts the filters keep too (plan §4), so both lists stay while new counts load or
  // after they fail, and the phone list's toggle never opens nothing (W29).
  const { rows, slugs } = categoryRows(
    filterFacets ?? { categories: [] },
    categories.data?.items ?? [],
  );
  // A category is a page (O73); its row keeps the selection, whose counts it shows.
  const categoryHref = (id: string) =>
    `/catalog/${encodeURIComponent(slugs.get(id) ?? '')}${catalogSearch({ query })}`;

  return (
    <>
      {/* The heading row and the phone bar: one block, stuck to the window's top below 600px
          (W28). A child of `<main>`, whose height bounds where it sticks. */}
      <div ref={topRef} className={styles.top}>
        <CatalogHeading
          ref={headingRef}
          title={title}
          total={facets.data?.total}
          // A placeholder while the counts load, none after they fail (W14).
          countPending={facets.isPending}
        />
        {/* The category's toggle below 600px, "Фильтры" below 1024px (W27). */}
        <div ref={barRef} className={styles.bar}>
          <CatalogCategoryToggle
            className={styles.barPhone}
            label={categoryId === undefined ? 'Все товары' : title}
            open={categoriesOpen}
            onOpenChange={setCategoriesOpen}
            controls={phoneCategoriesId}
            toggleEvents={categoryToggle}
          />
          <CatalogFilters
            part="sheet"
            facets={filterFacets}
            value={query}
            onChange={select}
            categoryId={categoryId}
          />
        </div>
      </div>
      <CatalogCategoryList
        layout="rows"
        id={phoneCategoriesId}
        hidden={!categoriesOpen}
        className={styles.barPhone}
        aria-label="Список категорий"
        categories={rows}
        value={categoryId ?? null}
        getHref={categoryHref}
        linkEvents={categoryLink}
      />
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
            getHref={categoryHref}
            linkEvents={categoryLink}
          />
        </aside>
        <div
          ref={columnRef}
          className={styles.column}
          // While the grid's placeholders show (D7af).
          aria-busy={firstBatchPending()}
        >
          <CatalogFilters
            part="row"
            className={styles.chips}
            facets={filterFacets}
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

  // The first batch loads, with no error to show instead.
  function firstBatchPending() {
    return data === undefined && error === null && failureText === undefined;
  }

  function renderList() {
    // The grid's placeholders while the first batch loads (0020 plan §1).
    if (firstBatchPending()) return <ProductGridSkeleton />;
    if (data === undefined) {
      return (
        <p role="alert" className={styles.inset}>
          {error === null ? failureText : errorText(error)}
        </p>
      );
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
          onLoadMore={loadMore}
          moreHref={next === null ? undefined : catalogSearch({ query, cursor: next })}
          showMore={isFetchNextPageError}
        />
        {isFetchNextPageError ? (
          <p role="alert" className={styles.inset}>
            {errorText(error)}
          </p>
        ) : null}
      </>
    );
  }
}
