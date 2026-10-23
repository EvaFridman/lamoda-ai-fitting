import { afterEach, describe, expect, it, vi } from 'vitest';

import { documentPathname, isDocumentEntry } from './document-entry';

function navigation(type: string, name = window.location.href) {
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
    { type, name } as PerformanceNavigationTiming,
  ]);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('isDocumentEntry', () => {
  it('is true for a document that a link or the address bar opened at this address', () => {
    navigation('navigate');
    expect(isDocumentEntry()).toBe(true);
  });

  it.each(['reload', 'back_forward', 'prerender'])('is false for %s', (type) => {
    navigation(type);
    expect(isDocumentEntry()).toBe(false);
  });

  it('is false when the document was loaded at another address', () => {
    navigation('navigate', 'http://localhost/catalog?q=other');
    expect(isDocumentEntry()).toBe(false);
  });

  it('is false with no navigation entry', () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);
    expect(isDocumentEntry()).toBe(false);
  });

  it('is false where the browser cannot list entries', () => {
    vi.stubGlobal('performance', {});
    expect(isDocumentEntry()).toBe(false);
  });
});

describe('documentPathname', () => {
  it('is the path of the address the document was loaded at, without its search', () => {
    navigation('navigate', 'http://localhost/catalog/dresses?q=a#top');
    expect(documentPathname()).toBe('/catalog/dresses');
  });

  it('does not depend on the navigation type', () => {
    navigation('reload', 'http://localhost/customer');
    expect(documentPathname()).toBe('/customer');
  });

  it('is undefined with no navigation entry', () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);
    expect(documentPathname()).toBeUndefined();
  });

  it('is undefined where the browser cannot list entries', () => {
    vi.stubGlobal('performance', {});
    expect(documentPathname()).toBeUndefined();
  });

  it('is undefined for an entry whose name is not an address', () => {
    navigation('navigate', 'not an address');
    expect(documentPathname()).toBeUndefined();
  });
});
