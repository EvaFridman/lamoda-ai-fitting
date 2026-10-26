'use client';

import type { LngLat, YMapLocationRequest } from '@yandex/ymaps3-types';
import type { Feature } from '@yandex/ymaps3-clusterer';
import { type HTMLAttributes, useCallback, useEffect, useMemo, useState } from 'react';

import type { Store } from '@/entities/store';
import { reportFailure } from '@/shared/api';
import { yandexMapsApiKey } from '@/shared/config';
import { plural } from '@/shared/lib';

import { fitLocation, type MapFit, pointsLocation, START_LOCATION, storePoint } from '../lib/fit';
import { loadYmaps, type YmapsComponents } from '../lib/load-ymaps';
import { StorePin } from './store-pin';

import styles from './stores-map.module.scss';

// A pin's click and pointer handlers, from the page's `useTrackedElement` (`stores.pin`).
export type PinEvents = Pick<
  HTMLAttributes<HTMLElement>,
  'onClick' | 'onPointerEnter' | 'onPointerLeave'
>;

export interface StoresMapProps {
  // The stores the search left: a pin each, a circle with the count where pins overlap.
  stores: readonly Store[];
  // The store marked (X5): its pin is drawn above the others.
  selectedId: string | null;
  // A pin's click.
  onSelect: (id: string) => void;
  // Where the map goes; each new object is one move (`lib/fit.ts`).
  fit: MapFit;
  pinEvents?: PinEvents;
}

// Pins this close on the screen, px, become one circle (plan §3.2).
const GRID_SIZE = 64;
// Room around the fitted stores, px, so no pin sits on the map's edge.
const MARGIN: [number, number, number, number] = [48, 48, 48, 48];

type State = { kind: 'loading' } | { kind: 'ready'; ymaps: YmapsComponents } | { kind: 'failed' };

// The stores on Yandex's map (spec 0022 X5, X14, plan §3.2). Without a key, or when the script or
// its modules fail, «Карта недоступна» takes the map's place and the page goes on (X13, AC10); only
// a failure with a key is reported. The map is not recorded (`mp-block`, X26). Yandex's logo,
// copyright and «Открыть в Картах» stay where Yandex puts them (X14).
export function StoresMap(props: StoresMapProps) {
  const [state, setState] = useState<State>(() =>
    yandexMapsApiKey === '' ? { kind: 'failed' } : { kind: 'loading' },
  );

  useEffect(() => {
    if (yandexMapsApiKey === '') return;
    let active = true;
    loadYmaps(yandexMapsApiKey).then(
      (ymaps) => {
        if (active) setState({ kind: 'ready', ymaps });
      },
      (error: unknown) => {
        if (!active) return;
        setState({ kind: 'failed' });
        reportFailure(error);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className={`${styles.map} mp-block`} aria-busy={state.kind === 'loading' || undefined}>
      {state.kind === 'failed' && <p className={styles.placeholder}>Карта недоступна</p>}
      {state.kind === 'ready' && <LoadedMap ymaps={state.ymaps} {...props} />}
    </div>
  );
}

function LoadedMap({
  ymaps,
  stores,
  selectedId,
  onSelect,
  fit,
  pinEvents,
}: StoresMapProps & { ymaps: YmapsComponents }) {
  const { YMap, YMapDefaultSchemeLayer, YMapDefaultFeaturesLayer, YMapMarker } = ymaps.map;
  const { YMapClusterer } = ymaps.clusterer;
  const { clusterByGrid } = ymaps;
  const method = useMemo(() => clusterByGrid({ gridSize: GRID_SIZE }), [clusterByGrid]);

  // A new fit moves the map once; a fit with nowhere to go (nothing found) leaves it. A circle's
  // click moves it too. React's "state from the previous render" pattern, not an effect.
  // The map mounts once the script is in, and opens where the page's fit already is: a search or
  // a card's click while it loaded.
  const [location, setLocation] = useState<YMapLocationRequest>(() => {
    const opening = fitLocation(fit);
    return opening === null ? START_LOCATION : { ...opening, duration: 0 };
  });
  const [seenFit, setSeenFit] = useState(fit);
  if (fit !== seenFit) {
    setSeenFit(fit);
    const next = fitLocation(fit);
    if (next !== null) setLocation(next);
  }

  const features = useMemo(
    (): Feature[] =>
      stores.map((store) => ({
        type: 'Feature',
        id: store.id,
        geometry: { type: 'Point', coordinates: storePoint(store) },
        properties: { name: store.name },
      })),
    [stores],
  );

  const marker = useCallback(
    (feature: Feature) => {
      const selected = feature.id === selectedId;
      return (
        <YMapMarker
          key={feature.id}
          coordinates={feature.geometry.coordinates}
          zIndex={selected ? 1 : 0}
        >
          <button
            type="button"
            className={styles.pin}
            data-selected={selected || undefined}
            aria-label={String(feature.properties?.name ?? '')}
            aria-pressed={selected}
            {...pinEvents}
            onClick={(event) => {
              onSelect(feature.id);
              pinEvents?.onClick?.(event);
            }}
          >
            <StorePin />
          </button>
        </YMapMarker>
      );
    },
    [YMapMarker, selectedId, onSelect, pinEvents],
  );

  const cluster = useCallback(
    (coordinates: LngLat, clustered: Feature[]) => {
      const count = clustered.length;
      return (
        <YMapMarker key={`${clustered[0]?.id ?? ''}-${count}`} coordinates={coordinates}>
          <button
            type="button"
            className={styles.cluster}
            aria-label={`${count} ${plural(count, ['магазин', 'магазина', 'магазинов'])}: приблизить`}
            onClick={() => {
              const next = pointsLocation(clustered.map((feature) => feature.geometry.coordinates));
              if (next !== null) setLocation(next);
            }}
          >
            {count}
          </button>
        </YMapMarker>
      );
    },
    [YMapMarker],
  );

  return (
    <YMap location={location} margin={MARGIN}>
      <YMapDefaultSchemeLayer />
      <YMapDefaultFeaturesLayer />
      <YMapClusterer method={method} features={features} marker={marker} cluster={cluster} />
    </YMap>
  );
}
