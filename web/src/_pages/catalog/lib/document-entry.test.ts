import { afterEach, describe, expect, it, vi } from 'vitest';

import { isDocumentEntry } from './document-entry';

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
