'use client';

import { type AnchorHTMLAttributes, type ButtonHTMLAttributes, useState } from 'react';

import {
  type CatalogCategory,
  CatalogCategoryList,
  CatalogCategoryToggle,
} from '@/entities/category';
import { Sheet } from '@/shared/ui';

type Events<T extends HTMLElement> = Pick<
  ButtonHTMLAttributes<T> & AnchorHTMLAttributes<T>,
  'onClick' | 'onPointerEnter' | 'onPointerLeave'
>;

export interface CatalogCategorySheetProps {
  // The toggle's text: the current category's name, or "Все товары" on the catalog itself.
  label: string;
  categories: CatalogCategory[];
  // The chosen category's id, or null on the catalog itself.
  value: string | null;
  getHref: (id: string) => string;
  // The first row «Все товары»: the catalog with the query kept, and its count.
  all: { href: string; count: number };
  toggleEvents?: Events<HTMLButtonElement>;
  linkEvents?: Events<HTMLAnchorElement>;
  className?: string;
}

// The phone bar's categories (spec 0024 Z3): the toggle opens the kit's bottom sheet «Категории»
// over the page, so the grid never moves. A row is a link that keeps the query; a choice closes
// the sheet (a category's page mounts anew anyway, the chosen row's does not), and a swipe, the
// backdrop or Esc close it with the focus back on the toggle.
export function CatalogCategorySheet({
  label,
  categories,
  value,
  getHref,
  all,
  toggleEvents,
  linkEvents,
  className,
}: CatalogCategorySheetProps) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      title="Категории"
      open={open}
      onOpenChange={setOpen}
      trigger={
        <CatalogCategoryToggle {...toggleEvents} className={className} label={label} open={open} />
      }
    >
      <CatalogCategoryList
        layout="rows"
        aria-label="Список категорий"
        categories={categories}
        value={value}
        getHref={getHref}
        all={all}
        linkEvents={{
          ...linkEvents,
          onClick: (event) => {
            linkEvents?.onClick?.(event);
            setOpen(false);
          },
        }}
      />
    </Sheet>
  );
}
