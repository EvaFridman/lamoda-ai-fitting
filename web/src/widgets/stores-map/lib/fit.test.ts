import { describe, expect, it } from 'vitest';

import type { Store } from '@/entities/store';

import {
  FIT_DURATION,
  fitLocation,
  MOSCOW,
  pointsBounds,
  pointsLocation,
  START_LOCATION,
  STORE_ZOOM,
} from './fit';

function store(longitude: number, latitude: number): Store {
  return { id: `${longitude},${latitude}`, longitude, latitude } as Store;
}

describe('pointsBounds', () => {
  it('is null for no points', () => {
    expect(pointsBounds([])).toBeNull();
  });

  it('is top-left and bottom-right as [lng, lat]', () => {
    expect(
      pointsBounds([
        [37, 55],
        [30, 59],
        [60, 56],
      ]),
    ).toEqual([
      [30, 59],
      [60, 55],
    ]);
  });

  it('is the point twice for one point', () => {
    expect(pointsBounds([[37, 55]])).toEqual([
      [37, 55],
      [37, 55],
    ]);
  });
});

describe('pointsLocation', () => {
  it('is null for no points, so the map stays', () => {
    expect(pointsLocation([])).toBeNull();
  });

  it('centres one point at the street zoom', () => {
    expect(pointsLocation([[37, 55]])).toEqual({
      center: [37, 55],
      zoom: STORE_ZOOM,
      duration: FIT_DURATION,
    });
  });

  it('treats equal points as one', () => {
    expect(
      pointsLocation([
        [37, 55],
        [37, 55],
      ]),
    ).toMatchObject({ center: [37, 55], zoom: STORE_ZOOM });
  });

  it('fits the bounds of several points', () => {
    expect(
      pointsLocation([
        [30, 59],
        [60, 56],
      ]),
    ).toEqual({
      bounds: [
        [30, 59],
        [60, 56],
      ],
      duration: FIT_DURATION,
    });
  });
});

describe('fitLocation', () => {
  it('goes to Moscow at zoom 10 for the start', () => {
    expect(START_LOCATION).toEqual({ center: MOSCOW, zoom: 10 });
    expect(fitLocation({ kind: 'start' })).toEqual({ ...START_LOCATION, duration: FIT_DURATION });
  });

  it('centres a store at zoom 15', () => {
    expect(fitLocation({ kind: 'store', store: store(30.3, 59.9) })).toEqual({
      center: [30.3, 59.9],
      zoom: 15,
      duration: FIT_DURATION,
    });
  });

  it('fits the stores the search left, or nothing', () => {
    expect(fitLocation({ kind: 'stores', stores: [] })).toBeNull();
    expect(fitLocation({ kind: 'stores', stores: [store(30, 59), store(60, 56)] })).toEqual({
      bounds: [
        [30, 59],
        [60, 56],
      ],
      duration: FIT_DURATION,
    });
  });
});
