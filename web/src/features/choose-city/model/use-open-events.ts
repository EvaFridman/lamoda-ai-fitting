'use client';

import type { City } from '@/entities/store';
import { useTrackedElement } from '@/shared/analytics';

import { useCity } from './city-store';

/** The tracked props of a control that opens `CityModal` (`city.open`, plan §7, C13). */
export function useCityOpenEvents(
  source: 'header' | 'burger' | 'stores',
  cities: readonly City[] | null | undefined,
) {
  const city = useCity(cities);
  return useTrackedElement('city.open', { source, had_city: typeof city === 'string' });
}
