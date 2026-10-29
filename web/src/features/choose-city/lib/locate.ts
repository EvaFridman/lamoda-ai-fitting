import { type City, nearestCity } from '@/entities/store';

export type LocateResult =
  { kind: 'found'; name: string } | { kind: 'far' } | { kind: 'refused' } | { kind: 'failed' };

// `GeolocationPositionError.PERMISSION_DENIED`, a number fixed by the standard.
const PERMISSION_DENIED = 1;

// C7's 10 s; a position up to 10 minutes old is good enough for a city.
const POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 600_000,
};

// The browser's `timeout` starts once the permission is given, and a prompt closed without an
// answer may call neither callback: past this the ask is `failed`, a later answer ignored (C15).
export const LOCATE_DEADLINE_MS = 30_000;

/**
 * Finds the city of the nearest store from the browser's position (spec 0026 plan §3.2). The
 * coordinates live only inside this function: passed to `nearestCity` and dropped, never stored,
 * logged or sent (AC5). No result is reported to Sentry: each is the visitor's or the device's.
 */
export function locateCity(cities: readonly City[]): Promise<LocateResult> {
  return new Promise((resolve) => {
    const geolocation = typeof navigator === 'undefined' ? undefined : navigator.geolocation;
    if (!geolocation || !window.isSecureContext) {
      resolve({ kind: 'failed' });
      return;
    }
    const deadline = setTimeout(() => resolve({ kind: 'failed' }), LOCATE_DEADLINE_MS);
    const settle = (result: LocateResult) => {
      clearTimeout(deadline);
      resolve(result);
    };
    try {
      geolocation.getCurrentPosition(
        ({ coords }) => {
          const name = nearestCity(cities, {
            latitude: coords.latitude,
            longitude: coords.longitude,
          });
          settle(name === null ? { kind: 'far' } : { kind: 'found', name });
        },
        (error) => settle({ kind: error.code === PERMISSION_DENIED ? 'refused' : 'failed' }),
        POSITION_OPTIONS,
      );
    } catch {
      settle({ kind: 'failed' });
    }
  });
}
