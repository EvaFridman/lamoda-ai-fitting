import { act, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// jsdom has no layout: the virtualizer is replaced by one whose rows the test sets.
const virtual = vi.hoisted(() => ({
  options: undefined as undefined | Record<string, unknown>,
  visible: [0, 1] as [number, number],
  rowSize: 500,
  scrollToOffset: vi.fn(),
  measure: vi.fn(),
  // The measured sizes by row key (the row's index here).
  sizes: new Map<number, number>(),
}));

vi.mock('@tanstack/react-virtual', () => {
  const instance = {
    getVirtualItems: () => {
      const count = virtual.options?.count as number;
      const [from, to] = virtual.visible;
      const rows = [];
      for (let index = from; index <= Math.min(to, count - 1); index += 1) {
        rows.push({
          index,
          key: index,
          start: index * virtual.rowSize + 100,
          end: (index + 1) * virtual.rowSize + 100,
          size: virtual.rowSize,
        });
      }
      return rows;
    },
    getTotalSize: () => (virtual.options?.count as number) * virtual.rowSize,
    itemSizeCache: virtual.sizes,
    measure: virtual.measure,
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

// The router's view of the address: the grid's own key comes from it.
const nav = vi.hoisted(() => ({ pathname: '/catalog', search: 'q=a' }));

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));

import type { ProductListItem } from '@/entities/product';

import type { ProductGridProps } from './product-grid';

// The scroll memory knows whether the document's first list has shown: each test loads a fresh copy.
let ProductGrid: typeof import('./product-grid').ProductGrid;

// The document was loaded anew by Back or Forward to this address.
function loadedByTraversal(url = 'http://localhost/catalog?q=a', type = 'back_forward') {
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
    { type, name: url } as PerformanceNavigationTiming,
  ]);
}

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
  }));
}

function props(overrides: Partial<ProductGridProps> = {}): ProductGridProps {
  return {
    products: productsOf(40),
    canLoadMore: false,
    onLoadMore: vi.fn(),
    ...overrides,
  };
}

let width = 1200;

beforeEach(async () => {
  vi.resetModules();
  ({ ProductGrid } = await import('./product-grid'));
  virtual.options = undefined;
  virtual.visible = [0, 1];
  virtual.rowSize = 500;
  virtual.sizes.clear();
  for (let index = 0; index < 100; index += 1) virtual.sizes.set(index, 500);
  virtual.scrollToOffset.mockClear();
  virtual.measure.mockClear();
  width = 1200;
  nav.pathname = '/catalog';
  nav.search = 'q=a';
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () =>
      ({ width, height: 0, top: 100, left: 0, right: width, bottom: 0, x: 0, y: 100 }) as DOMRect,
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ProductGrid before it is measured (the server render)', () => {
  const html = () => renderToString(<ProductGrid {...props({ moreHref: '?q=a&cursor=c-1' })} />);

  it('draws every loaded card as a link to its product', () => {
    const page = html();
    expect(page.match(/<li/g)).toHaveLength(40);
    expect(page).toContain(`href="/products/7c9e6679-7425-40de-944b-e07fc1f90001"`);
  });

  it('draws the "Дальше" link visible', () => {
    const page = html();
    expect(page).toMatch(/<a[^>]*href="\?q=a&amp;cursor=c-1"[^>]*>Дальше<\/a>/);
    expect(page).toMatch(/rel="next"/);
    expect(page).not.toContain('class="hidden"');
  });
});

