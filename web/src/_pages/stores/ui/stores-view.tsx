'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { matchStores, type Store, StoreCard, type StoreList, useStores } from '@/entities/store';
import { track, useTrackedElement } from '@/shared/analytics';
import { errorText, reportFailure } from '@/shared/api';
import { CloseIcon, IconButton, SearchField, Skeleton, Tabs } from '@/shared/ui';
import { type MapFit, StoresMap } from '@/widgets/stores-map';

import styles from './stores-view.module.scss';

// `Stores Searched` goes after this pause in typing (spec 0022 X17).
export const SEARCH_PAUSE_MS = 1000;

type Tab = 'list' | 'map';

const START: MapFit = { kind: 'start' };

// The page's state (plan §3.3): the search text, the selected store, the open cards, the tab, the
// map's fit and the card shown over the map. The text lives in the field's DOM value and here,
// never in an attribute or the address (L9). From 1024px the list and the map are side by side
// (the search over the map's top from 1200px, above both below it); below 1024px they are the
// tabs «Список» and «Карта» (X10, X25): the kit's tabs only switch, and CSS hides the other one
// (`data-tab`), so the map never loads again and both show from 1024px, where the tab and the card
// over the map change nothing.
export function StoresView() {
  const { data: stores, error } = useStores();
  const [text, setText] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [tab, setTab] = useState<Tab>('list');
  const [fit, setFit] = useState<MapFit>(START);
  // The store whose card lies over the map after its pin's click (X19).
  const [overId, setOverId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

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

  const shown = useMemo(
    () => (stores === undefined ? [] : matchStores(stores, text)),
    [stores, text],
  );

  // The map fits what the search left (X7), back on Moscow for an empty text, once per change of
  // the set: typing on with the same stores left does not move it again.
  const shownKey = shown.map((store) => store.id).join();
  const [fittedKey, setFittedKey] = useState(shownKey);
  if (stores !== undefined && shownKey !== fittedKey) {
    setFittedKey(shownKey);
    setFit(text.trim() === '' ? START : { kind: 'stores', stores: shown });
    // A card over the map whose store the search left out does not come back with it.
    if (overId !== null && !shown.some((store) => store.id === overId)) setOverId(null);
  }

  const tracked = {
    pin: useTrackedElement('stores.pin'),
    list: useTrackedElement('stores.tab', { tab: 'list' }),
    map: useTrackedElement('stores.tab', { tab: 'map' }),
  };

  function setExpanded(id: string, expanded: boolean) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (expanded) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // A card's click marks the store, centres the map on it and, below 1024px, shows the map (X10).
  function selectCard(store: Store) {
    setSelectedId(store.id);
    setFit({ kind: 'store', store });
    setOverId(null);
    setTab('map');
  }

  // A pin's click marks its store and scrolls the list to its card; below 1024px its card lies
  // over the map instead (X19). The map stays where it is.
  function selectPin(id: string) {
    setSelectedId(id);
    setOverId(id);
    listRef.current
      ?.querySelector(`[data-store-id="${id}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // Shown again, the map fits once more: a fit made while it was hidden had no size to fit to.
  function changeTab(next: string) {
    if (next !== 'list' && next !== 'map') return;
    setTab(next);
    if (next === 'map') setFit((current) => ({ ...current }));
    tracked[next].onClick();
  }

  // The card over the map only centres the map on its store when clicked; it stays open.
  function storeItem(store: Store, onSelect = () => selectCard(store)) {
    return (
      <StoreItem
        store={store}
        selected={store.id === selectedId}
        expanded={expandedIds.has(store.id)}
        onSelect={onSelect}
        onExpandedChange={(expanded) => setExpanded(store.id, expanded)}
      />
    );
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
    list =
      shown.length === 0 ? (
        <p role="status" className={styles.message}>
          Ничего не нашлось
        </p>
      ) : (
        <ul className={styles.cards} aria-label="Магазины">
          {shown.map((store) => (
            <li key={store.id} data-store-id={store.id}>
              {storeItem(store)}
            </li>
          ))}
        </ul>
      );
  }

  const overStore = shown.find((store) => store.id === overId);

  return (
    <div className={styles.view} data-tab={tab}>
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
      <Tabs
        className={styles.tabs}
        size="m"
        aria-label="Магазины"
        value={tab}
        onValueChange={changeTab}
        items={[
          { value: 'list', label: 'Список' },
          { value: 'map', label: 'Карта' },
        ]}
      />
      <div ref={listRef} className={styles.list}>
        {list}
      </div>
      <div className={styles.map}>
        <StoresMap
          stores={shown}
          selectedId={selectedId}
          onSelect={selectPin}
          fit={fit}
          pinEvents={tracked.pin}
        />
        {overStore !== undefined && (
          <div className={styles.over}>
            <IconButton
              className={styles.close}
              size={44}
              variant="plain"
              aria-label="Закрыть карточку магазина"
              onClick={() => setOverId(null)}
            >
              <CloseIcon />
            </IconButton>
            {storeItem(overStore, () => setFit({ kind: 'store', store: overStore }))}
          </div>
        )}
      </div>
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

// The page's placeholder while the server reads the stores: below 1024px only the list's.
export function StoresSkeleton() {
  return (
    <div className={styles.view}>
      <div className={styles.search}>
        <Skeleton height={40} />
      </div>
      <div className={styles.list}>
        <ListSkeleton />
      </div>
      <div className={`${styles.map} ${styles.skeletonMap}`} />
    </div>
  );
}
