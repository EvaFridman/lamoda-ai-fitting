import { describe, expect, it } from 'vitest';

describe('entities/store public entry', () => {
  // Client code imports this entry; it must not pull in `server-only` (no mock here on purpose).
  it('loads without server-only and exports the hook, options, helpers and card', async () => {
    const entry = await import('./index');
    for (const name of [
      'useStores',
      'storeListOptions',
      'matchStores',
      'telHref',
      'routeHref',
      'storeAddress',
      'StoreCard',
      'cityName',
      'matchCities',
      'nearestCity',
      'storeCities',
      'storesOfCity',
    ]) {
      expect(typeof (entry as Record<string, unknown>)[name], name).toBe('function');
    }
  });

  it('exports nothing built on apiFetch', async () => {
    const entry = await import('./index');
    expect('getStores' in entry).toBe(false);
  });
});
