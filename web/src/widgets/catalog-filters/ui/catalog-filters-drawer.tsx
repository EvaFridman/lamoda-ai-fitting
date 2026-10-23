'use client';

import { hashKey, useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import {
  AttributeFilterPanel,
  BrandFilterPanel,
  ColorFilterPanel,
  defaultProductSort,
  DiscountFilterPanel,
  type FacetAttribute,
  filterSummary,
  PriceRangeFilterPanel,
  type ProductFacets,
  productFacetsOptions,
  productFilterTitles,
  ProductSortFilterPanel,
  SizeFilterPanel,
  splitFacetAttributes,
} from '@/entities/product';
import { useTrackedElement } from '@/shared/analytics';
import { formatAmount, plural } from '@/shared/lib';
import { Button, Drawer, FilterIcon, LinkButton } from '@/shared/ui';

import {
  attributeChoice,
  type CatalogFilterValue,
  hasSheetChoice,
  priceChoice,
  resetSheet,
  withAttributeChoice,
  withPriceChoice,
} from '../lib/filter-value';

import styles from './catalog-filters.module.scss';

const productForms = ['товар', 'товара', 'товаров'] as const;

// The draft's count is asked for once the choice has stood this long: a slider being dragged would
// otherwise ask at every step.
const countDelayMs = 300;

// Where the desktop row takes the drawer's place (`catalog-filters.module.scss`, O88).
const desktopQuery = '(width >= 1024px)';

const sheet = { surface: 'sheet' } as const;

// The list of filters, or the screen of one of them.
type Screen = 'list' | 'sort' | 'size' | 'brand' | 'price' | `attribute:${string}`;

export interface CatalogFiltersDrawerProps {
  // The filter counts of the applied selection: the sheet's rows. Until they load (or when they
  // fail) it has only the sort.
  facets?: ProductFacets;
  // The applied selection, from the address.
  value: CatalogFilterValue;
  onChange: (value: CatalogFilterValue) => void;
  // The page's category: the draft's count is counted within it.
  categoryId?: string;
}

// The phone form of the filters (spec 0020 plan §3, W6–W11): "Фильтры", with a dot while the
// address holds a choice, opens a bottom sheet of rows, one per filter with its chosen values in
// grey, then "Только со скидкой". A row opens its filter's screen in the same sheet. Choices are a
// draft: a screen edits a copy of it, "Применить" keeps the copy and "‹" drops it (W9); "Показать N
// товаров" applies the draft and closes the sheet, N being the draft's count of the filter counts;
// closing it otherwise drops the draft (AC13).
export function CatalogFiltersDrawer({
  facets,
  value,
  onChange,
  categoryId,
}: CatalogFiltersDrawerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  // The draft the count was last asked for; it catches up after `countDelayMs`.
  const [counted, setCounted] = useState(value);
  const [screen, setScreen] = useState<Screen>('list');
  // The draft the open screen edits.
  const [screenDraft, setScreenDraft] = useState(value);
  const showRef = useRef<HTMLButtonElement>(null);
  const applyRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef(new Map<Screen, HTMLButtonElement>());
  // The row a screen was opened from, for the focus on return; set only by a switch of screens.
  const returnRef = useRef<Screen | undefined>(undefined);
  const switchedRef = useRef(false);
  const active = hasSheetChoice(value);
  const trigger = useTrackedElement('catalog.sheet-open', { active });
  const rowEvents = {
    sort: useTrackedElement('catalog.sort', sheet),
    size: useTrackedElement('catalog.filter-size', sheet),
    brand: useTrackedElement('catalog.filter-brand', sheet),
    price: useTrackedElement('catalog.filter-price', sheet),
    colour: useTrackedElement('catalog.filter-color', sheet),
    attribute: useTrackedElement('catalog.filter-attribute', sheet),
    discount: useTrackedElement('catalog.filter-discount', sheet),
  };

  // The count's query for a selection within the page's category; the sort is not in its key.
  const countOptions = (selection: CatalogFilterValue) =>
    productFacetsOptions({
      ...selection,
      categoryId: categoryId === undefined ? undefined : [categoryId],
    });
  // The draft counts as counted while it differs only in the sort, which changes no count.
  const settled = hashKey(countOptions(counted).queryKey) === hashKey(countOptions(draft).queryKey);

  useEffect(() => {
    if (settled) return;
    const timer = setTimeout(() => setCounted(draft), countDelayMs);
    return () => clearTimeout(timer);
  }, [settled, draft]);

  // A window grown to the desktop row's width (a tablet turned) closes the sheet, whose button is
  // hidden there: the draft goes, as with any close.
  useEffect(() => {
    if (!open) return;
    const desktop = window.matchMedia(desktopQuery);
    const close = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false);
    };
    desktop.addEventListener('change', close);
    return () => desktop.removeEventListener('change', close);
  }, [open]);

  // The control that switched the screen is gone: a screen starts at its top with the focus on "‹"
  // (whose description is the title, so a screen reader hears the screen's name, AC14), and the
  // list gets it back on the row the screen was opened from.
  useEffect(() => {
    if (!switchedRef.current) return;
    switchedRef.current = false;
    if (screen === 'list') {
      const row =
        returnRef.current === undefined ? undefined : rowsRef.current.get(returnRef.current);
      row?.focus();
    } else {
      // The sheet's scrolling content is the parent of its first child.
      topRef.current?.parentElement?.scrollTo?.({ top: 0 });
      backRef.current?.focus();
    }
  }, [screen]);

  const count = useQuery({ ...countOptions(counted), enabled: open });
  const total = settled ? count.data?.total : undefined;

  // Opening starts at the list from the address's selection, whatever was chosen and not shown
  // last time.
  function openChange(next: boolean) {
    if (next) {
      setDraft(value);
      setCounted(value);
      setScreen('list');
    }
    setOpen(next);
  }

  function show() {
    onChange(draft);
    setOpen(false);
  }

  // The footer's "Сбросить" (W11): the filters and the sort go from the draft, the search stays.
  // It goes inactive with them, so the focus moves to "Показать" (0014 O90).
  function reset() {
    const next = resetSheet(draft);
    setDraft(next);
    setCounted(next);
    showRef.current?.focus();
  }

  function openScreen(next: Screen) {
    setScreenDraft(draft);
    returnRef.current = next;
    switchedRef.current = true;
    setScreen(next);
  }

  function closeScreen(apply: boolean) {
    if (apply) setDraft(screenDraft);
    switchedRef.current = true;
    setScreen('list');
  }

  const rows = filterRows(facets, draft);
  const shown = screen === 'list' ? undefined : rows.find((row) => row.screen === screen);
  // The open screen's filter left the counts (a refetch dropped the attribute): the list shows, and
  // the sheet goes back to it as by "‹", so it does not jump back to the screen when they return.
  if (screen !== 'list' && shown === undefined) setScreen('list');
  const sortScreen = shown?.screen === 'sort';
  // A sheet whose draft holds neither a filter nor a sort has nothing to reset; the search is not
  // the sheet's.
  const resettable = hasSheetChoice({ ...draft, q: undefined });

  return (
    <Drawer
      side="bottom"
      fullHeight
      title={shown?.title ?? 'Фильтры'}
      trigger={
        <button type="button" className={styles.trigger} {...trigger}>
          <FilterIcon />
          Фильтры
          {active ? <span className={styles.dot} aria-hidden="true" /> : null}
        </button>
      }
      open={open}
      onOpenChange={openChange}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) setScreen('list');
      }}
      {...(shown === undefined
        ? {
            footer: (
              <>
                <Button
                  variant="outline"
                  className={styles.footerSide}
                  disabled={!resettable}
                  onClick={reset}
                >
                  Сбросить
                </Button>
                <Button ref={showRef} className={styles.footerMain} onClick={show}>
                  {total === undefined
                    ? 'Показать товары'
                    : `Показать ${formatAmount(total)} ${plural(total, productForms)}`}
                </Button>
              </>
            ),
          }
        : {
            onBack: () => closeScreen(false),
            backLabel: 'Назад к фильтрам',
            backRef,
            closable: false,
            headerAction: shown.clearsOnScreen ? (
              <LinkButton onClick={() => setScreenDraft((current) => shown.clear(current))}>
                Сбросить
              </LinkButton>
            ) : undefined,
            footer: (
              <>
                {sortScreen ? (
                  <Button
                    variant="outline"
                    className={styles.footerSide}
                    disabled={screenDraft.sort === undefined}
                    // It goes inactive with its choice, so the focus moves to "Применить".
                    onClick={() => {
                      setScreenDraft((current) => ({ ...current, sort: undefined }));
                      applyRef.current?.focus();
                    }}
                  >
                    По умолчанию
                  </Button>
                ) : null}
                <Button
                  ref={applyRef}
                  className={styles.footerMain}
                  onClick={() => closeScreen(true)}
                >
                  Применить
                </Button>
              </>
            ),
          })}
    >
      <div ref={topRef} />
      {shown === undefined ? (
        <>
          <ul className={styles.rows}>
            {rows.map((row) => (
              <li key={row.screen} className={styles.sheetRow}>
                <button
                  type="button"
                  ref={(element) => {
                    if (element) rowsRef.current.set(row.screen, element);
                    else rowsRef.current.delete(row.screen);
                  }}
                  className={styles.rowButton}
                  {...rowEvents[row.events]}
                  onClick={() => {
                    rowEvents[row.events].onClick();
                    // The row goes with the screen, so no pointer will leave it: a hover started on
                    // it ends here.
                    rowEvents[row.events].onPointerLeave();
                    openScreen(row.screen);
                  }}
                >
                  <span className={styles.rowTitle}>{row.title}</span>
                  {row.summary === undefined ? null : (
                    <span className={styles.rowSummary}>{row.summary}</span>
                  )}
                </button>
                {row.chosen ? (
                  <LinkButton
                    className={styles.rowReset}
                    aria-label={`Сбросить: ${row.title}`}
                    // It goes with the choice, so the focus stays on its row.
                    onClick={() => {
                      setDraft((current) => row.clear(current));
                      rowsRef.current.get(row.screen)?.focus();
                    }}
                  >
                    Сбросить
                  </LinkButton>
                ) : null}
              </li>
            ))}
          </ul>
          {facets === undefined ? null : (
            // The hover is the whole row's, as the other rows'; a click on the label reaches the
            // switch's hidden input, not the switch, so the change, wherever it came from, is the
            // click.
            <div
              className={styles.drawerDiscount}
              onPointerEnter={rowEvents.discount.onPointerEnter}
              onPointerLeave={rowEvents.discount.onPointerLeave}
            >
              <DiscountFilterPanel
                checked={draft.hasDiscount === true}
                onCheckedChange={(checked) => {
                  rowEvents.discount.onClick();
                  setDraft((current) => ({ ...current, hasDiscount: checked ? true : undefined }));
                }}
              />
            </div>
          )}
        </>
      ) : (
        shown.panel(screenDraft, setScreenDraft)
      )}
    </Drawer>
  );
}

