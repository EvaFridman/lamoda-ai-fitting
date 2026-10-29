import { act, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { City } from '@/entities/store';
import { track } from '@/shared/analytics/client';

import { chooseCity } from './city-store';
import { useAskCityOnce } from './use-ask-once';

vi.mock('@/shared/analytics/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/analytics/client')>()),
  track: vi.fn(),
}));

const CITIES: City[] = [
  { name: 'Москва', points: [[37.62, 55.75]] },
  { name: 'Санкт-Петербург', points: [[30.31, 59.94]] },
];

type Success = PositionCallback;
type Failure = PositionErrorCallback;

function setGeolocation(getCurrentPosition: (ok: Success, fail: Failure) => void) {
  const spy = vi.fn(getCurrentPosition);
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: spy },
  });
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  return spy;
}

const moscow = (ok: Success) =>
  ok({ coords: { latitude: 55.7512, longitude: 37.6184 } } as GeolocationPosition);

const settle = () => act(async () => {});

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(track).mockClear();
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'geolocation');
  Reflect.deleteProperty(window, 'isSecureContext');
});

describe('useAskCityOnce', () => {
  it('asks once when there are cities, no city and no mark, and chooses the found one', async () => {
    const ask = setGeolocation(moscow);
    const { result } = renderHook(() => useAskCityOnce(CITIES));
    await settle();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('city')).toBe('Москва');
    expect(result.current).toBe(false);
  });

  it('keeps nothing but the city and the mark, with no coordinates (AC5)', async () => {
    setGeolocation(moscow);
    renderHook(() => useAskCityOnce(CITIES));
    await settle();
    expect(Object.keys(window.localStorage).sort()).toEqual(['city', 'city-asked']);
    expect(JSON.stringify({ ...window.localStorage })).not.toMatch(/55\.7|37\.6/);
  });

  it('sets the mark before it asks for the position', async () => {
    let markWhenAsked: string | null = 'not asked';
    setGeolocation(() => {
      markWhenAsked = window.localStorage.getItem('city-asked');
    });
    renderHook(() => useAskCityOnce(CITIES));
    await settle();
    expect(markWhenAsked).toBe('1');
  });

  it('does not ask while the cities are not there', async () => {
    const ask = setGeolocation(moscow);
    renderHook(() => useAskCityOnce(undefined));
    renderHook(() => useAskCityOnce(null));
    await settle();
    expect(ask).not.toHaveBeenCalled();
  });

  it('does not ask with a stored city among the cities', async () => {
    window.localStorage.setItem('city', 'Санкт-Петербург');
    const ask = setGeolocation(moscow);
    renderHook(() => useAskCityOnce(CITIES));
    await settle();
    expect(ask).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('city')).toBe('Санкт-Петербург');
  });

  it('does not ask when the mark is set', async () => {
    window.localStorage.setItem('city-asked', '1');
    const ask = setGeolocation(moscow);
    renderHook(() => useAskCityOnce(CITIES));
    await settle();
    expect(ask).not.toHaveBeenCalled();
  });

  it('does not ask after a hand-chosen city that left the table', async () => {
    chooseCity('Казань');
    const ask = setGeolocation(moscow);
    renderHook(() => useAskCityOnce(CITIES));
    await settle();
    expect(ask).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('city')).toBe('Казань');
  });

  it('answers true when no store is within 100 km and chooses nothing', async () => {
    setGeolocation((ok) =>
      ok({ coords: { latitude: 48.7, longitude: 44.5 } } as GeolocationPosition),
    );
    const { result } = renderHook(() => useAskCityOnce(CITIES));
    await settle();
    expect(result.current).toBe(true);
    expect(window.localStorage.getItem('city')).toBeNull();
  });

  it.each([
    ['refused', 1],
    ['failed', 2],
    ['timed out', 3],
  ])('answers false and stores no city when the ask %s', async (_name, code) => {
    setGeolocation((_ok, fail) => fail({ code } as GeolocationPositionError));
    const { result } = renderHook(() => useAskCityOnce(CITIES));
    await settle();
    expect(result.current).toBe(false);
    expect(window.localStorage.getItem('city')).toBeNull();
    expect(window.localStorage.getItem('city-asked')).toBe('1');
  });

  it('keeps a city picked while the prompt waits', async () => {
    let answer: Success | undefined;
    setGeolocation((ok) => {
      answer = ok;
    });
    renderHook(() => useAskCityOnce(CITIES));
    await settle();
    act(() => chooseCity('Санкт-Петербург'));
    await act(async () => {
      moscow(answer!);
    });
    expect(window.localStorage.getItem('city')).toBe('Санкт-Петербург');
  });

  it('keeps a city picked while the prompt waits even when it is the found one', async () => {
    let answer: Success | undefined;
    setGeolocation((ok) => {
      answer = ok;
    });
    renderHook(() => useAskCityOnce(CITIES));
    await settle();
    act(() => chooseCity('Москва'));
    window.localStorage.setItem('city', 'Москва');
    await act(async () => {
      moscow(answer!);
    });
    expect(window.localStorage.getItem('city')).toBe('Москва');
  });

  it('tracks City Located with the result and the page trigger only', async () => {
    setGeolocation(moscow);
    renderHook(() => useAskCityOnce(CITIES));
    await settle();
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('City Located', { result: 'found', trigger: 'page' });
    const sent = JSON.stringify(vi.mocked(track).mock.calls);
    expect(sent).not.toMatch(/Москва|55\.7|37\.6/);
  });

  it('stops answering true once a city is chosen here', async () => {
    setGeolocation((ok) =>
      ok({ coords: { latitude: 48.7, longitude: 44.5 } } as GeolocationPosition),
    );
    const { result } = renderHook(() => useAskCityOnce(CITIES));
    await settle();
    expect(result.current).toBe(true);
    act(() => chooseCity('Москва'));
    expect(result.current).toBe(false);
  });

  it('stops answering true when another tab chooses a valid city', async () => {
    setGeolocation((ok) =>
      ok({ coords: { latitude: 48.7, longitude: 44.5 } } as GeolocationPosition),
    );
    const { result } = renderHook(() => useAskCityOnce(CITIES));
    await settle();
    expect(result.current).toBe(true);
    window.localStorage.setItem('city', 'Санкт-Петербург');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'city' }));
    });
    expect(result.current).toBe(false);
  });

  it('asks only once under StrictMode', async () => {
    const ask = setGeolocation(moscow);
    renderHook(() => useAskCityOnce(CITIES), { wrapper: StrictMode });
    await settle();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledTimes(1);
  });
});
