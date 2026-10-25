'use client';

import { useSearchParams } from 'next/navigation';
import {
  createContext,
  type ReactNode,
  type RefObject,
  use,
  useEffect,
  useRef,
  useState,
} from 'react';

import { useTrackedElement } from '@/shared/analytics';
import { IconButton, SearchIcon } from '@/shared/ui';

import styles from './header.module.scss';

const ROW_ID = 'header-search';

// The loupe's choice, for the query it was made on: a new `q` in the address drops it.
interface Choice {
  query: string;
  open: boolean;
}

interface SearchToggle {
  choice: Choice | null;
  setChoice: (choice: Choice) => void;
  // Set by the loupe that opens the row: the row then focuses its field.
  focusRef: RefObject<boolean>;
}

const SearchToggleContext = createContext<SearchToggle | null>(null);

// The phone row's loupe opens and closes the search row under the header (spec 0019 A87.5). The
// two are apart in the header (the loupe after the burger, in the tab order too), so they share
// the loupe's choice here; it reads no URL, so the header stays static around it. It is the
// header's grid, a `div` of `className`.
export function HeaderSearchToggleProvider({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const [choice, setChoice] = useState<Choice | null>(null);
  const focusRef = useRef(false);
  return (
    <SearchToggleContext value={{ choice, setChoice, focusRef }}>
      <div className={className}>{children}</div>
    </SearchToggleContext>
  );
}

// Open while `q` is in the address, until the loupe closes it; a new query opens it again.
function useSearchRow(): { open: boolean; query: string } & SearchToggle {
  const toggle = use(SearchToggleContext);
  if (!toggle) throw new Error('HeaderSearchToggleProvider is missing');
  const query = useSearchParams().get('q') ?? '';
  const open =
    toggle.choice !== null && toggle.choice.query === query ? toggle.choice.open : query !== '';
  return { ...toggle, open, query };
}

// Hidden from 600px. Render it inside <Suspense>: it reads the query.
export function HeaderLoupe() {
  const { open, query, setChoice, focusRef } = useSearchRow();
  const tracked = useTrackedElement('header.search', { expanded: !open });
  return (
    <IconButton
      aria-label="Поиск"
      variant="plain"
      aria-expanded={open}
      aria-controls={ROW_ID}
      className={styles.loupe}
      onClick={() => {
        tracked.onClick();
        focusRef.current = !open;
        setChoice({ query, open: !open });
      }}
      onPointerEnter={tracked.onPointerEnter}
      onPointerLeave={tracked.onPointerLeave}
    >
      <SearchIcon />
    </IconButton>
  );
}

// The search field's row: below 600px shown only while open, from 600px always. It stays mounted
// while closed, so the field keeps what was typed. Render it inside <Suspense>: it reads the query.
export function HeaderSearchRow({ children }: { children: ReactNode }) {
  const { open, focusRef } = useSearchRow();
  const rowRef = useRef<HTMLDivElement>(null);

  // Opened by the loupe, the field takes the focus, so the keyboard comes up on a phone.
  useEffect(() => {
    if (!open || !focusRef.current) return;
    focusRef.current = false;
    rowRef.current?.querySelector('input')?.focus();
  }, [open, focusRef]);

  return (
    <div ref={rowRef} id={ROW_ID} className={styles.search} data-open={open ? '' : undefined}>
      {children}
    </div>
  );
}