describe('ProductGrid measured', () => {
  it('names the list and puts every card into it as a product link (AC5)', () => {
    render(<ProductGrid {...props()} />);
    const list = screen.getByRole('list', { name: 'Товары' });
    expect(list).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Платье 1$|Платье 1\b/ })).toHaveAttribute(
      'href',
      '/products/7c9e6679-7425-40de-944b-e07fc1f90001',
    );
  });

  it.each([
    [1200, 4],
    [900, 3],
    [500, 2],
  ])('sets %s px of width to %s columns and renders the visible rows only', (w, columns) => {
    width = w;
    render(<ProductGrid {...props()} />);
    expect(virtual.options?.count).toBe(Math.ceil(40 / columns));
    expect(screen.getByRole('list').style.getPropertyValue('--columns')).toBe(String(columns));
    // Rows 0 and 1 are in view.
    expect(screen.getAllByRole('listitem')).toHaveLength(columns * 2);
  });

  it('virtualizes over the window with an overscan of 2 rows', () => {
    render(<ProductGrid {...props()} />);
    expect(virtual.options?.overscan).toBe(2);
  });

  it('pads the rows that are not rendered', () => {
    virtual.visible = [2, 3];
    render(<ProductGrid {...props()} />);
    const list = screen.getByRole('list');
    // Rows 0 and 1 above (2 * 500); rows 4-9 below (6 * 500).
    expect(list.style.paddingTop).toBe('1000px');
    expect(list.style.paddingBottom).toBe('3000px');
    expect(screen.getAllByRole('listitem')[0]).toHaveAttribute('aria-posinset', '9');
  });

  it('numbers the cards of the whole list by position and the loaded count', () => {
    virtual.visible = [1, 1];
    render(<ProductGrid {...props()} />);
    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => item.getAttribute('aria-posinset'))).toEqual(['5', '6', '7', '8']);
    for (const item of items) expect(item).toHaveAttribute('aria-setsize', '40');
  });

  it('uses the filter counts total as the size when it is bigger', () => {
    render(<ProductGrid {...props({ total: 120 })} />);
    for (const item of screen.getAllByRole('listitem')) {
      expect(item).toHaveAttribute('aria-setsize', '120');
    }
  });

  it('never gives a size below the loaded cards', () => {
    render(<ProductGrid {...props({ total: 3 })} />);
    for (const item of screen.getAllByRole('listitem')) {
      expect(item).toHaveAttribute('aria-setsize', '40');
    }
  });

  it('renders nothing but the list for an empty list', () => {
    render(<ProductGrid {...props({ products: [] })} />);
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});

