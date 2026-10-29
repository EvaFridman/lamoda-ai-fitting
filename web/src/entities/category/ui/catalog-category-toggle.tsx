import type { ButtonHTMLAttributes, Ref } from 'react';

import { ChevronDownIcon, ChevronUpIcon } from '@/shared/ui';

import styles from './catalog-category-list.module.scss';

export interface CatalogCategoryToggleProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  // The current category's name, or "Все товары" on the catalog itself (spec 0020 W3).
  label: string;
  // Whether the sheet it opens shows; the page owns it (0009 K7).
  open: boolean;
  ref?: Ref<HTMLButtonElement>;
}

// The phone bar's category (spec 0024 Z3): a chevron and the current category. The page renders
// it as the trigger of its sheet of categories, which passes its own props (the click, the
// dialog's attributes, the ref) through; the chevron turns up while the sheet is open.
export function CatalogCategoryToggle({
  label,
  open,
  className,
  ref,
  ...button
}: CatalogCategoryToggleProps) {
  const Chevron = open ? ChevronUpIcon : ChevronDownIcon;
  return (
    <button
      type="button"
      ref={ref}
      aria-expanded={open}
      {...button}
      className={[styles.toggle, className].filter(Boolean).join(' ')}
    >
      <Chevron />
      <span className={styles.toggleLabel}>{label}</span>
    </button>
  );
}
