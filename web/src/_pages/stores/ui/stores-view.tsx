'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import {
  matchStores,
  type Store,
  StoreCard,
  storeCities,
  storesOfCity,
  useStores,
} from '@/entities/store';
import { CityModal, useAskCityOnce, useCity, useCityOpenEvents } from '@/features/choose-city';
import { track, useTrackedElement } from '@/shared/analytics';
import { errorText, reportFailure } from '@/shared/api';
import {
  Chip,
  ChipGroup,
  CloseIcon,
  IconButton,
  LinkButton,
  SearchField,
  Skeleton,
  Tabs,
} from '@/shared/ui';
import { CITY_ZOOM, type MapFit, StoresMap } from '@/widgets/stores-map';

import styles from './stores-view.module.scss';

// `Stores Searched` goes after this pause in typing (spec 0022 X17).
export const SEARCH_PAUSE_MS = 1000;
// The list and the map follow the text after this pause; an empty text at once (spec 0026 C12).
export const SEARCH_APPLY_MS = 300;

type Tab = 'list' | 'map';
// The chosen city's stores or every store (spec 0026 C3): a view only, `city` on each open.
type Scope = 'city' | 'all';

const START: MapFit = { kind: 'start' };

// The page's state (plan §3.3): the search text, the selected store, the open cards, the tab, the
// map's fit and the card shown over the map. The text lives in the field's DOM value and here,
// never in an attribute or the address (L9). From 1024px the list and the map are side by side
// (the search over the map's top from 1200px, above both below it); below 1024px they are the
// tabs «Список» and «Карта» (X10, X25): the kit's tabs only switch, and CSS hides the other one
// (`data-tab`), so the map never loads again and both show from 1024px, where the tab and the card
// over the map change nothing. With a city chosen (spec 0026 plan §5) the page shows its stores
// and the map on them, «Все города» every store; the page asks for the position once (C6).
export function StoresView() {
  const { data: stores, error } = useStores();
  const cities = useMemo(() => (stores === undefined ? undefined : storeCities(stores)), [stores]);
  const city = useCity(cities);
  const far = useAskCityOnce(cities);
  const [view, setView] = useState<Scope>('city');
  // A city chosen anywhere, also in another tab, shows its stores again.
  const [seenCity, setSeenCity] = useState(city);
  if (city !== seenCity) {
    setSeenCity(city);
    setView('city');
  }
  const scope: Scope = typeof city === 'string' && view === 'city' ? 'city' : 'all';
  const [cityOpen, setCityOpen] = useState(false);
  const cityButtonRef = useRef<HTMLButtonElement>(null);
  const [text, setText] = useState('');
  const [applied, setApplied] = useState('');
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
    if (restored === '') return;
    setText(restored);
    setApplied(restored);
  }, []);

  // The text the list and the map follow, after a pause in typing (C12).
  useEffect(() => {
    const timer = setTimeout(() => setApplied(text), SEARCH_APPLY_MS);
    return () => clearTimeout(timer);
  }, [text]);
  const query = text.trim() === '' ? '' : applied;

  useEffect(() => {
    if (error !== null) reportFailure(error);
  }, [error]);

  // What the page shows before the search: the city's stores or every one.
  const pool = useMemo(() => {
    if (stores === undefined) return undefined;
    return scope === 'city' && typeof city === 'string' ? storesOfCity(stores, city) : stores;
  }, [stores, scope, city]);

  useSearchedEvent(text, pool, scope);

  const shown = useMemo(() => (pool === undefined ? [] : matchStores(pool, query)), [pool, query]);

  // The map fits what the search left (X7), back on the city's stores or Moscow for an empty text,
  // once per change of the set: typing on with the same stores left does not move it again.
  const searching = query.trim() !== '';
  const shownKey = `${scope}:${searching}:${shown.map((store) => store.id).join()}`;
  const [fittedKey, setFittedKey] = useState(shownKey);
  if (stores !== undefined && shownKey !== fittedKey) {
    setFittedKey(shownKey);
    if (searching) setFit({ kind: 'stores', stores: shown });
    else
      setFit(scope === 'city' ? { kind: 'stores', stores: shown, singleZoom: CITY_ZOOM } : START);
    // A card over the map whose store the search left out does not come back with it.
    if (overId !== null && !shown.some((store) => store.id === overId)) setOverId(null);
  }

  const tracked = {
    pin: useTrackedElement('stores.pin'),
    list: useTrackedElement('stores.tab', { tab: 'list' }),
    map: useTrackedElement('stores.tab', { tab: 'map' }),
    scopeCity: useTrackedElement('stores.scope', { scope: 'city' }),
    scopeAll: useTrackedElement('stores.scope', { scope: 'all' }),
    searchAll: useTrackedElement('stores.search-all'),
    openCity: useCityOpenEvents('stores', cities),
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
        <div className={styles.empty}>
          <p role="status" className={styles.message}>
            Ничего не нашлось
          </p>
          {scope === 'city' && (
            <LinkButton
              onClick={() => {
                tracked.searchAll.onClick();
                setView('all');
              }}
              onPointerEnter={tracked.searchAll.onPointerEnter}
              onPointerLeave={tracked.searchAll.onPointerLeave}
            >
              Искать во всех городах
            </LinkButton>
          )}
        </div>
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
      {/* Until the stored city is read (the server, hydration), the row keeps its place. */}
      {cities === undefined || city === undefined ? (
        stores === undefined && error !== null ? null : (
          <CityRowSkeleton />
        )
      ) : (
        <div className={styles.city}>
          {typeof city === 'string' && (
            <ChipGroup
              aria-label="Какие магазины показать"
              multiple={false}
              value={[view]}
              onValueChange={([next]) => {
                if (next === undefined || next === view) return;
                tracked[next === 'city' ? 'scopeCity' : 'scopeAll'].onClick();
                setView(next);
              }}
            >
              <Chip value="city">{city}</Chip>
              <Chip value="all">Все города</Chip>
            </ChipGroup>
          )}
          <LinkButton
            ref={cityButtonRef}
            onClick={() => {
              tracked.openCity.onClick();
              setCityOpen(true);
            }}
            onPointerEnter={tracked.openCity.onPointerEnter}
            onPointerLeave={tracked.openCity.onPointerLeave}
          >
            {typeof city === 'string' ? 'Изменить город' : 'Выбрать город'}
          </LinkButton>
          <CityModal
            cities={cities}
            open={cityOpen}
            onOpenChange={setCityOpen}
            finalFocus={() => cityButtonRef.current}
            // Even the city already chosen shows its stores again.
            onChosen={() => setView('city')}
          />
        </div>
      )}
      <div className={styles.search}>
        <SearchField
          ref={searchRef}
          // The browser restores unnamed fields by their order, and the streamed list comes after
          // the header's search: on Back this text landed there. Not kept for restoring at all.
          autoComplete="off"
          label="Магазин, адрес или метро"
          placeholder="Магазин, адрес или метро"
          onValueChange={(value) => {
            setText(value);
            // An empty text applies at once, so a new text typed soon after starts from nothing.
            if (value.trim() === '') setApplied('');
          }}
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
        {far && (
          <p role="status" className={styles.far}>
            Рядом с вами пока нет магазинов
          </p>
        )}
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
// text sent last, and only once the stores are there to count. `results` counts what the page shows
// (the city's stores or every one, `scope`, spec 0026 C13). The text itself is not sent.
function useSearchedEvent(text: string, pool: readonly Store[] | undefined, scope: Scope) {
  const lastSentRef = useRef('');
  useEffect(() => {
    const query = text.trim();
    if (pool === undefined || query === '' || query === lastSentRef.current) return;
    const timer = setTimeout(() => {
      lastSentRef.current = query;
      track('Stores Searched', {
        query_length: query.length,
        results: matchStores(pool, query).length,
        scope,
      });
    }, SEARCH_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [text, pool, scope]);
}

// The city's row before the stored city is read: as high as its chips.
function CityRowSkeleton() {
  return (
    <div className={styles.city} aria-hidden="true">
      <Skeleton height={36} width={240} />
    </div>
  );
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
      <CityRowSkeleton />
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
