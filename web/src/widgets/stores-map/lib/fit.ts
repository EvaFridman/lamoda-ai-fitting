import type { LngLat, LngLatBounds, YMapLocationRequest } from '@yandex/ymaps3-types';

import type { Store } from '@/entities/store';

// Where the map moves (plan §3.2): the page's start, one store (a card's click), or the stores the
// search left or the chosen city's (spec 0026 plan §5). Each new object is one move; a pin's click
// makes none. `singleZoom`: the zoom when the stores are one point, a street's by default; a city's
// fit passes `CITY_ZOOM`.
export type MapFit =
  | { kind: 'start' }
  | { kind: 'store'; store: Store }
  | { kind: 'stores'; stores: readonly Store[]; singleZoom?: number };

// The page opens on Moscow (spec 0022 X7, AC8).
export const MOSCOW: LngLat = [37.6173, 55.7558];
export const START_ZOOM = 10;
export const STORE_ZOOM = 15;
// A city of one store is shown as a city, not a street.
export const CITY_ZOOM = 12;
// A move's animation, ms.
export const FIT_DURATION = 300;
export const START_LOCATION: YMapLocationRequest = { center: MOSCOW, zoom: START_ZOOM };

export function storePoint(store: Store): LngLat {
  return [store.longitude, store.latitude];
}

// The bounds of the points: top-left and bottom-right, as Yandex's `LngLatBounds` reads them.
export function pointsBounds(points: readonly LngLat[]): LngLatBounds | null {
  const [first, ...rest] = points;
  if (first === undefined) return null;
  let [west, north] = first;
  let [east, south] = first;
  for (const [lng, lat] of rest) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return [
    [west, north],
    [east, south],
  ];
}

// The location that shows every point, or null for none (a search that left nothing: the map
// stays). Points that are one point are shown at `singleZoom`, a street's by default: bounds of one
// point would zoom in as far as the map goes.
export function pointsLocation(
  points: readonly LngLat[],
  singleZoom = STORE_ZOOM,
): YMapLocationRequest | null {
  const bounds = pointsBounds(points);
  if (bounds === null) return null;
  const [[west, north], [east, south]] = bounds;
  if (west === east && north === south) {
    return { center: [west, north], zoom: singleZoom, duration: FIT_DURATION };
  }
  return { bounds, duration: FIT_DURATION };
}

// The map's location for a fit, or null to stay.
export function fitLocation(fit: MapFit): YMapLocationRequest | null {
  switch (fit.kind) {
    case 'start':
      return { ...START_LOCATION, duration: FIT_DURATION };
    case 'store':
      return { center: storePoint(fit.store), zoom: STORE_ZOOM, duration: FIT_DURATION };
    case 'stores':
      return pointsLocation(fit.stores.map(storePoint), fit.singleZoom);
  }
}
