import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { City } from '@/entities/store';
import { track } from '@/shared/analytics/client';

import { useCityOpenEvents } from './use-open-events';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('@/shared/analytics/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/analytics/client')>()),
  track: vi.fn(),
}));

const CITIES: City[] = [{ name: 'Москва', points: [[37.62, 55.75]] }];

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(track).mockClear();
});

describe('useCityOpenEvents', () => {
  it.each(['header', 'burger', 'stores'] as const)(
    'tracks the click of city.open from %s without a city',
    (source) => {
      const { result } = renderHook(() => useCityOpenEvents(source, CITIES));
      result.current.onClick();
      expect(track).toHaveBeenCalledWith('Element Clicked', {
        element: 'city.open',
        zone: 'header',
        type: 'interaction',
        source,
        had_city: false,
      });
    },
  );

  it('says a city was chosen, and never which', () => {
    window.localStorage.setItem('city', 'Москва');
    const { result } = renderHook(() => useCityOpenEvents('header', CITIES));
    result.current.onClick();
    expect(track).toHaveBeenCalledWith('Element Clicked', {
      element: 'city.open',
      zone: 'header',
      type: 'interaction',
      source: 'header',
      had_city: true,
    });
    expect(JSON.stringify(vi.mocked(track).mock.calls)).not.toContain('Москва');
  });

  it('counts a stored city missing from the table as none', () => {
    window.localStorage.setItem('city', 'Казань');
    const { result } = renderHook(() => useCityOpenEvents('stores', CITIES));
    result.current.onClick();
    expect(track).toHaveBeenCalledWith(
      'Element Clicked',
      expect.objectContaining({ had_city: false }),
    );
  });

  it('says no city while the cities are not there', () => {
    window.localStorage.setItem('city', 'Москва');
    const { result } = renderHook(() => useCityOpenEvents('burger', undefined));
    result.current.onClick();
    expect(track).toHaveBeenCalledWith(
      'Element Clicked',
      expect.objectContaining({ source: 'burger', had_city: false }),
    );
  });
});
