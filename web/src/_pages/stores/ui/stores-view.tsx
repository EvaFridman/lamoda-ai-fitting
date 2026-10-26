'use client';

import { useEffect, useRef, useState } from 'react';

import { matchStores, type Store, StoreCard, type StoreList, useStores } from '@/entities/store';
import { track, useTrackedElement } from '@/shared/analytics';
import { errorText, reportFailure } from '@/shared/api';
import { SearchField, Skeleton } from '@/shared/ui';

import styles from './stores-view.module.scss';

// `Stores Searched` goes after this pause in typing (spec 0022 X17).
export const SEARCH_PAUSE_MS = 1000;

// The page's state (plan §3.3): the search text, the selected store and the open cards. The text
// lives in the field's DOM value and here, never in an attribute or the address (L9). The search
// field sits over the map's place on a wide screen, above the list and the map below 1200px; the
// map comes with T10.
export function StoresView() {
  const { data: stores, error } = useStores();
  const [text, setText] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());

  // Text already in the field when React takes over (typed before hydration, restored by the
  // browser) fires no change: read it once.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const restored = searchRef.current?.value ?? '';
    if (restored !== '') setText(restored);
  }, []);

  useEffect(() => {
    if (error !== null) reportFailure(error);
  }, [error]);

  useSearchedEvent(text, stores);

  function setExpanded(id: string, expanded: boolean) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (expanded) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  let list;
  if (stores === undefined) {
    list =
      error === null ? (
        <ListSkeleton />
      ) : (
        <p role="alert" className={styles.message}>
          {errorText(error)}
        </p>
      );
  } else {
    const shown = matchStores(stores, text);
    list =
      shown.length === 0 ? (
        <p role="status" className={styles.message}>
          Ничего не нашлось
        </p>
      ) : (
        <ul className={styles.cards} aria-label="Магазины">
          {shown.map((store) => (
            <li key={store.id}>
              <StoreItem
                store={store}
                selected={store.id === selectedId}
                expanded={expandedIds.has(store.id)}
                onSelect={() => setSelectedId(store.id)}
                onExpandedChange={(expanded) => setExpanded(store.id, expanded)}
              />
            </li>
          ))}
        </ul>
      );
  }

  return (
    <div className={styles.view}>
      <div className={styles.search}>
        <SearchField
          ref={searchRef}
          // The browser restores unnamed fields by their order, and the streamed list comes after
          // the header's search: on Back this text landed there. Not kept for restoring at all.
          autoComplete="off"
          label="Магазин, адрес или метро"
          placeholder="Магазин, адрес или метро"
          onValueChange={setText}
        />
      </div>
      <div className={styles.list}>{list}</div>
      <div className={styles.map} />
    </div>
  );
}

interface StoreItemProps {
  store: Store;
  selected: boolean;
  expanded: boolean;
  onSelect: () => void;
  onExpandedChange: (expanded: boolean) => void;
}

// One card with its tracked elements; nothing names the store (X17).
function StoreItem(props: StoreItemProps) {
  const events = {
    card: useTrackedElement('stores.card'),
    details: useTrackedElement('stores.details', { expanded: !props.expanded }),
    phone: useTrackedElement('stores.phone'),
    route: useTrackedElement('stores.route'),
  };
  return <StoreCard {...props} events={events} />;
}

// `Stores Searched` once the text has rested for `SEARCH_PAUSE_MS`: not for an empty text or the
// text sent last, and only once the stores are there to count. The text itself is not sent.
function useSearchedEvent(text: string, stores: StoreList | undefined) {
  const lastSentRef = useRef('');
  useEffect(() => {
    const query = text.trim();
    if (stores === undefined || query === '' || query === lastSentRef.current) return;
    const timer = setTimeout(() => {
      lastSentRef.current = query;
      track('Stores Searched', {
        query_length: query.length,
        results: matchStores(stores, query).length,
      });
    }, SEARCH_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [text, stores]);
}

function ListSkeleton() {
  return (
    <div className={styles.cards} aria-busy="true">
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} height={112} />
      ))}
    </div>
  );
}

// The page's placeholder while the server reads the stores.
export function StoresSkeleton() {
  return (
    <div className={styles.view}>
      <div className={styles.search}>
        <Skeleton height={40} />
      </div>
      <div className={styles.list}>
        <ListSkeleton />
      </div>
      <div className={styles.map} />
    </div>
  );
}
