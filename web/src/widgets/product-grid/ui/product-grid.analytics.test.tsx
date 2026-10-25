import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProductListItem } from '@/entities/product';

// jsdom has no layout: the virtualizer is replaced by one whose rows the test sets.
const virtual = vi.hoisted(() => ({
  options: undefined as undefined | { count: number },
  // The first of the two rows in view.
  first: 0,
}));

vi.mock('@tanstack/react-virtual', () => ({
  useWindowVirtualizer: (options: { count: number }) => {
    virtual.options = options;
    return {
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
    };
  },
}));

const nav = vi.hoisted(() => ({ pathname: '/catalog' }));

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams('q=a'),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/shared/analytics/client', () => ({ track: vi.fn() }));

const HOVER_MS = 500;

// The scroll memory knows whether the document's first list has shown: each test loads a fresh copy.
let ProductGrid: typeof import('./product-grid').ProductGrid;
let track: typeof import('@/shared/analytics/client').track;

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

// The hover state is kept per path for the whole file: a path of its own for each test.
let testNumber = 0;

beforeEach(async () => {
  vi.resetModules();
  ({ ProductGrid } = await import('./product-grid'));
  ({ track } = await import('@/shared/analytics/client'));
  vi.useFakeTimers();
  testNumber += 1;
  virtual.first = 0;
  nav.pathname = `/catalog-${testNumber}`;
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
  history.replaceState(null, '', '/catalog?q=a');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const card = (n: number) => screen.getByRole('link', { name: new RegExp(`Платье ${n}(?!\\d)`) });

describe('ProductGrid analytics', () => {
  it('sends Element Clicked for a card with its position and no product', () => {
    render(<ProductGrid products={productsOf(8)} canLoadMore={false} onLoadMore={vi.fn()} />);
    fireEvent.click(card(6));
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('Element Clicked', {
      position: 6,
      element: 'catalog.card',
      zone: 'catalog',
      type: 'navigation',
    });
  });

  it('sends Element Hovered once per position after 500 ms of a mouse', () => {
    render(<ProductGrid products={productsOf(8)} canLoadMore={false} onLoadMore={vi.fn()} />);
    fireEvent.pointerEnter(card(1), { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(HOVER_MS - 1));
    expect(track).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    fireEvent.pointerEnter(card(2), { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(HOVER_MS));
    fireEvent.pointerEnter(card(1), { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(HOVER_MS));

    expect(vi.mocked(track).mock.calls).toEqual([
      [
        'Element Hovered',
        { position: 1, element: 'catalog.card', zone: 'catalog', type: 'navigation' },
      ],
      [
        'Element Hovered',
        { position: 2, element: 'catalog.card', zone: 'catalog', type: 'navigation' },
      ],
    ]);
  });

  it('sends no hover for a touch', () => {
    render(<ProductGrid products={productsOf(8)} canLoadMore={false} onLoadMore={vi.fn()} />);
    fireEvent.pointerEnter(card(1), { pointerType: 'touch' });
    act(() => vi.advanceTimersByTime(HOVER_MS * 2));
    expect(track).not.toHaveBeenCalled();
  });

  it('asks for a batch the visitor scrolled to as not restoring', () => {
    virtual.first = 8;
    const onLoadMore = vi.fn();
    render(<ProductGrid products={productsOf(40)} canLoadMore onLoadMore={onLoadMore} />);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(onLoadMore).toHaveBeenCalledWith(false);
  });

  it('asks for the batches to go back to a place as restoring', () => {
    const key = 'catalog-scroll:/catalog-' + String(testNumber) + '?q=a';
    sessionStorage.setItem(key, JSON.stringify({ offset: 9000, rowHeight: 500, count: 60 }));
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
      {
        type: 'back_forward',
        name: `http://localhost/catalog-${testNumber}?q=a`,
      } as PerformanceNavigationTiming,
    ]);
    history.replaceState(null, '', `/catalog-${testNumber}?q=a`);
    const onLoadMore = vi.fn();
    render(<ProductGrid products={productsOf(40)} canLoadMore onLoadMore={onLoadMore} />);
    expect(onLoadMore.mock.calls).toEqual([[true]]);
  });
});