type SetSelection = (update: (current: CatalogFilterValue) => CatalogFilterValue) => void;

interface FilterRow {
  screen: Exclude<Screen, 'list'>;
  // The row's name and its screen's title.
  title: string;
  // The draft's choice in grey after the name; undefined when nothing is shown.
  summary?: string;
  // The draft holds a choice for this filter: the row's "Сбросить" shows.
  chosen: boolean;
  // The selection without this filter's choice.
  clear: (selection: CatalogFilterValue) => CatalogFilterValue;
  // A list of values has "Сбросить" at the top of its screen; the sort and the price do not.
  clearsOnScreen: boolean;
  // Which tracked element the row is (W15).
  events: 'sort' | 'size' | 'brand' | 'price' | 'colour' | 'attribute';
  // The screen's content, editing `selection`.
  panel: (selection: CatalogFilterValue, change: SetSelection) => ReactNode;
}

// The rows in Lamoda's order: the sort, the size, the colours, the price, the brand, the other
// attributes (plan §3). Until the counts load, the sort alone.
function filterRows(facets: ProductFacets | undefined, draft: CatalogFilterValue): FilterRow[] {
  const sort: FilterRow = {
    screen: 'sort',
    title: productFilterTitles.sort,
    summary: filterSummary.sort(draft.sort ?? defaultProductSort),
    chosen: draft.sort !== undefined,
    clear: (selection) => ({ ...selection, sort: undefined }),
    clearsOnScreen: false,
    events: 'sort',
    panel: (selection, change) => (
      <ProductSortFilterPanel
        layout="sheet"
        value={selection.sort ?? defaultProductSort}
        onValueChange={(next) =>
          change((current) => ({
            ...current,
            sort: next === defaultProductSort ? undefined : next,
          }))
        }
      />
    ),
  };
  if (facets === undefined) return [sort];

  const { colours, others } = splitFacetAttributes(facets.attributes);
  const { price } = facets;
  const attributeRow = (attribute: FacetAttribute, colour: boolean): FilterRow => {
    const chosen = attributeChoice(draft, attribute);
    return {
      screen: `attribute:${attribute.id}`,
      title: attribute.name,
      summary: filterSummary.attribute(attribute, chosen),
      chosen: chosen.length > 0,
      clear: (selection) => withAttributeChoice(selection, attribute, []),
      clearsOnScreen: true,
      events: colour ? 'colour' : 'attribute',
      panel: (selection, change) => {
        const props = {
          attribute,
          layout: 'sheet' as const,
          value: attributeChoice(selection, attribute),
          onValueChange: (next: string[]) =>
            change((current) => withAttributeChoice(current, attribute, next)),
        };
        return colour ? (
          <ColorFilterPanel {...props} selectAll />
        ) : (
          <AttributeFilterPanel {...props} />
        );
      },
    };
  };

  const size: FilterRow = {
    screen: 'size',
    title: productFilterTitles.size,
    summary: filterSummary.size(facets.sizes, draft.size ?? []),
    chosen: (draft.size?.length ?? 0) > 0,
    clear: (selection) => ({ ...selection, size: undefined }),
    clearsOnScreen: true,
    events: 'size',
    panel: (selection, change) => (
      <SizeFilterPanel
        layout="sheet"
        sizes={facets.sizes}
        value={[...(selection.size ?? [])]}
        onValueChange={(next) =>
          change((current) => ({ ...current, size: next.length > 0 ? next : undefined }))
        }
      />
    ),
  };
  const brand: FilterRow = {
    screen: 'brand',
    title: productFilterTitles.brand,
    summary: filterSummary.brand(facets.brands, draft.brandId ?? []),
    chosen: (draft.brandId?.length ?? 0) > 0,
    clear: (selection) => ({ ...selection, brandId: undefined }),
    clearsOnScreen: true,
    events: 'brand',
    panel: (selection, change) => (
      <BrandFilterPanel
        layout="sheet"
        brands={facets.brands}
        value={[...(selection.brandId ?? [])]}
        onValueChange={(next) =>
          change((current) => ({ ...current, brandId: next.length > 0 ? next : undefined }))
        }
      />
    ),
  };
  const priceRow: FilterRow[] =
    price === null
      ? []
      : [
          {
            screen: 'price',
            title: productFilterTitles.price,
            summary: filterSummary.price(price, priceChoice(draft, price)),
            chosen: draft.minPrice !== undefined || draft.maxPrice !== undefined,
            clear: (selection) => ({ ...selection, minPrice: undefined, maxPrice: undefined }),
            clearsOnScreen: false,
            events: 'price',
            panel: (selection, change) => (
              <PriceRangeFilterPanel
                price={price}
                value={priceChoice(selection, price)}
                onValueChange={(range) =>
                  change((current) => withPriceChoice(current, price, range))
                }
              />
            ),
          },
        ];

  return [
    sort,
    size,
    ...colours.map((attribute) => attributeRow(attribute, true)),
    ...priceRow,
    brand,
    ...others.map((attribute) => attributeRow(attribute, false)),
  ];
}
