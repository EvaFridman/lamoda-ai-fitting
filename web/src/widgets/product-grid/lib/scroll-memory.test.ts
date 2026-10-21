import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { currentScrollKey, readScroll, saveScroll, scrollKey } from './scroll-memory';

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('scrollKey', () => {
  it('is made of the path and the query', () => {
    expect(scrollKey('/catalog/dresses', 'sort=price_asc&cursor=c')).toBe(
      'catalog-scroll:/catalog/dresses?sort=price_asc&cursor=c',
    );
    expect(scrollKey('/catalog', '?a=1&b=2')).toBe('catalog-scroll:/catalog?a=1&b=2');
  });

  it('has no question mark for an empty query', () => {
    expect(scrollKey('/catalog', '')).toBe('catalog-scroll:/catalog');
    expect(scrollKey('/catalog', new URLSearchParams())).toBe('catalog-scroll:/catalog');
  });

  it('is the same for a string and for URLSearchParams', () => {
    expect(scrollKey('/catalog', new URLSearchParams('a=1&b=2'))).toBe(
      scrollKey('/catalog', 'a=1&b=2'),
    );
  });

  it('writes a comma in one encoding, as the router and as the address bar give it', () => {
    history.replaceState(null, '', '/catalog?brand=a,b&q=%D0%BF%D0%BB');
    const fromLocation = currentScrollKey();
    const fromRouter = scrollKey(
      '/catalog',
      new URLSearchParams(new URLSearchParams('brand=a%2Cb&q=пл').toString()),
    );
    expect(fromLocation).toBe(fromRouter);
    history.replaceState(null, '', '/');
  });

  it('keeps the order of the parameters', () => {
    expect(scrollKey('/catalog', 'b=2&a=1')).toBe('catalog-scroll:/catalog?b=2&a=1');
  });
});

describe('currentScrollKey', () => {
  it('is made of the address bar', () => {
    history.replaceState(null, '', '/catalog/dresses?sort=price_asc');
    expect(currentScrollKey()).toBe('catalog-scroll:/catalog/dresses?sort=price_asc');
    history.replaceState(null, '', '/catalog');
    expect(currentScrollKey()).toBe('catalog-scroll:/catalog');
    history.replaceState(null, '', '/');
  });
});

describe('saveScroll and readScroll', () => {
  it('give back the offset and the row height, rounded', () => {
    saveScroll('k', { offset: 1234.6, rowHeight: 560.4 });
    expect(readScroll('k')).toEqual({ offset: 1235, rowHeight: 560 });
  });

  it('keep an address apart from another', () => {
    saveScroll('a', { offset: 100 });
    saveScroll('b', { offset: 200 });
    expect(readScroll('a')?.offset).toBe(100);
    expect(readScroll('b')?.offset).toBe(200);
  });

  it('keep an offset without a row height', () => {
    saveScroll('k', { offset: 300 });
    expect(readScroll('k')).toEqual({ offset: 300, rowHeight: undefined });
  });

  it('find nothing for an address never saved', () => {
    expect(readScroll('none')).toBeUndefined();
  });

  it.each([
    ['not JSON', '{'],
    ['null', 'null'],
    ['a number', '5'],
    ['no offset', '{"rowHeight":500}'],
    ['a zero offset', '{"offset":0}'],
    ['a negative offset', '{"offset":-5}'],
    ['a text offset', '{"offset":"7"}'],
  ])('ignores a saved value that is %s', (_name, value) => {
    sessionStorage.setItem('k', value);
    expect(readScroll('k')).toBeUndefined();
  });

  it('give back the count of products loaded when saved', () => {
    saveScroll('k', { offset: 12006, rowHeight: 560, count: 180 });
    expect(readScroll('k')).toEqual({ offset: 12006, rowHeight: 560, count: 180 });
  });

  it('still reads a value saved without a count', () => {
    sessionStorage.setItem('k', '{"offset":10,"rowHeight":500}');
    expect(readScroll('k')).toEqual({ offset: 10, rowHeight: 500, count: undefined });
  });

  it.each([
    ['zero', '0'],
    ['negative', '-3'],
    ['fractional', '1.5'],
    ['text', '"60"'],
  ])('drops a count that is %s', (_name, count) => {
    sessionStorage.setItem('k', `{"offset":10,"count":${count}}`);
    expect(readScroll('k')?.count).toBeUndefined();
    expect(readScroll('k')?.offset).toBe(10);
  });

  it('drops a row height that is not positive', () => {
    sessionStorage.setItem('k', '{"offset":10,"rowHeight":-1}');
    expect(readScroll('k')).toEqual({ offset: 10, rowHeight: undefined });
  });

  it('does not throw when the storage refuses a write or a read', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('off', 'SecurityError');
    });
    expect(() => saveScroll('k', { offset: 5 })).not.toThrow();
    expect(readScroll('k')).toBeUndefined();
  });
});

