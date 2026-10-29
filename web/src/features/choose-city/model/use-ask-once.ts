'use client';

import { useEffect, useState } from 'react';

import type { City } from '@/entities/store';

import { chooseCity, markAsked, untouchedSince, useCity, wasAsked } from './city-store';
import { findCity } from './find-city';

/**
 * The stores page's own ask (spec 0026 plan §3.4, C6): once per browser, while no city is chosen.
 * The mark is set before asking, so a reload while the prompt waits does not ask twice. A found
 * city is chosen unless one was picked meanwhile (C8); `true` when no store is within 100 km (C7).
 */
export function useAskCityOnce(cities: readonly City[] | null | undefined): boolean {
  const city = useCity(cities);
  const [far, setFar] = useState(false);

  useEffect(() => {
    if (cities == null || city !== null || wasAsked()) return;
    markAsked();
    const untouched = untouchedSince();
    void findCity(cities, 'page').then((result) => {
      if (result.kind === 'far') setFar(true);
      if (result.kind === 'found' && untouched()) chooseCity(result.name);
    });
  }, [cities, city]);

  // A city chosen since (here, in the header or another tab) ends the page's line (C7).
  return far && city === null;
}
