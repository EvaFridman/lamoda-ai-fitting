import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProductListItem } from '@/entities/product';

// jsdom has no layout: the virtualizer is replaced by one whose rows the test sets.
const virtual = vi.hoisted(() => ({
  // The first of the two rows in view.
  first: 0,
}));

vi.mock('@tanstack/react-virtual', () => ({
  useWindowVirtualizer: (options: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: Math.min(options.count - virtual.first, 2) }, (_, offset) => {
        const index = virtual.first + offset;
        return {
          index,
          key: index,
          start: index * 500 + 100,
          end: (index + 1) * 500 + 100,
          size: 500,
        };
      }),
    getTotalSize: () => options.count * 500,
    itemSizeCache: new Map<number, number>(),
    measure: () => {},
    measureElement: () => {},
    scrollToOffset: () => {},
  }),
}));

const nav = vi.hoisted(() => ({ pathname: '/catalog' }));

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams('q=a'),
}));
vi.mock('@/shared/analytics/client', () => ({ track: vi.fn() }));

// The scroll memory knows whether the document's first list has shown: each test loads a fresh copy.
let ProductGrid: typeof import('./product-grid').ProductGrid;

const DATE = '2026-10-01T12:00:00.000Z';
const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';

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

beforeEach(async () => {
  vi.resetModules();
  ({ ProductGrid } = await import('./product-grid'));
  virtual.first = 0;
  nav.pathname = '/catalog-restore';
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () =>
      ({
        width: 1200,
        height: 0,
        top: 100,
        left: 0,
        right: 1200,
        bottom: 0,
        x: 0,
        y: 100,
      }) as DOMRect,
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  sessionStorage.clear();
  sessionStorage.setItem(
    'catalog-scroll:/catalog-restore?q=a',
    JSON.stringify({ offset: 9000, rowHeight: 500, count: 60 }),
  );
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
    {
      type: 'back_forward',
      name: 'http://localhost/catalog-restore?q=a',
    } as PerformanceNavigationTiming,
  ]);
  history.replaceState(null, '', '/catalog-restore?q=a');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ProductGrid scroll load during a restore', () => {
  it('asks only for the restore batches, even when the short list is near its end', () => {
    const onLoadMore = vi.fn();
    render(<ProductGrid products={productsOf(8)} canLoadMore onLoadMore={onLoadMore} />);

    expect(onLoadMore.mock.calls).toEqual([[true]]);
  });

  it('asks as a scroll again once the restore has finished', () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(
      <ProductGrid products={productsOf(8)} canLoadMore onLoadMore={onLoadMore} />,
    );
    expect(onLoadMore.mock.calls).toEqual([[true]]);

    // The 60 saved products are back: the place is restored, the list is not near its end.
    rerender(<ProductGrid products={productsOf(60)} canLoadMore onLoadMore={onLoadMore} />);
    expect(onLoadMore.mock.calls).toEqual([[true]]);

    virtual.first = 13;
    rerender(<ProductGrid products={productsOf(60)} canLoadMore onLoadMore={onLoadMore} />);
    expect(onLoadMore.mock.calls).toEqual([[true], [false]]);
  });
});
