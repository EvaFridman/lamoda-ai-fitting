'use client';

import { Popover } from '@base-ui/react/popover';
import { createContext, type ReactNode, use, useId, useRef, useState } from 'react';

import { FilterChipTrigger } from '../filter-chip/filter-chip';

import styles from './filter-dropdown.module.scss';

export interface FilterDropdownProps {
  // The filter's name on the chip ("Стиль").
  title: string;
  // The name of the dropdown and of its list for screen readers, when the title is not one: the
  // sort chip shows the chosen order, its list is "Сортировка". By default, the title.
  label?: string;
  // The chosen value shown after the title on an applied chip ("вечерний").
  value?: string;
  // Black chip; by default, applied while `value` is not empty. The sort chip, whose title is the
  // chosen order, sets it on its own.
  applied?: boolean;
  // Given, an applied chip ends in a × that calls it.
  onClear?: () => void;
  // Open from the first render. Such a dropdown leaves the focus where it is: it was not opened by
  // the visitor, and taking the focus would also scroll the page to it.
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  // A CheckboxFilter, a SortFilter or other content of the dropdown.
  children: ReactNode;
}

interface FilterDropdownContext {
  // The name of the dropdown, for its list.
  label: string;
  // Closes the dropdown; the focus goes back to the chip.
  close: () => void;
}

const FilterDropdownContext = createContext<FilterDropdownContext | null>(null);

// Lets the content of a dropdown name its list after the dropdown and close it. Outside a
// FilterDropdown the list would have no name and nothing to close: that is a mistake, so it throws.
export function useFilterDropdown(component: string): FilterDropdownContext {
  const context = use(FilterDropdownContext);
  if (context === null) throw new Error(`${component} lives inside a FilterDropdown`);
  return context;
}

// A filter chip with its dropdown (Base UI Popover). Enter, Space or a click on the chip opens it
// and moves the focus inside; Esc, a click outside or the content's own action (CheckboxFilter's
// "Применить", a SortFilter pick) closes it, and the focus returns to the chip. The dropdown's
// content mounts on opening, so a pick that was not applied is gone when it opens again.
export function FilterDropdown({
  title,
  label = title,
  value,
  applied = Boolean(value),
  onClear,
  defaultOpen = false,
  onOpenChange,
  children,
}: FilterDropdownProps) {
  const actionsRef = useRef<Popover.Root.Actions>(null);
  const triggerId = useId();
  // False only while a dropdown open from the start has not been opened by the visitor.
  const [focusOnOpen, setFocusOnOpen] = useState(!defaultOpen);

  return (
    <Popover.Root
      actionsRef={actionsRef}
      defaultOpen={defaultOpen}
      defaultTriggerId={defaultOpen ? triggerId : undefined}
      onOpenChange={(open) => {
        setFocusOnOpen(true);
        onOpenChange?.(open);
      }}
    >
      <FilterChipTrigger
        id={triggerId}
        title={title}
        value={value}
        applied={applied}
        onClear={onClear}
      />
      <Popover.Portal>
        <Popover.Positioner className={styles.positioner} align="start" sideOffset={4}>
          <Popover.Popup className={styles.popup} aria-label={label} initialFocus={focusOnOpen}>
            <FilterDropdownContext value={{ label, close: () => actionsRef.current?.close() }}>
              {children}
            </FilterDropdownContext>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
