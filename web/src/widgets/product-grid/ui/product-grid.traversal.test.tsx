import { act, render } from '@testing-library/react';
import { Activity } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A file of its own: it loads a fresh grid per test, as the scroll memory keeps in module state
// whether the document's first list has shown.
const virtual = vi.hoisted(() => ({
  options: undefined as undefined | Record<string, unknown>,
  scrollToOffset: vi.fn(),
}));

vi.mock('@tanstack/react-virtual', () => {
  const instance = {
    getVirtualItems: () => {
      const count = virtual.options?.count as number;
      return count > 0 ? [{ index: 0, key: 0, start: 100, end: 600, size: 500 }] : [];
    },
    itemSizeCache: new Map([[0, 500]]),
    getTotalSize: () => (virtual.options?.count as number) * 500,
    measure: () => {},
    measureElement: () => {},
    scrollToOffset: virtual.scrollToOffset,
  };
  return {
    useWindowVirtualizer: (options: Record<string, unknown>) => {
      virtual.options = options;
      return instance;
    },
  };
});

const nav = vi.hoisted(() => ({ pathname: '/catalog', search: 'q=a' }));

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));

import type { ProductListItem } from '@/entities/product';

import type { ProductGridProps } from './product-grid';

let ProductGrid: typeof import('./product-grid').ProductGrid;

const DATE = '2026-10-01T12:00:00.000Z';
const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const KEY_A = 'catalog-scroll:/catalog?q=a';
const KEY_B = 'catalog-scroll:/catalog?q=b';

function productsOf(count: number): ProductListItem[] {
  return Array.from({ length: count }, (_, n) => ({
    id: `7c9e6679-7425-40de-944b-e07fc1f9${String(n + 1).padStart(4, '0')}`,
    article: `A-${n + 1}`,
    name: `Платье ${n + 1}`,
    brand: { id: ID, name: 'Бренд' },
    category: { id: ID, name: 'Платья', slug: 'dresses' },
    image: null,
    price: 5000,
    discount: 0,
    finalPrice: 5000,
    rating: null,
    createdAt: DATE,
    updatedAt: DATE,
  }));
}

function props(overrides: Partial<ProductGridProps> = {}): ProductGridProps {
  return { products: productsOf(40), canLoadMore: false, onLoadMore: vi.fn(), ...overrides };
}

const frames: FrameRequestCallback[] = [];

function scrollTo(offset: number) {
  Object.defineProperty(window, 'scrollY', { value: offset, configurable: true });
  window.dispatchEvent(new Event('scroll'));
  while (frames.length > 0) frames.shift()?.(0);
}

function loadedByTraversal(url: string) {
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
    { type: 'back_forward', name: url } as PerformanceNavigationTiming,
  ]);
}

beforeEach(async () => {
  vi.resetModules();
  ({ ProductGrid } = await import('./product-grid'));
  virtual.options = undefined;
  virtual.scrollToOffset.mockClear();
  nav.pathname = '/catalog';
  nav.search = 'q=a';
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ width: 1200, height: 0, top: 100, left: 0, right: 1200, bottom: 0 }) as DOMRect,
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  // A frame runs after the scroll handler has returned, as in a browser.
  frames.length = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  sessionStorage.clear();
  history.replaceState(null, '', '/catalog?q=a');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
});

describe('ProductGrid shown again by <Activity> (Next cacheComponents)', () => {
  const saved = { offset: 8000, rowHeight: 500, count: 120 };

  function tree(mode: 'visible' | 'hidden', overrides: Partial<ProductGridProps> = {}) {
    return (
      <Activity mode={mode}>
        <ProductGrid {...props(overrides)} />
      </Activity>
    );
  }

  it('does nothing when shown again after a step through the history', () => {
    const onLoadMore = vi.fn();
    const loaded = { products: productsOf(60), canLoadMore: false, onLoadMore };
    const { rerender } = render(tree('visible', loaded));

    rerender(tree('hidden', loaded));
    sessionStorage.setItem(KEY_A, JSON.stringify(saved));
    window.dispatchEvent(new PopStateEvent('popstate'));
    loadedByTraversal('http://localhost/catalog?q=a');

    rerender(tree('visible', { ...loaded, canLoadMore: true }));
    rerender(tree('visible', { ...loaded, products: productsOf(120), canLoadMore: true }));
    expect(virtual.scrollToOffset).not.toHaveBeenCalled();
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('restores the place of a document loaded by Back, and not again when shown again', () => {
    sessionStorage.setItem(KEY_A, JSON.stringify(saved));
    loadedByTraversal('http://localhost/catalog?q=a');
    const loaded = { products: productsOf(120) };
    const { rerender } = render(tree('visible', loaded));
    expect(virtual.scrollToOffset).toHaveBeenCalledTimes(1);
    expect(virtual.scrollToOffset).toHaveBeenCalledWith(8000);

    rerender(tree('hidden', loaded));
    rerender(tree('visible', loaded));
    expect(virtual.scrollToOffset).toHaveBeenCalledTimes(1);
  });

  it('saves nothing while hidden, and saves again under its address once shown', () => {
    const { rerender } = render(tree('visible'));
    rerender(tree('hidden'));
    history.replaceState(null, '', '/catalog?q=b');
    scrollTo(5000);
    expect(sessionStorage.getItem(KEY_A)).toBeNull();
    expect(sessionStorage.getItem(KEY_B)).toBeNull();

    history.replaceState(null, '', '/catalog?q=a');
    rerender(tree('visible'));
    scrollTo(5100);
    expect(JSON.parse(sessionStorage.getItem(KEY_A) ?? 'null')).toMatchObject({ offset: 5100 });
  });
});

describe('ProductGrid while the address bar has left the list', () => {
  it('writes nothing under the new address or the old one', () => {
    render(<ProductGrid {...props()} />);
    history.replaceState(null, '', '/catalog?q=b');
    window.dispatchEvent(new PopStateEvent('popstate'));

    scrollTo(5000);
    expect(sessionStorage.getItem(KEY_A)).toBeNull();
    expect(sessionStorage.getItem(KEY_B)).toBeNull();
  });

  it('keeps saving under its address after a popstate that leaves the bar where it was', () => {
    render(<ProductGrid {...props()} />);
    window.dispatchEvent(new PopStateEvent('popstate'));

    act(() => scrollTo(3000));
    expect(JSON.parse(sessionStorage.getItem(KEY_A) ?? 'null')).toMatchObject({ offset: 3000 });
  });
});
