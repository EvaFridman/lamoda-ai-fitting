'use client';

import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { usePathname, useSearchParams } from 'next/navigation';
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { CatalogProductCard, LookToggle, type ProductListItem } from '@/entities/product';
import { FavoriteStub } from '@/features/product-stubs';
import { useTrackedElement } from '@/shared/analytics';
import { Link } from '@/shared/ui';

import { columnsFor } from '../lib/columns';
import {
  currentScrollKey,
  endFirstShow,
  isLoadedByTraversal,
  readScroll,
  saveScroll,
  type ScrollMemory,
  scrollKey,
} from '../lib/scroll-memory';

import styles from './product-grid.module.scss';

// Rows kept beyond the screen on each side, and how near the end the next batch is requested
// (plan §3.3).
const OVERSCAN_ROWS = 2;
const LOAD_AHEAD_ROWS = 2;
// At most this many products are loaded again to go back to a place (10 batches of 60).
const MAX_RESTORED_PRODUCTS = 600;
// A row's height before it is measured: the card's photo is 236:341, its text about this high.
const PHOTO_RATIO = 341 / 236;
const TEXT_HEIGHT = 130;

export interface ProductGridProps {
  products: readonly ProductListItem[];
  // The list's size for screen readers: the filter counts' total, when known (O49).
  total?: number;
  // A batch after the loaded ones exists and may be requested now.
  canLoadMore: boolean;
  // `restoring`: the grid loads it itself to go back to the place after "Back", the visitor did
  // not scroll to it (spec 0014 O97).
  onLoadMore: (restoring: boolean) => void;
  // The next batch as an address of its own (`?…&cursor=`, O29), for the "Дальше" link.
  moreHref?: string;
  // "Дальше" stays visible with JavaScript too (a batch failed to load: the visitor goes on by it).
  showMore?: boolean;
  // The ids of the categories with a slot of the fitting room: only their cards show the hanger
  // (AC16, A83.7). None while the categories load.
  slottedCategoryIds?: ReadonlySet<string>;
}

interface Layout {
  columns: number;
  rowHeight: number;
  gap: number;
  // The list's top in the document: the virtualizer's `scrollMargin`.
  top: number;
}

