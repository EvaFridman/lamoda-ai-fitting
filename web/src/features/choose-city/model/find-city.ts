import type { City } from '@/entities/store';
import { track } from '@/shared/analytics';

import { type LocateResult, locateCity } from '../lib/locate';

/** `locateCity` with its `City Located` (C13): the result and who asked, nothing of the position. */
export async function findCity(
  cities: readonly City[],
  trigger: 'page' | 'button',
): Promise<LocateResult> {
  const result = await locateCity(cities);
  track('City Located', { result: result.kind, trigger });
  return result;
}