describe('isLoadedByTraversal and endFirstShow', () => {
  // The module keeps its state: each test loads a fresh copy.
  async function load() {
    vi.resetModules();
    return import('./scroll-memory');
  }

  function navigationEntries(type: string, name: string) {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
      { type, name } as PerformanceNavigationTiming,
    ]);
  }

  const KEY = 'catalog-scroll:/catalog?a=1&b=2';
  const URL_OF_KEY = 'http://localhost/catalog?a=1&b=2';

  it('is true for the back or forward entry of its address, and the same when asked again', async () => {
    navigationEntries('back_forward', URL_OF_KEY);
    const { isLoadedByTraversal } = await load();
    expect(isLoadedByTraversal(KEY)).toBe(true);
    expect(isLoadedByTraversal(KEY)).toBe(true);
  });

  it('reads the entry query in the order it has', async () => {
    navigationEntries('back_forward', 'http://localhost/catalog?b=2&a=1');
    const { isLoadedByTraversal } = await load();
    expect(isLoadedByTraversal('catalog-scroll:/catalog?b=2&a=1')).toBe(true);
    expect(isLoadedByTraversal(KEY)).toBe(false);
  });

  it('matches the router’s key when the entry writes a comma unencoded', async () => {
    navigationEntries('back_forward', 'http://localhost/catalog?a=1&b=x,y');
    const { isLoadedByTraversal } = await load();
    expect(isLoadedByTraversal(scrollKey('/catalog', new URLSearchParams('a=1&b=x%2Cy')))).toBe(
      true,
    );
  });

  it('is false after endFirstShow', async () => {
    navigationEntries('back_forward', URL_OF_KEY);
    const { isLoadedByTraversal, endFirstShow } = await load();
    expect(isLoadedByTraversal(KEY)).toBe(true);
    endFirstShow();
    expect(isLoadedByTraversal(KEY)).toBe(false);
  });

  it('is false for the key of another address', async () => {
    navigationEntries('back_forward', URL_OF_KEY);
    const { isLoadedByTraversal } = await load();
    expect(isLoadedByTraversal('catalog-scroll:/catalog/dresses')).toBe(false);
    expect(isLoadedByTraversal('catalog-scroll:/catalog?a=1&b=2&cursor=c')).toBe(false);
  });

  it('is false for an entry of another address', async () => {
    navigationEntries('back_forward', 'http://localhost/somewhere-else');
    const { isLoadedByTraversal } = await load();
    expect(isLoadedByTraversal(KEY)).toBe(false);
  });

  it('is false for an entry whose name is not an address', async () => {
    navigationEntries('back_forward', 'not a url');
    const { isLoadedByTraversal } = await load();
    expect(isLoadedByTraversal(KEY)).toBe(false);
  });

  it.each(['navigate', 'reload', 'prerender'])('is false for a page loaded by %s', async (type) => {
    navigationEntries(type, URL_OF_KEY);
    const { isLoadedByTraversal } = await load();
    expect(isLoadedByTraversal(KEY)).toBe(false);
  });

  it('is false without a navigation entry', async () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);
    const { isLoadedByTraversal } = await load();
    expect(isLoadedByTraversal(KEY)).toBe(false);
  });

  it('is not changed by a popstate', async () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);
    const { isLoadedByTraversal } = await load();
    history.replaceState(null, '', '/catalog?a=1&b=2');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(isLoadedByTraversal(KEY)).toBe(false);
    history.replaceState(null, '', '/');
  });
});
