'use client';

import { hashKey, useQuery } from '@tanstack/react-query';
import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from 'react';

import {
  AttributeFilterPanel,
  BrandFilterPanel,
  ColorFilterPanel,
  defaultProductSort,
  DiscountFilterPanel,
  PriceRangeFilterPanel,
  type ProductFacets,
  productFacetsOptions,
  productFilterTitles,
  ProductSortFilterPanel,
  SizeFilterPanel,
  splitFacetAttributes,
} from '@/entities/product';
import { plural } from '@/shared/lib';
import { Accordion, type AccordionItem, Button, Drawer, LinkButton } from '@/shared/ui';

import {
  attributeChoice,
  type CatalogFilterValue,
  clearFilters,
  hasAppliedFilters,
  priceChoice,
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

export interface CatalogFiltersDrawerProps {
  // The filter counts of the applied selection: the drawer's lists. Until they load (or when they
  // fail) it has only the sort.
  facets?: ProductFacets;
  // The applied selection, from the address.
  value: CatalogFilterValue;
  onChange: (value: CatalogFilterValue) => void;
  // The page's category: the draft's count is counted within it.
  categoryId?: string;
}

// The phone form of the filters (spec 0014 O6, O88): "Фильтры" opens a bottom sheet with the sort
// and every filter as a section of an accordion, then "Только со скидкой". Choices there are a
// draft: "Показать N товаров" applies it and closes the sheet, N being the draft's count of the
// filter counts; closing it otherwise drops the draft. "Очистить фильтры" applies at once, as the
// desktop row's link does.
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
  const showRef = useRef<HTMLButtonElement>(null);

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

  const count = useQuery({ ...countOptions(counted), enabled: open });
  const total = settled ? count.data?.total : undefined;

  // Opening starts from the address's selection, whatever was chosen and not shown last time.
  function openChange(next: boolean) {
    if (next) {
      setDraft(value);
      setCounted(value);
    }
    setOpen(next);
  }

  function show() {
    onChange(draft);
    setOpen(false);
  }

  // As the desktop row's link: the filters and the search go, applied at once when the address has
  // any, and the sort stays, the applied one in the address and the chosen one in the draft. The
  // link goes away with them, so the focus moves to "Показать".
  function clear() {
    if (hasAppliedFilters(value)) onChange(clearFilters(value));
    const next = clearFilters(draft);
    setDraft(next);
    setCounted(next);
    showRef.current?.focus();
  }

  return (
    <Drawer
      side="bottom"
      title="Фильтры"
      trigger={<Button variant="outline">Фильтры</Button>}
      open={open}
      onOpenChange={openChange}
      footer={
        <>
          {hasAppliedFilters(value) || hasAppliedFilters(draft) ? (
            <LinkButton className={styles.drawerClear} onClick={clear}>
              Очистить фильтры
            </LinkButton>
          ) : null}
          <Button ref={showRef} fullWidth onClick={show}>
            {total === undefined
              ? 'Показать товары'
              : `Показать ${total} ${plural(total, productForms)}`}
          </Button>
        </>
      }
    >
      <Accordion multiple items={sections(facets, draft, setDraft)} />
      {facets === undefined ? null : (
        <div className={styles.drawerDiscount}>
          <DiscountFilterPanel
            checked={draft.hasDiscount === true}
            onCheckedChange={(checked) =>
              setDraft((current) => ({ ...current, hasDiscount: checked ? true : undefined }))
            }
          />
        </div>
      )}
    </Drawer>
  );
}

// The sort, then the filters in 0009's order, each a section titled with the filter's name.
function sections(
  facets: ProductFacets | undefined,
  draft: CatalogFilterValue,
  setDraft: Dispatch<SetStateAction<CatalogFilterValue>>,
): AccordionItem[] {
  // From the latest draft, not this render's: a slider reports several moves between renders.
  const change = (patch: Partial<CatalogFilterValue>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const sort: AccordionItem = {
    value: 'sort',
    title: productFilterTitles.sort,
    content: (
      <ProductSortFilterPanel
        value={draft.sort ?? defaultProductSort}
        onValueChange={(next) => change({ sort: next === defaultProductSort ? undefined : next })}
      />
    ),
  };
  if (facets === undefined) return [sort];

  const { colours, others } = splitFacetAttributes(facets.attributes);
  const { price } = facets;
  return [
    sort,
    ...colours.map((attribute) => ({
      value: `attribute-${attribute.id}`,
      title: attribute.name,
      content: (
        <ColorFilterPanel
          attribute={attribute}
          value={attributeChoice(draft, attribute)}
          onValueChange={(chosen) =>
            setDraft((current) => withAttributeChoice(current, attribute, chosen))
          }
        />
      ),
    })),
    ...others.map((attribute) => ({
      value: `attribute-${attribute.id}`,
      title: attribute.name,
      content: (
        <AttributeFilterPanel
          attribute={attribute}
          value={attributeChoice(draft, attribute)}
          onValueChange={(chosen) =>
            setDraft((current) => withAttributeChoice(current, attribute, chosen))
          }
        />
      ),
    })),
    {
      value: 'brand',
      title: productFilterTitles.brand,
      content: (
        <BrandFilterPanel
          brands={facets.brands}
          value={[...(draft.brandId ?? [])]}
          onValueChange={(brandId) => change({ brandId: brandId.length > 0 ? brandId : undefined })}
        />
      ),
    },
    {
      value: 'size',
      title: productFilterTitles.size,
      content: (
        <SizeFilterPanel
          sizes={facets.sizes}
          value={[...(draft.size ?? [])]}
          onValueChange={(size) => change({ size: size.length > 0 ? size : undefined })}
        />
      ),
    },
    ...(price === null
      ? []
      : [
          {
            value: 'price',
            title: productFilterTitles.price,
            content: (
              <PriceRangeFilterPanel
                price={price}
                value={priceChoice(draft, price)}
                onValueChange={(range) =>
                  setDraft((current) => withPriceChoice(current, price, range))
                }
              />
            ),
          },
        ]),
  ];
}