function measureLayout(container: HTMLElement, list: HTMLElement): Layout {
  const width = container.getBoundingClientRect().width;
  const columns = columnsFor(width);
  const style = getComputedStyle(list);
  const columnGap = Number.parseFloat(style.columnGap) || 0;
  // The list's own side padding (phones, spec 0020 W31) is not the cards'.
  const padding =
    (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
  const cardWidth = (width - padding - columnGap * (columns - 1)) / columns;
  return {
    columns,
    rowHeight: cardWidth * PHOTO_RATIO + TEXT_HEIGHT,
    gap: Number.parseFloat(style.rowGap) || 0,
    top: list.getBoundingClientRect().top + window.scrollY,
  };
}

const SCROLL_KEYS = new Set(['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', ' ']);

// A key that scrolls the page: not typed into a field, not part of a shortcut.
function isScrollKey(event: KeyboardEvent): boolean {
  const target = event.target;
  const editable =
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
  return (
    SCROLL_KEYS.has(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey && !editable
  );
}

function sameLayout(a: Layout | null, b: Layout): boolean {
  return (
    a !== null &&
    a.columns === b.columns &&
    a.gap === b.gap &&
    Math.abs(a.rowHeight - b.rowHeight) < 1 &&
    Math.abs(a.top - b.top) < 1
  );
}

interface GridItemProps {
  product: ProductListItem;
  // From 1, in the list as loaded.
  position: number;
  setSize: number;
  measureRef?: (element: HTMLLIElement | null) => void;
  row?: number;
  hasSlot: boolean;
}

// A card of the list; its clicks and hovers are tracked by position, never by product (O35). Its
// corners (A63.1): the hanger, disabled until the fitting room (T26), and the heart stub (A33).
function GridItem({ product, position, setSize, measureRef, row, hasSlot }: GridItemProps) {
  const tracked = useTrackedElement('catalog.card', { position });
  return (
    <li ref={measureRef} data-index={row} aria-setsize={setSize} aria-posinset={position}>
      <CatalogProductCard
        product={product}
        href={`/products/${encodeURIComponent(product.id)}`}
        // Off: one card's prefetch reads the api about 4 times on the visitor's quota (0019 A82,
        // backlog "Catalog card prefetch").
        prefetch={false}
        linkEvents={tracked}
        lookToggle={hasSlot ? <LookToggle disabled /> : null}
        favorite={<FavoriteStub size={32} />}
      />
    </li>
  );
}

// The catalog's grid (spec 0014 plan §3.3): rows of cards virtualized over the window's scroll.
// The server and the first render on the client draw every loaded card as a plain grid (its
// columns from the stylesheet's container queries), so hydration changes nothing; once measured,
// only the rows near the screen stay in the page, with the rest as padding above and below.
export function ProductGrid({
  products,
  total,
  canLoadMore,
  onLoadMore,
  moreHref,
  showMore = false,
  slottedCategoryIds,
}: ProductGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  // The list's own address, which the address bar leaves before the list does (a step through the
  // history renders the next page while this one is still on the screen).
  const key = scrollKey(usePathname(), new URLSearchParams(useSearchParams().toString()));
  const keyRef = useRef(key);
  const loadMoreRef = useRef(onLoadMore);
  const countRef = useRef(products.length);
  // First of the layout effects, so the ones below see this render's values.
  useLayoutEffect(() => {
    keyRef.current = key;
    loadMoreRef.current = onLoadMore;
    countRef.current = products.length;
  });

  // Where the list was when the visitor left it, when the page loads anew by Back or Forward (O77;
  // a client-side step shows the list Next kept, at the browser's own scroll). In the layout phase,
  // after any render React may have discarded, and before the browser paints. Refs, so the
  // restore below sees the place in the same commit; the tick runs it again.
  const memoryRef = useRef<ScrollMemory | undefined>(undefined);
  // True until the list is back at that place, or the visitor scrolls elsewhere first.
  const pendingRef = useRef(false);
  const [restoreTick, setRestoreTick] = useState(0);
  useLayoutEffect(() => {
    const shownKey = keyRef.current;
    const saved = isLoadedByTraversal(shownKey) ? readScroll(shownKey) : undefined;
    endFirstShow();
    // Nothing found keeps what an earlier run found (StrictMode runs this twice).
    if (saved === undefined) return;
    memoryRef.current = saved;
    pendingRef.current = true;
    setRestoreTick((tick) => tick + 1);
  }, []);

  const columns = layout?.columns ?? 1;
  const rowCount = layout === null ? 0 : Math.ceil(products.length / columns);
  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    // The saved row height counts for the rows above the saved place, never rendered since, until
    // the columns change: a batch loaded later recounts them, and another height would move the
    // cards on the screen.
    estimateSize: () => memoryRef.current?.rowHeight ?? layout?.rowHeight ?? 0,
    overscan: OVERSCAN_ROWS,
    gap: layout?.gap ?? 0,
    scrollMargin: layout?.top ?? 0,
    // Where the window is: the saved place is scrolled to once its batches are loaded, and until
    // then the rows on the screen are drawn.
    initialOffset: () => window.scrollY,
    enabled: layout !== null,
  });

  // The width sets the columns; the page above the list (filters, a heading) sets its top.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const list = listRef.current;
    if (container === null || list === null) return;
    const update = () => {
      const next = measureLayout(container, list);
      setLayout((current) => (sameLayout(current, next) ? current : next));
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(container);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);

  // A row holds other cards after a change of the columns: its measured height no longer counts,
  // nor the saved one.
  const columnsRef = useRef<number | null>(null);
  useEffect(() => {
    if (layout === null) return;
    const memory = memoryRef.current;
    if (columnsRef.current !== null && columnsRef.current !== columns && memory !== undefined) {
      memoryRef.current = { ...memory, rowHeight: undefined };
    }
    columnsRef.current = columns;
    virtualizer.measure();
  }, [layout, columns, virtualizer]);

  // Back to the place (O12, O77). A page loaded anew has only its first batch: the batches loaded
  // before, up to MAX_RESTORED_PRODUCTS, are requested first, unless there are no more or one
  // fails. After the commit, once the list's padding is in the page.
  useEffect(() => {
    const memory = memoryRef.current;
    if (layout === null || !pendingRef.current || memory === undefined) return;
    const target = Math.min(memory.count ?? 0, MAX_RESTORED_PRODUCTS);
    const more = canLoadMore || (moreHref !== undefined && !showMore);
    if (products.length < target && more) {
      if (canLoadMore) loadMoreRef.current(true);
      return;
    }
    pendingRef.current = false;
    virtualizer.scrollToOffset(memory.offset);
  }, [layout, products.length, canLoadMore, moreHref, showMore, restoreTick, virtualizer]);

  // The place is written as the visitor scrolls, at most once a frame, under the list's own
  // address, and not while it is being restored or once the address bar has left the list (the
  // browser's own scroll of a step through the history is not this list's place). Subscribed in
  // the layout phase, so leaving the page removes it before the next page's scroll to the top.
  useLayoutEffect(() => {
    let frame: number | undefined;
    const save = () => {
      frame = undefined;
      const listKey = keyRef.current;
      if (pendingRef.current || currentScrollKey() !== listKey) return;
      // A measured row only: an estimate would carry over as the real height.
      const row = virtualizer.getVirtualItems()[0];
      saveScroll(listKey, {
        offset: window.scrollY,
        rowHeight: row === undefined ? undefined : virtualizer.itemSizeCache.get(row.key),
        count: countRef.current,
      });
    };
    const onScroll = () => {
      if (!pendingRef.current) frame ??= requestAnimationFrame(save);
    };
    // A visitor who scrolls while the batches load has chosen a place: it is not taken away.
    const cancel = () => {
      pendingRef.current = false;
    };
    const onKey = (event: KeyboardEvent) => {
      if (isScrollKey(event)) cancel();
    };
    // The scrollbar: a press on it comes from the root element.
    const onPointer = (event: PointerEvent) => {
      if (event.target === document.documentElement) cancel();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('wheel', cancel, { passive: true });
    window.addEventListener('touchmove', cancel, { passive: true });
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('wheel', cancel);
      window.removeEventListener('touchmove', cancel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [virtualizer]);

  const rows = layout === null ? [] : virtualizer.getVirtualItems();
  const lastRow = rows.at(-1)?.index;

  // "Дальше" focused from the keyboard is shown, and the list waits: a batch loaded then would move
  // the link off the screen, under the new cards.
  const [moreFocused, setMoreFocused] = useState(false);

  // The next batch, one at a time: the caller turns `canLoadMore` off while one loads. Not while
  // the place is restored: those batches are the restore's (O97).
  useEffect(() => {
    if (
      canLoadMore &&
      !pendingRef.current &&
      !moreFocused &&
      lastRow !== undefined &&
      lastRow >= rowCount - 1 - LOAD_AHEAD_ROWS
    ) {
      loadMoreRef.current(false);
    }
  }, [canLoadMore, moreFocused, lastRow, rowCount]);

  let first = 0;
  let end = products.length;
  const style: CSSProperties & Record<'--columns', number | undefined> = {
    '--columns': layout?.columns,
  };
  if (layout !== null) {
    const firstRow = rows[0];
    const last = rows.at(-1);
    first = firstRow === undefined ? 0 : firstRow.index * columns;
    end = last === undefined ? 0 : Math.min((last.index + 1) * columns, products.length);
    style.paddingTop = firstRow === undefined ? 0 : firstRow.start - layout.top;
    style.paddingBottom =
      last === undefined
        ? virtualizer.getTotalSize()
        : virtualizer.getTotalSize() - (last.end - layout.top);
  }
  const setSize = Math.max(total ?? 0, products.length);

  return (
    <div ref={containerRef} className={styles.grid}>
      <ul ref={listRef} aria-label="Товары" className={styles.list} style={style}>
        {products.slice(first, end).map((product, offset) => {
          const index = first + offset;
          const firstInRow = layout !== null && index % columns === 0;
          return (
            <GridItem
              key={product.id}
              product={product}
              position={index + 1}
              setSize={setSize}
              // The first card of a row measures the row: a grid row is as high as its tallest.
              measureRef={firstInRow ? virtualizer.measureElement : undefined}
              row={firstInRow ? index / columns : undefined}
              hasSlot={slottedCategoryIds?.has(product.category.id) ?? false}
            />
          );
        })}
      </ul>
      {moreHref === undefined ? null : (
        // Crawlers and pages without JavaScript go on by it; with JavaScript the list loads the
        // next batch itself, and the link stays last in the tab order, out of sight (plan §3.3).
        <Link
          href={moreHref}
          rel="next"
          prefetch={false}
          className={layout === null || showMore || moreFocused ? styles.more : styles.hidden}
          onFocus={() => setMoreFocused(true)}
          onBlur={() => setMoreFocused(false)}
        >
          Дальше
        </Link>
      )}
    </div>
  );
}
