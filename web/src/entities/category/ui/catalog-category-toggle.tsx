import type { ButtonHTMLAttributes } from 'react';

import { ChevronDownIcon, ChevronUpIcon } from '@/shared/ui';

import styles from './catalog-category-list.module.scss';

export interface CatalogCategoryToggleProps {
  // The current category's name, or "Все товары" on the catalog itself (spec 0020 W3).
  label: string;
  // Whether the list it opens shows; the page owns it (0009 K7).
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The id of the list it shows and hides.
  controls: string;
  // The button's own click and pointer handlers (the page's analytics).
  toggleEvents?: Pick<
    ButtonHTMLAttributes<HTMLButtonElement>,
    'onClick' | 'onPointerEnter' | 'onPointerLeave'
  >;
  className?: string;
}

// The phone bar's category (spec 0020 plan §2): a chevron and the current category; a tap shows
// the list of categories under the bar, the chevron turned up, and a second tap hides it.
export function CatalogCategoryToggle({
  label,
  open,
  onOpenChange,
  controls,
  toggleEvents,
  className,
}: CatalogCategoryToggleProps) {
  const Chevron = open ? ChevronUpIcon : ChevronDownIcon;
  return (
    <button
      type="button"
      {...toggleEvents}
      aria-expanded={open}
      aria-controls={controls}
      className={[styles.toggle, className].filter(Boolean).join(' ')}
      onClick={(event) => {
        toggleEvents?.onClick?.(event);
        onOpenChange(!open);
      }}
    >
      <Chevron />
      <span className={styles.toggleLabel}>{label}</span>
    </button>
  );
}
