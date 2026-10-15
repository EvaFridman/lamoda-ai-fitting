import { describe, expect, it } from 'vitest';

describe('entities/brand public entry', () => {
  // Client code imports this entry; it must not pull in `server-only` (no mock here on purpose).
  it('loads without server-only and exports the hooks and options', async () => {
    const entry = await import('./index');
    for (const name of ['useBrands', 'useBrand', 'brandListOptions', 'brandOptions']) {
      expect(typeof (entry as Record<string, unknown>)[name], name).toBe('function');
    }
  });

  it('exports nothing built on apiFetch', async () => {
    const entry = await import('./index');
    expect('getBrands' in entry).toBe(false);
    expect('getBrand' in entry).toBe(false);
  });
});
