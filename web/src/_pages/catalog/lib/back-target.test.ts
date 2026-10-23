import { describe, expect, it } from 'vitest';

import { backTarget } from './back-target';

const ORIGIN = 'http://localhost';

function target(
  pathname: string,
  {
    stepped = false,
    referrer = '',
    hasHistory = true,
    entryIndex,
  }: { stepped?: boolean; referrer?: string; hasHistory?: boolean; entryIndex?: number } = {},
) {
  return backTarget({ pathname, entryIndex, stepped, referrer, origin: ORIGIN, hasHistory });
}

describe('backTarget', () => {
  it('goes back in the history after a client-side step, whatever the referrer', () => {
    expect(target('/catalog/dresses', { stepped: true })).toBe('history');
    expect(target('/catalog', { stepped: true, referrer: 'https://example.com/' })).toBe('history');
  });

  it('goes back in the history after a step even when the tab reports no history', () => {
    expect(target('/catalog/dresses', { stepped: true, hasHistory: false })).toBe('history');
  });

  it('goes back in the history when the referrer is this site (a reload keeps it)', () => {
    expect(target('/catalog/dresses', { referrer: `${ORIGIN}/customer` })).toBe('history');
    expect(target('/catalog', { referrer: `${ORIGIN}/catalog/dresses` })).toBe('history');
  });

  it('links to the catalog on a category opened in a new tab from a link of this site', () => {
    expect(target('/catalog/dresses', { referrer: `${ORIGIN}/customer`, hasHistory: false })).toBe(
      'catalog',
    );
  });

  it('has no arrow on /catalog opened in a new tab from a link of this site', () => {
    expect(
      target('/catalog', { referrer: `${ORIGIN}/catalog/dresses`, hasHistory: false }),
    ).toBeNull();
  });

  it('links to the catalog on a category page opened directly (a new tab, empty referrer)', () => {
    expect(target('/catalog/dresses')).toBe('catalog');
  });

  it('links to the catalog on a category page entered from another site', () => {
    expect(target('/catalog/dresses', { referrer: 'https://example.com/page' })).toBe('catalog');
  });

  it('has no arrow on /catalog with no step and no referrer of this site', () => {
    expect(target('/catalog')).toBeNull();
  });

  it('has no arrow on /catalog entered from another site', () => {
    expect(target('/catalog', { referrer: 'https://example.com/' })).toBeNull();
  });

  it('has no arrow on /catalog after the redirect from / (empty referrer)', () => {
    expect(target('/catalog', { referrer: '' })).toBeNull();
  });

  it('does not take a malformed referrer for this origin', () => {
    expect(target('/catalog/dresses', { referrer: 'not a url' })).toBe('catalog');
    expect(target('/catalog', { referrer: '::' })).toBeNull();
  });

  describe('with the Navigation API entry index', () => {
    it('goes back in the history above index 0, with no step and an empty referrer', () => {
      expect(target('/catalog/dresses', { entryIndex: 2 })).toBe('history');
      expect(target('/catalog', { entryIndex: 1, hasHistory: false })).toBe('history');
    });

    it('links to the catalog at index 0 on a category, whatever the step, referrer and history', () => {
      expect(
        target('/catalog/dresses', {
          entryIndex: 0,
          stepped: true,
          referrer: `${ORIGIN}/customer`,
          hasHistory: true,
        }),
      ).toBe('catalog');
    });

    it('has no arrow at index 0 on /catalog, whatever the step, referrer and history', () => {
      expect(
        target('/catalog', {
          entryIndex: 0,
          stepped: true,
          referrer: `${ORIGIN}/catalog/dresses`,
          hasHistory: true,
        }),
      ).toBeNull();
    });

    it('uses the old rule when the index is undefined', () => {
      expect(target('/catalog/dresses', { entryIndex: undefined, stepped: true })).toBe('history');
      expect(target('/catalog/dresses', { entryIndex: undefined })).toBe('catalog');
    });
  });

  it('does not take a lookalike origin for this one', () => {
    expect(target('/catalog/dresses', { referrer: 'http://localhost.evil.test/' })).toBe('catalog');
    expect(target('/catalog/dresses', { referrer: 'https://localhost/' })).toBe('catalog');
  });
});