describe('ProductGrid "Дальше"', () => {
  it('has no link without an address', () => {
    render(<ProductGrid {...props()} />);
    expect(screen.queryByRole('link', { name: 'Дальше' })).not.toBeInTheDocument();
  });

  it('goes to the address, as the next page, hidden once measured', () => {
    render(<ProductGrid {...props({ moreHref: '?q=a&cursor=c-1' })} />);
    const link = screen.getByRole('link', { name: 'Дальше' });
    expect(link).toHaveAttribute('href', '?q=a&cursor=c-1');
    expect(link).toHaveAttribute('rel', 'next');
    expect(link).toHaveClass('hidden');
    expect(link).not.toHaveClass('more');
  });

  it('is visible when showMore is set', () => {
    render(<ProductGrid {...props({ moreHref: '?cursor=c', showMore: true })} />);
    const link = screen.getByRole('link', { name: 'Дальше' });
    expect(link).toHaveClass('more');
    expect(link).not.toHaveClass('hidden');
  });

  it('is shown while it has focus, and the next batch waits until it loses it', () => {
    const onLoadMore = vi.fn();
    const element = () => (
      <ProductGrid {...props({ canLoadMore: true, onLoadMore, moreHref: '?c=1' })} />
    );
    const { rerender } = render(element());
    const link = screen.getByRole('link', { name: 'Дальше' });
    expect(link).toHaveClass('hidden');

    act(() => link.focus());
    expect(link).toHaveClass('more');
    expect(link).not.toHaveClass('hidden');

    // Focus scrolls to the end of the list: the last rows come into view.
    virtual.visible = [4, 7];
    rerender(element());
    expect(onLoadMore).not.toHaveBeenCalled();

    act(() => link.blur());
    expect(link).toHaveClass('hidden');
    expect(link).not.toHaveClass('more');
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});

describe('ProductGrid next batch', () => {
  it('is requested when the last visible row is within 2 rows of the end', () => {
    virtual.visible = [4, 7];
    const onLoadMore = vi.fn();
    render(<ProductGrid {...props({ canLoadMore: true, onLoadMore })} />);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('is requested at once when the whole list is in view', () => {
    virtual.visible = [0, 9];
    const onLoadMore = vi.fn();
    render(<ProductGrid {...props({ canLoadMore: true, onLoadMore })} />);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('is not requested while more than 2 rows remain after the last visible row', () => {
    virtual.visible = [0, 6];
    const onLoadMore = vi.fn();
    render(<ProductGrid {...props({ canLoadMore: true, onLoadMore })} />);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('is not requested when it cannot be', () => {
    virtual.visible = [4, 9];
    const onLoadMore = vi.fn();
    render(<ProductGrid {...props({ canLoadMore: false, onLoadMore })} />);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('is not requested twice for the same rows, and is again once the list grows', () => {
    virtual.visible = [4, 7];
    const onLoadMore = vi.fn();
    const { rerender } = render(<ProductGrid {...props({ canLoadMore: true, onLoadMore })} />);
    rerender(<ProductGrid {...props({ canLoadMore: true, onLoadMore })} />);
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    virtual.visible = [8, 11];
    rerender(
      <ProductGrid {...props({ products: productsOf(80), canLoadMore: true, onLoadMore })} />,
    );
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    virtual.visible = [16, 19];
    rerender(
      <ProductGrid {...props({ products: productsOf(80), canLoadMore: true, onLoadMore })} />,
    );
    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });
});

describe('ProductGrid scroll memory (O12)', () => {
  const key = 'catalog-scroll:/catalog?q=a';

  function stubFrames() {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  }

  function scrollTo(offset: number) {
    Object.defineProperty(window, 'scrollY', { value: offset, configurable: true });
    window.dispatchEvent(new Event('scroll'));
  }

  afterEach(() => {
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  it('saves the offset and the row height under the address as the visitor scrolls', () => {
    stubFrames();
    render(<ProductGrid {...props()} />);
    scrollTo(840);
    expect(JSON.parse(sessionStorage.getItem(key) ?? 'null')).toEqual({
      offset: 840,
      rowHeight: 500,
      count: 40,
    });
  });

  describe('after a deep scroll (AC13)', () => {
    const saved = { offset: 12006, rowHeight: 500, count: 120 };

    function stepBack(memory: object = saved) {
      sessionStorage.setItem(key, JSON.stringify(memory));
      loadedByTraversal();
    }

    it('loads batches before it goes back, then goes back once', () => {
      stepBack();
      const onLoadMore = vi.fn();
      const { rerender } = render(
        <ProductGrid {...props({ products: productsOf(60), canLoadMore: true, onLoadMore })} />,
      );
      expect(onLoadMore).toHaveBeenCalledTimes(1);
      expect(virtual.scrollToOffset).not.toHaveBeenCalled();

      rerender(
        <ProductGrid {...props({ products: productsOf(120), canLoadMore: true, onLoadMore })} />,
      );
      expect(virtual.scrollToOffset).toHaveBeenCalledTimes(1);
      expect(virtual.scrollToOffset).toHaveBeenCalledWith(12006);
    });

    it('asks for the next batch each time one has arrived, until enough are loaded', () => {
      stepBack({ ...saved, count: 150 });
      const onLoadMore = vi.fn();
      const { rerender } = render(
        <ProductGrid {...props({ products: productsOf(60), canLoadMore: true, onLoadMore })} />,
      );
      expect(onLoadMore).toHaveBeenCalledTimes(1);

      // A batch is loading: there is a next one, but it may not be requested now.
      rerender(
        <ProductGrid
          {...props({
            products: productsOf(60),
            canLoadMore: false,
            moreHref: '?cursor=next',
            onLoadMore,
          })}
        />,
      );
      expect(onLoadMore).toHaveBeenCalledTimes(1);

      rerender(
        <ProductGrid {...props({ products: productsOf(90), canLoadMore: true, onLoadMore })} />,
      );
      expect(onLoadMore).toHaveBeenCalledTimes(2);
      expect(virtual.scrollToOffset).not.toHaveBeenCalled();

      rerender(
        <ProductGrid {...props({ products: productsOf(150), canLoadMore: true, onLoadMore })} />,
      );
      expect(onLoadMore).toHaveBeenCalledTimes(2);
      expect(virtual.scrollToOffset).toHaveBeenCalledTimes(1);
      expect(virtual.scrollToOffset).toHaveBeenCalledWith(12006);
    });

    it('goes back at once when enough products are loaded already', () => {
      stepBack();
      const onLoadMore = vi.fn();
      render(
        <ProductGrid {...props({ products: productsOf(120), canLoadMore: true, onLoadMore })} />,
      );
      expect(virtual.scrollToOffset).toHaveBeenCalledTimes(1);
      expect(virtual.scrollToOffset).toHaveBeenCalledWith(12006);
      expect(onLoadMore).not.toHaveBeenCalled();
    });

    it('waits for no more than 600 products', () => {
      stepBack({ ...saved, count: 900 });
      const onLoadMore = vi.fn();
      render(
        <ProductGrid {...props({ products: productsOf(600), canLoadMore: true, onLoadMore })} />,
      );
      expect(virtual.scrollToOffset).toHaveBeenCalledWith(12006);
      expect(onLoadMore).not.toHaveBeenCalled();
    });

    it('goes back without waiting when there is no next batch', () => {
      stepBack();
      const onLoadMore = vi.fn();
      render(
        <ProductGrid {...props({ products: productsOf(60), canLoadMore: false, onLoadMore })} />,
      );
      expect(onLoadMore).not.toHaveBeenCalled();
      expect(virtual.scrollToOffset).toHaveBeenCalledTimes(1);
      expect(virtual.scrollToOffset).toHaveBeenCalledWith(12006);
    });

    it('does not overwrite the saved place while the batches load', () => {
      stubFrames();
      stepBack();
      render(<ProductGrid {...props({ products: productsOf(60), canLoadMore: true })} />);
      scrollTo(9427);
      expect(JSON.parse(sessionStorage.getItem(key) ?? 'null')).toEqual(saved);
    });

    it('saves the place again once it is back', () => {
      stubFrames();
      stepBack();
      const { rerender } = render(
        <ProductGrid {...props({ products: productsOf(60), canLoadMore: true })} />,
      );
      rerender(<ProductGrid {...props({ products: productsOf(120), canLoadMore: true })} />);
      scrollTo(12100);
      expect(JSON.parse(sessionStorage.getItem(key) ?? 'null')).toEqual({
        offset: 12100,
        rowHeight: 500,
        count: 120,
      });
    });
  });

  it('stops saving once the grid is gone', () => {
    stubFrames();
    const { unmount } = render(<ProductGrid {...props()} />);
    unmount();
    scrollTo(840);
    expect(sessionStorage.getItem(key)).toBeNull();
  });

  it('goes back to the saved offset when the page was loaded by a step through the history', () => {
    sessionStorage.setItem(key, JSON.stringify({ offset: 2400, rowHeight: 480 }));
    loadedByTraversal();
    render(<ProductGrid {...props()} />);
    expect(virtual.scrollToOffset).toHaveBeenCalledTimes(1);
    expect(virtual.scrollToOffset).toHaveBeenCalledWith(2400);
    // The rows above the place are never rendered: the saved row height stays the estimate.
    expect((virtual.options?.estimateSize as () => number)()).toBe(480);
    // The saved offset is applied by scrollToOffset only; the virtualizer starts where the window is.
    Object.defineProperty(window, 'scrollY', { value: 37, configurable: true });
    expect((virtual.options?.initialOffset as () => number)()).toBe(37);
  });

  it('still goes back when React renders the mount twice (StrictMode)', () => {
    sessionStorage.setItem(key, JSON.stringify({ offset: 2400, rowHeight: 480 }));
    loadedByTraversal();
    render(
      <StrictMode>
        <ProductGrid {...props()} />
      </StrictMode>,
    );
    expect(virtual.scrollToOffset).toHaveBeenCalledWith(2400);
  });

  it('does not take the same step for a later mount of a list', () => {
    sessionStorage.setItem(key, JSON.stringify({ offset: 2400 }));
    loadedByTraversal();
    const first = render(<ProductGrid {...props()} />);
    expect(virtual.scrollToOffset).toHaveBeenCalledTimes(1);
    first.unmount();
    virtual.scrollToOffset.mockClear();
    render(<ProductGrid {...props()} />);
    expect(virtual.scrollToOffset).not.toHaveBeenCalled();
  });

  describe('when the visitor scrolls while the batches load', () => {
    const saved = { offset: 12006, rowHeight: 500, count: 120 };

    function pending() {
      sessionStorage.setItem(key, JSON.stringify(saved));
      loadedByTraversal();
      const onLoadMore = vi.fn();
      const view = render(
        <ProductGrid {...props({ products: productsOf(60), canLoadMore: true, onLoadMore })} />,
      );
      expect(onLoadMore).toHaveBeenCalledTimes(1);
      return view;
    }

    it.each([
      ['wheel', new WheelEvent('wheel')],
      ['touchmove', new Event('touchmove')],
      ['ArrowDown', new KeyboardEvent('keydown', { key: 'ArrowDown' })],
      ['ArrowUp', new KeyboardEvent('keydown', { key: 'ArrowUp' })],
      ['PageUp', new KeyboardEvent('keydown', { key: 'PageUp' })],
      ['PageDown', new KeyboardEvent('keydown', { key: 'PageDown' })],
      ['Home', new KeyboardEvent('keydown', { key: 'Home' })],
      ['End', new KeyboardEvent('keydown', { key: 'End' })],
      ['Space', new KeyboardEvent('keydown', { key: ' ' })],
    ])('a %s cancels the restore', (_name, event) => {
      const { rerender } = pending();
      act(() => {
        window.dispatchEvent(event);
      });
      rerender(<ProductGrid {...props({ products: productsOf(120), canLoadMore: true })} />);
      expect(virtual.scrollToOffset).not.toHaveBeenCalled();
    });

    it('a press on the scrollbar (the root element) cancels the restore', () => {
      const { rerender } = pending();
      act(() => {
        document.documentElement.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      });
      rerender(<ProductGrid {...props({ products: productsOf(120), canLoadMore: true })} />);
      expect(virtual.scrollToOffset).not.toHaveBeenCalled();
    });

    it('a press on another element does not cancel it', () => {
      const { rerender } = pending();
      act(() => {
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      });
      rerender(<ProductGrid {...props({ products: productsOf(120), canLoadMore: true })} />);
      expect(virtual.scrollToOffset).toHaveBeenCalledWith(12006);
    });

    it('saves no row height when the first rendered row is not measured', () => {
      stubFrames();
      virtual.sizes.delete(0);
      render(<ProductGrid {...props()} />);
      scrollTo(840);
      expect(JSON.parse(sessionStorage.getItem(key) ?? 'null')).toEqual({ offset: 840, count: 40 });
    });

    it('saves the measured size of the first rendered row, not its estimate', () => {
      stubFrames();
      virtual.sizes.set(0, 431);
      render(<ProductGrid {...props()} />);
      scrollTo(840);
      expect(JSON.parse(sessionStorage.getItem(key) ?? 'null')).toEqual({
        offset: 840,
        rowHeight: 431,
        count: 40,
      });
    });

    it.each([
      ['touchstart', new Event('touchstart')],
      ['a letter key', new KeyboardEvent('keydown', { key: 'a' })],
      ['Enter', new KeyboardEvent('keydown', { key: 'Enter' })],
      ['Tab', new KeyboardEvent('keydown', { key: 'Tab' })],
      ['Ctrl+End', new KeyboardEvent('keydown', { key: 'End', ctrlKey: true })],
      ['Meta+ArrowUp', new KeyboardEvent('keydown', { key: 'ArrowUp', metaKey: true })],
      ['Alt+ArrowUp', new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true })],
    ])('%s does not cancel the restore', (_name, event) => {
      const { rerender } = pending();
      act(() => {
        window.dispatchEvent(event);
      });
      rerender(<ProductGrid {...props({ products: productsOf(120), canLoadMore: true })} />);
      expect(virtual.scrollToOffset).toHaveBeenCalledWith(12006);
    });

    describe('a key pressed in a field', () => {
      function keyIn(element: HTMLElement, key: string) {
        document.body.append(element);
        act(() => {
          element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        });
        element.remove();
      }

      it.each([['input'], ['textarea'], ['select']])('in a %s does not cancel', (tag) => {
        const { rerender } = pending();
        keyIn(document.createElement(tag), 'ArrowDown');
        rerender(<ProductGrid {...props({ products: productsOf(120), canLoadMore: true })} />);
        expect(virtual.scrollToOffset).toHaveBeenCalledWith(12006);
      });

      it('in an editable element does not cancel', () => {
        const { rerender } = pending();
        const editable = document.createElement('div');
        Object.defineProperty(editable, 'isContentEditable', { value: true });
        keyIn(editable, ' ');
        rerender(<ProductGrid {...props({ products: productsOf(120), canLoadMore: true })} />);
        expect(virtual.scrollToOffset).toHaveBeenCalledWith(12006);
      });

      it('on a button does cancel', () => {
        const { rerender } = pending();
        keyIn(document.createElement('button'), ' ');
        rerender(<ProductGrid {...props({ products: productsOf(120), canLoadMore: true })} />);
        expect(virtual.scrollToOffset).not.toHaveBeenCalled();
      });
    });

    describe('the saved row height as the estimate', () => {
      const estimate = () => (virtual.options?.estimateSize as () => number)();
      const resizes: Array<() => void> = [];

      function stubResizeObserver() {
        vi.stubGlobal(
          'ResizeObserver',
          class {
            constructor(callback: () => void) {
              resizes.push(callback);
            }
            observe() {}
            disconnect() {}
            unobserve() {}
          },
        );
      }

      function restoreWith(rowHeight: number) {
        sessionStorage.setItem(key, JSON.stringify({ ...saved, rowHeight }));
        loadedByTraversal();
        return render(<ProductGrid {...props({ products: productsOf(60), canLoadMore: true })} />);
      }

      it('counts while the restore is pending and the first measurement does not drop it', () => {
        pending();
        expect(estimate()).toBe(500);
      });

      it('still counts after the restore is done', () => {
        const { rerender } = restoreWith(123);
        expect(estimate()).toBe(123);
        rerender(<ProductGrid {...props({ products: productsOf(120), canLoadMore: true })} />);
        expect(virtual.scrollToOffset).toHaveBeenCalledWith(12006);
        expect(estimate()).toBe(123);
        rerender(<ProductGrid {...props({ products: productsOf(180), canLoadMore: true })} />);
        expect(estimate()).toBe(123);
      });

      it('still counts after the visitor cancels the restore', () => {
        const { rerender } = restoreWith(123);
        act(() => {
          window.dispatchEvent(new WheelEvent('wheel'));
        });
        rerender(<ProductGrid {...props({ products: productsOf(60), canLoadMore: true })} />);
        expect(estimate()).toBe(123);
      });

      it('is dropped for the layout estimate when the columns change', () => {
        resizes.length = 0;
        stubResizeObserver();
        const { rerender } = restoreWith(123);
        expect(estimate()).toBe(123);

        width = 900;
        act(() => {
          for (const resize of resizes) resize();
        });
        rerender(<ProductGrid {...props({ products: productsOf(60), canLoadMore: true })} />);
        expect(virtual.options?.count).toBe(20);
        expect(estimate()).not.toBe(123);
        expect(estimate()).toBeGreaterThan(0);
      });

      it('is kept when the width changes but the columns do not', () => {
        resizes.length = 0;
        stubResizeObserver();
        const { rerender } = restoreWith(123);

        width = 1100;
        act(() => {
          for (const resize of resizes) resize();
        });
        rerender(<ProductGrid {...props({ products: productsOf(60), canLoadMore: true })} />);
        expect(virtual.options?.count).toBe(15);
        expect(estimate()).toBe(123);
      });
    });

    it("saves the visitor's own scroll after the cancel", () => {
      stubFrames();
      pending();
      scrollTo(9427);
      expect(JSON.parse(sessionStorage.getItem(key) ?? 'null')).toEqual(saved);

      act(() => {
        window.dispatchEvent(new WheelEvent('wheel'));
      });
      scrollTo(9500);
      expect(JSON.parse(sessionStorage.getItem(key) ?? 'null')).toEqual({
        offset: 9500,
        rowHeight: 500,
        count: 60,
      });
    });

    it('other keys and events do not matter after the restore is done', () => {
      const { rerender } = pending();
      rerender(<ProductGrid {...props({ products: productsOf(120), canLoadMore: true })} />);
      expect(virtual.scrollToOffset).toHaveBeenCalledTimes(1);
      act(() => {
        window.dispatchEvent(new WheelEvent('wheel'));
      });
      expect(virtual.scrollToOffset).toHaveBeenCalledTimes(1);
    });
  });

  it('does not go back to it when the page opens by a link', () => {
    sessionStorage.setItem(key, JSON.stringify({ offset: 2400, rowHeight: 480 }));
    render(<ProductGrid {...props()} />);
    expect(virtual.scrollToOffset).not.toHaveBeenCalled();
  });

  it.each(['navigate', 'reload'])('does not go back when the page was loaded by %s', (type) => {
    sessionStorage.setItem(key, JSON.stringify({ offset: 2400, rowHeight: 480 }));
    loadedByTraversal('http://localhost/catalog?q=a', type);
    render(<ProductGrid {...props()} />);
    expect(virtual.scrollToOffset).not.toHaveBeenCalled();
  });

  it('does not go back after a popstate (a client-side step is the browser’s)', () => {
    sessionStorage.setItem(key, JSON.stringify({ offset: 2400, rowHeight: 480 }));
    window.dispatchEvent(new PopStateEvent('popstate'));
    const { rerender } = render(<ProductGrid {...props()} />);
    window.dispatchEvent(new PopStateEvent('popstate'));
    rerender(<ProductGrid {...props({ products: productsOf(80) })} />);
    expect(virtual.scrollToOffset).not.toHaveBeenCalled();
  });

  it("does not go back to another address's offset", () => {
    sessionStorage.setItem('catalog-scroll:/catalog?q=b', JSON.stringify({ offset: 2400 }));
    loadedByTraversal('http://localhost/catalog?q=b');
    render(<ProductGrid {...props()} />);
    expect(virtual.scrollToOffset).not.toHaveBeenCalled();
  });

  it('does not go back when the loaded address has no saved place', () => {
    loadedByTraversal();
    render(<ProductGrid {...props()} />);
    expect(virtual.scrollToOffset).not.toHaveBeenCalled();
  });

  it('does not go back in a list that shows after the first one of the document', () => {
    sessionStorage.setItem(key, JSON.stringify({ offset: 2400 }));
    const first = render(<ProductGrid {...props()} />);
    first.unmount();
    loadedByTraversal();
    render(<ProductGrid {...props()} />);
    expect(virtual.scrollToOffset).not.toHaveBeenCalled();
  });

  describe('the key is the grid’s own address', () => {
    it('is built from the router, sorted as the router gives it', () => {
      stubFrames();
      nav.pathname = '/catalog/dresses';
      nav.search = 'sort=price_asc&cursor=c';
      history.replaceState(null, '', '/catalog/dresses?sort=price_asc&cursor=c');
      render(<ProductGrid {...props()} />);
      scrollTo(700);
      const saved = sessionStorage.getItem(
        'catalog-scroll:/catalog/dresses?sort=price_asc&cursor=c',
      );
      expect(JSON.parse(saved ?? 'null')).toMatchObject({ offset: 700 });
    });

    it('is the same for the router and the address bar when a comma is encoded differently', () => {
      stubFrames();
      nav.search = 'brand=a%2Cb';
      history.replaceState(null, '', '/catalog?brand=a,b');
      render(<ProductGrid {...props()} />);
      scrollTo(640);
      const saved = sessionStorage.getItem('catalog-scroll:/catalog?brand=a%2Cb');
      expect(JSON.parse(saved ?? 'null')).toMatchObject({ offset: 640 });
    });

    it('goes back to an address the bar writes with an unencoded comma', () => {
      nav.search = 'brand=a%2Cb';
      history.replaceState(null, '', '/catalog?brand=a,b');
      sessionStorage.setItem(
        'catalog-scroll:/catalog?brand=a%2Cb',
        JSON.stringify({ offset: 900 }),
      );
      loadedByTraversal('http://localhost/catalog?brand=a,b');
      render(<ProductGrid {...props()} />);
      expect(virtual.scrollToOffset).toHaveBeenCalledWith(900);
    });

    it('does not go back to the place of the address bar when the router shows another list', () => {
      sessionStorage.setItem(key, JSON.stringify({ offset: 2400 }));
      sessionStorage.setItem('catalog-scroll:/catalog?q=b', JSON.stringify({ offset: 100 }));
      loadedByTraversal();
      nav.search = 'q=b';
      render(<ProductGrid {...props()} />);
      expect(virtual.scrollToOffset).not.toHaveBeenCalled();
    });

    it('does not save while the address bar has already left the list (Back after "Дальше")', () => {
      stubFrames();
      render(<ProductGrid {...props()} />);
      history.replaceState(null, '', '/catalog?q=a&cursor=c-1');
      scrollTo(5000);
      expect(sessionStorage.getItem(key)).toBeNull();
      expect(sessionStorage.getItem('catalog-scroll:/catalog?q=a&cursor=c-1')).toBeNull();
    });

    it('saves again once the address bar is back at the list', () => {
      // A real frame: the callback runs after the scroll handler has returned.
      const frames: FrameRequestCallback[] = [];
      vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
        frames.push(callback),
      );
      render(<ProductGrid {...props()} />);
      history.replaceState(null, '', '/catalog?q=a&cursor=c-1');
      scrollTo(5000);
      frames.shift()?.(0);
      expect(sessionStorage.getItem(key)).toBeNull();
      history.replaceState(null, '', '/catalog?q=a');
      scrollTo(5100);
      frames.shift()?.(0);
      expect(JSON.parse(sessionStorage.getItem(key) ?? 'null')).toMatchObject({ offset: 5100 });
    });

    it('saves under the new address after the router moves the same grid on', () => {
      stubFrames();
      const { rerender } = render(<ProductGrid {...props()} />);
      nav.search = 'q=a&cursor=c-1';
      history.replaceState(null, '', '/catalog?q=a&cursor=c-1');
      rerender(<ProductGrid {...props()} />);
      scrollTo(300);
      expect(
        JSON.parse(sessionStorage.getItem('catalog-scroll:/catalog?q=a&cursor=c-1') ?? 'null'),
      ).toMatchObject({ offset: 300 });
      expect(sessionStorage.getItem(key)).toBeNull();
    });
  });

  it('goes back once only, not on each later render', async () => {
    sessionStorage.setItem(key, JSON.stringify({ offset: 2400 }));
    loadedByTraversal();
    const { rerender } = render(<ProductGrid {...props()} />);
    await act(async () => {
      rerender(<ProductGrid {...props({ products: productsOf(80) })} />);
    });
    expect(virtual.scrollToOffset).toHaveBeenCalledTimes(1);
  });
});
