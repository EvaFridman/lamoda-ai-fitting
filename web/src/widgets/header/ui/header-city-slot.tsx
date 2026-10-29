import { connection } from 'next/server';

import { loadHeaderCities } from './header-cities';
import { HeaderCity } from './header-city';

// Per request, never at build time, so the build needs no api. Wrap it in <Suspense>: its fallback
// is the inert button.
export async function HeaderCitySlot() {
  await connection();
  return <HeaderCity cities={await loadHeaderCities()} />;
}
