import { afterEach, describe, expect, it, vi } from 'vitest';

import type { City } from '@/entities/store';

import { LOCATE_DEADLINE_MS, locateCity } from './locate';

const CITIES: City[] = [
  { name: 'Москва', points: [[37.62, 55.75]] },
  { name: 'Санкт-Петербург', points: [[30.31, 59.94]] },
];

function setGeolocation(value: Partial<Geolocation> | undefined, secure = true) {
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value });
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: secure });
}

const positionAt = (latitude: number, longitude: number) =>
  vi.fn((success: PositionCallback) =>
    success({ coords: { latitude, longitude } } as GeolocationPosition),
  );

const failWith = (code: number) =>
  vi.fn((_success: PositionCallback, error?: PositionErrorCallback | null) =>
    error?.({ code } as GeolocationPositionError),
  );

afterEach(() => {
  Reflect.deleteProperty(navigator, 'geolocation');
  Reflect.deleteProperty(window, 'isSecureContext');
});

describe('locateCity deadline', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('answers failed after 30 s without a callback, not before', async () => {
    vi.useFakeTimers();
    setGeolocation({ getCurrentPosition: vi.fn() });
    const settled = vi.fn();
    void locateCity(CITIES).then(settled);
    await vi.advanceTimersByTimeAsync(LOCATE_DEADLINE_MS - 1);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledWith({ kind: 'failed' });
  });

  it('ignores a callback after the deadline', async () => {
    vi.useFakeTimers();
    let answer: PositionCallback | undefined;
    setGeolocation({
      getCurrentPosition: vi.fn((success: PositionCallback) => {
        answer = success;
      }),
    });
    const result = locateCity(CITIES);
    await vi.advanceTimersByTimeAsync(LOCATE_DEADLINE_MS);
    answer?.({ coords: { latitude: 55.75, longitude: 37.62 } } as GeolocationPosition);
    await expect(result).resolves.toEqual({ kind: 'failed' });
  });

  it('clears the timer when the browser answers', async () => {
    vi.useFakeTimers();
    setGeolocation({ getCurrentPosition: positionAt(55.7512, 37.6184) });
    await expect(locateCity(CITIES)).resolves.toEqual({ kind: 'found', name: 'Москва' });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('locateCity', () => {
  it('finds the city of the nearest store', async () => {
    setGeolocation({ getCurrentPosition: positionAt(55.7512, 37.6184) });
    await expect(locateCity(CITIES)).resolves.toEqual({ kind: 'found', name: 'Москва' });
  });

  it('finds the other city from its own position', async () => {
    setGeolocation({ getCurrentPosition: positionAt(59.93, 30.33) });
    await expect(locateCity(CITIES)).resolves.toEqual({
      kind: 'found',
      name: 'Санкт-Петербург',
    });
  });

  it('answers far when no store is within 100 km', async () => {
    setGeolocation({ getCurrentPosition: positionAt(48.7, 44.5) });
    await expect(locateCity(CITIES)).resolves.toEqual({ kind: 'far' });
  });

  it('answers refused when the visitor denies the permission', async () => {
    setGeolocation({ getCurrentPosition: failWith(1) });
    await expect(locateCity(CITIES)).resolves.toEqual({ kind: 'refused' });
  });

  it.each([
    ['position unavailable', 2],
    ['timeout', 3],
  ])('answers failed on %s', async (_name, code) => {
    setGeolocation({ getCurrentPosition: failWith(code) });
    await expect(locateCity(CITIES)).resolves.toEqual({ kind: 'failed' });
  });

  it('answers failed without the geolocation API', async () => {
    setGeolocation(undefined);
    await expect(locateCity(CITIES)).resolves.toEqual({ kind: 'failed' });
  });

  it('answers failed in an insecure context and does not ask', async () => {
    const getCurrentPosition = positionAt(55.75, 37.62);
    setGeolocation({ getCurrentPosition }, false);
    await expect(locateCity(CITIES)).resolves.toEqual({ kind: 'failed' });
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('answers failed when getCurrentPosition throws', async () => {
    setGeolocation({
      getCurrentPosition: vi.fn(() => {
        throw new Error('blocked');
      }),
    });
    await expect(locateCity(CITIES)).resolves.toEqual({ kind: 'failed' });
  });

  it('asks without high accuracy, within 10 s, accepting a position of 10 minutes ago', async () => {
    const getCurrentPosition = positionAt(55.75, 37.62);
    setGeolocation({ getCurrentPosition });
    await locateCity(CITIES);
    expect(getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
      enableHighAccuracy: false,
      timeout: 10_000,
      maximumAge: 600_000,
    });
  });
});
