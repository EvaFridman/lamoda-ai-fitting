import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProductGridProps } from '@/widgets/product-grid';

import type { CatalogQuery } from '../model/url-state';

// The tab's memory of what `Catalog Searched` counted lives in modules: each test loads fresh
// copies of them (and so of the `track` mock the page calls).
let CatalogBrowser: typeof import('./catalog-browser').CatalogBrowser;
let createBrowserQueryClient: typeof import('@/_app/providers').createBrowserQueryClient;
let markSearchSubmitted: typeof import('@/features/header-search/model/submitted-search').markSearchSubmitted;
let track: typeof import('@/shared/analytics/client').track;

const nav = vi.hoisted(() => ({ pathname: '/catalog', replace: vi.fn() }));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/shared/analytics/client', () => ({ track: vi.fn() }));
// The grid is replaced by a stub that asks for batches the way the real one does.
vi.mock('@/widgets/product-grid', () => ({
  ProductGridSkeleton: () => <p>grid-skeleton</p>,
  ProductGrid: (props: ProductGridProps) => (
    <div>
      <p>{`products:${props.products.length}`}</p>
      <button type="button" onClick={() => props.onLoadMore(false)}>
        scroll
      </button>
      <button type="button" onClick={() => props.onLoadMore(true)}>
        restore
      </button>
    </div>
  ),
}));
vi.mock('@/shared/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/shared/api')>();
  return { ...original, reportFailure: vi.fn() };
});

const fetchMock = vi.fn();

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const BRAND = id(1);
const CATEGORY = id(2);
const DATE = '2026-10-01T12:00:00.000Z';

function product(n: number) {
  return {
    id: id(1000 + n),
    article: `A-${n}`,
    name: `Платье ${n}`,
    brand: { id: BRAND, name: 'Nike' },
    category: { id: CATEGORY, name: 'Платья', slug: 'dresses' },
    image: null,
    price: 5000,
    discount: 0,
    finalPrice: 5000,
    rating: null,
    createdAt: DATE,
  };
}

const facets = {
  total: 40,
  discounted: 4,
  price: null,
  categories: [{ id: CATEGORY, name: 'Платья', count: 5 }],
  brands: [{ id: BRAND, name: 'Nike', count: 12 }],
  sizes: [],
  attributes: [],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

// The batches by the address's search and cursor; the counts and the categories answer as they are.
type Batch = (params: URLSearchParams) => Response;
let batch: Batch;

function answer(input: unknown): Response {
  const url = new URL(String(input), 'http://localhost');
  if (url.pathname.endsWith('/products/facets')) return json(facets);
  if (url.pathname.endsWith('/categories')) {
    return json({
      items: [
        {
          id: CATEGORY,
          name: 'Платья',
          slug: 'dresses',
          isActive: true,
          description: null,
          sortOrder: 0,
          slot: null,
          createdAt: DATE,
          updatedAt: DATE,
        },
      ],
      total: 1,
    });
  }
  return batch(url.searchParams);
}

// The first batch with a total, then batches by cursor up to `c-4`.
const walking: Batch = (params) => {
  const cursor = params.get('cursor');
  const next = cursor === null ? 'c-2' : cursor === 'c-2' ? 'c-3' : 'c-4';
  return json({ items: [product(1)], total: cursor === null ? 40 : null, nextCursor: next });
};

// A path of its own for each test: a hover is sent once per path.
let testNumber = 0;

beforeEach(async () => {
  vi.resetModules();
  ({ CatalogBrowser } = await import('./catalog-browser'));
  ({ createBrowserQueryClient } = await import('@/_app/providers'));
  ({ markSearchSubmitted } = await import('@/features/header-search/model/submitted-search'));
  ({ track } = await import('@/shared/analytics/client'));
  nav.replace.mockClear();
  testNumber += 1;
  nav.pathname = `/catalog-${testNumber}`;
  batch = walking;
  fetchMock.mockReset();
  fetchMock.mockImplementation((input: unknown) => Promise.resolve(answer(input)));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

type BrowserProps = Parameters<typeof CatalogBrowser>[0];

function page(query: CatalogQuery, extra: Partial<BrowserProps> = {}) {
  return <CatalogBrowser title="Каталог" query={query} {...extra} />;
}

function mount(query: CatalogQuery = {}, extra: Partial<BrowserProps> = {}) {
  const client = createBrowserQueryClient();
  const view = render(
    <QueryClientProvider client={client}>{page(query, extra)}</QueryClientProvider>,
  );
  return {
    // Same client, so the cache is the page's own.
    show: (next: CatalogQuery, more: Partial<BrowserProps> = {}) =>
      view.rerender(<QueryClientProvider client={client}>{page(next, more)}</QueryClientProvider>),
    unmount: view.unmount,
  };
}

function sent(name: string) {
  return vi
    .mocked(track)
    .mock.calls.filter(([event]) => event === name)
    .map(([, properties]) => properties);
}

describe('Catalog Searched', () => {
  async function settled() {
    await screen.findByText('products:1');
    await act(async () => {});
  }

  // The document's first load, as `performance` reports it.
  function documentLoaded(type: string, name = window.location.href) {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
      { type, name } as PerformanceNavigationTiming,
    ]);
  }

  describe('by a header submit (O105)', () => {
    it('is sent with the length in characters and the total, never the text', async () => {
      act(() => markSearchSubmitted('👗abc'));
      mount({ q: '👗abc' });
      await vi.waitFor(() => expect(sent('Catalog Searched')).toHaveLength(1));
      expect(sent('Catalog Searched')).toEqual([{ query_length: 4, results: 40 }]);
      expect(JSON.stringify(vi.mocked(track).mock.calls)).not.toContain('abc');
    });

    it('is sent again for the same query submitted again, though the page does not change', async () => {
      act(() => markSearchSubmitted('кофта'));
      mount({ q: 'кофта' });
      await vi.waitFor(() => expect(sent('Catalog Searched')).toHaveLength(1));
      const requests = fetchMock.mock.calls.length;

      act(() => markSearchSubmitted('кофта'));
      await vi.waitFor(() => expect(sent('Catalog Searched')).toHaveLength(2));
      expect(fetchMock.mock.calls.length).toBe(requests);
      expect(sent('Catalog Searched')[1]).toEqual({ query_length: 5, results: 40 });
    });

    it('is sent for a query submitted on a page that shows another search', async () => {
      const { show } = mount({ q: 'old' });
      await settled();
      batch = (params) =>
        json({ items: [product(1)], total: params.get('q') === 'new' ? 7 : 1, nextCursor: null });
      act(() => markSearchSubmitted('new'));
      show({ q: 'new' });
      await vi.waitFor(() => expect(sent('Catalog Searched')).toHaveLength(1));
      expect(sent('Catalog Searched')).toEqual([{ query_length: 3, results: 7 }]);
    });

    it('is not sent when the page shows another query than the one submitted', async () => {
      act(() => markSearchSubmitted('one'));
      mount({ q: 'two' });
      await settled();
      expect(sent('Catalog Searched')).toEqual([]);
    });

    it('is not sent on a category page, which is not the page the header opens, nor is the submit used up', async () => {
      act(() => markSearchSubmitted('кофта'));
      const old = mount({ q: 'кофта' }, { title: 'Платья', categoryId: id(10) });
      await settled();
      expect(sent('Catalog Searched')).toEqual([]);
      old.unmount();

      mount({ q: 'кофта' });
      await vi.waitFor(() => expect(sent('Catalog Searched')).toHaveLength(1));
      expect(sent('Catalog Searched')).toEqual([{ query_length: 5, results: 40 }]);
    });

    it('is not sent again on a category page with the same q and no new submit', async () => {
      act(() => markSearchSubmitted('кофта'));
      const first = mount({ q: 'кофта' });
      await vi.waitFor(() => expect(sent('Catalog Searched')).toHaveLength(1));
      first.unmount();

      mount({ q: 'кофта' }, { title: 'Юбки', categoryId: id(11) });
      await settled();
      expect(sent('Catalog Searched')).toHaveLength(1);
    });

    it('is not sent on a page with filters, and the submit stays for the page the header opens', async () => {
      act(() => markSearchSubmitted('кофта'));
      const { show } = mount({ q: 'кофта', brandId: [BRAND] });
      await settled();
      expect(sent('Catalog Searched')).toEqual([]);

      show({ q: 'кофта' });
      await vi.waitFor(() => expect(sent('Catalog Searched')).toHaveLength(1));
    });

    it('is not sent for a submit older than 60 seconds', async () => {
      const now = vi.spyOn(Date, 'now');
      now.mockReturnValue(1_000_000);
      act(() => markSearchSubmitted('кофта'));
      now.mockReturnValue(1_060_001);
      mount({ q: 'кофта' });
      await settled();
      expect(sent('Catalog Searched')).toEqual([]);
    });

    it('is sent for a submit exactly 60 seconds old', async () => {
      const now = vi.spyOn(Date, 'now');
      now.mockReturnValue(1_000_000);
      act(() => markSearchSubmitted('кофта'));
      now.mockReturnValue(1_060_000);
      mount({ q: 'кофта' });
      await vi.waitFor(() => expect(sent('Catalog Searched')).toHaveLength(1));
    });

    it('is not sent for a change of the filters or the sort', async () => {
      act(() => markSearchSubmitted('кофта'));
      const { show } = mount({ q: 'кофта' });
      await vi.waitFor(() => expect(sent('Catalog Searched')).toHaveLength(1));
      show({ q: 'кофта', sort: 'rating' });
      await settled();
      show({ q: 'кофта', sort: 'rating', hasDiscount: true });
      await settled();
      expect(sent('Catalog Searched')).toHaveLength(1);
    });

    it('is not sent for a page started from a cursor, which is not the header page, and the submit is not used up', async () => {
      batch = () => json({ items: [product(1)], total: null, nextCursor: null });
      act(() => markSearchSubmitted('платье'));
      const { show } = mount({ q: 'платье' }, { start: 'c-1' });
      await settled();
      expect(sent('Catalog Searched')).toEqual([]);

      batch = () => json({ items: [product(1)], total: 9, nextCursor: null });
      show({ q: 'платье' }, { start: undefined });
      await vi.waitFor(() => expect(sent('Catalog Searched')).toHaveLength(1));
      expect(sent('Catalog Searched')).toEqual([{ query_length: 6, results: 9 }]);
    });
  });

  describe('by the first page of the tab (O105)', () => {
    it('is sent when the document was opened at this address by a link', async () => {
      documentLoaded('navigate');
      mount({ q: 'шарф' });
      await vi.waitFor(() => expect(sent('Catalog Searched')).toHaveLength(1));
      expect(sent('Catalog Searched')).toEqual([{ query_length: 4, results: 40 }]);
    });

    it('is sent once: the next catalog page of the tab is not the document entry', async () => {
      documentLoaded('navigate');
      const first = mount({ q: 'шарф' });
      await vi.waitFor(() => expect(sent('Catalog Searched')).toHaveLength(1));
      first.unmount();

      mount({ q: 'шарф' }, { categoryId: id(10) });
      await settled();
      expect(sent('Catalog Searched')).toHaveLength(1);
    });

    it.each(['reload', 'back_forward'])('is not sent for a document loaded by %s', async (type) => {
      documentLoaded(type);
      mount({ q: 'шарф' });
      await settled();
      expect(sent('Catalog Searched')).toEqual([]);
    });

    it('is not sent for a document loaded at another address', async () => {
      documentLoaded('navigate', 'http://localhost/catalog?q=other');
      mount({ q: 'шарф' });
      await settled();
      expect(sent('Catalog Searched')).toEqual([]);
    });

    it('is not sent for a page with no search, and that page is the one that was looked at', async () => {
      documentLoaded('navigate');
      const plain = mount({});
      await settled();
      plain.unmount();

      mount({ q: 'шарф' });
      await settled();
      expect(sent('Catalog Searched')).toEqual([]);
    });

    it('is not sent for a start from a cursor, and the entry counts as consumed', async () => {
      documentLoaded('navigate');
      batch = () => json({ items: [product(1)], total: null, nextCursor: null });
      const { show } = mount({ q: 'шарф' }, { start: 'c-1' });
      await settled();

      batch = () => json({ items: [product(1)], total: 9, nextCursor: null });
      show({ q: 'шарф' }, { start: undefined });
      await settled();
      expect(sent('Catalog Searched')).toEqual([]);
    });
  });

  describe('the document entry is decided at the first catalog mount', () => {
    // The first request for a batch waits for `release`; later ones answer at once.
    function holdFirstBatch() {
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => (release = resolve));
      let held1 = false;
      fetchMock.mockImplementation(async (input: unknown) => {
        const path = new URL(String(input), 'http://localhost').pathname;
        if (!held1 && !path.endsWith('/facets') && !path.endsWith('/categories')) {
          held1 = true;
          await held;
        }
        return answer(input);
      });
      return release;
    }

    it("sends when the first mount's batch arrives later", async () => {
      documentLoaded('navigate');
      const release = holdFirstBatch();
      mount({ q: 'шарф' });
      await act(async () => {});
      expect(sent('Catalog Searched')).toEqual([]);
      await act(async () => release());
      await vi.waitFor(() => expect(sent('Catalog Searched')).toHaveLength(1));
    });

    it('does not count a second mount at the same address whose batch is there at once', async () => {
      documentLoaded('navigate');
      holdFirstBatch();
      const first = mount({ q: 'шарф' });
      await act(async () => {});
      first.unmount();

      mount({ q: 'шарф' });
      await settled();
      expect(sent('Catalog Searched')).toEqual([]);
    });
  });

  it('is not sent without a search, a submit or a document entry', async () => {
    mount({ q: 'шарф' });
    await settled();
    expect(sent('Catalog Searched')).toEqual([]);
  });
});

describe('Catalog Batch Loaded', () => {
  it('is not sent for a batch that arrives after the selection changed', async () => {
    const { show } = mount({});
    const user = userEvent.setup();
    const button = await screen.findByRole('button', { name: 'scroll' });
    let release: (response: Response) => void = () => {};
    const held = new Promise<Response>((resolve) => (release = resolve));
    fetchMock.mockImplementation((input: unknown) => {
      const url = new URL(String(input), 'http://localhost');
      return url.searchParams.get('cursor') === 'c-2' ? held : Promise.resolve(answer(input));
    });
    await user.click(button);
    await vi.waitFor(() =>
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes('cursor=c-2'))).toBe(
        true,
      ),
    );

    // The visitor's choice reaches the address while the batch is on its way.
    await user.click(screen.getByRole('button', { name: 'Только со скидкой' }));
    expect(nav.replace).toHaveBeenCalledTimes(1);
    show({ hasDiscount: true });
    await act(async () => {
      release(json({ items: [product(2)], total: null, nextCursor: 'c-3' }));
    });
    await act(async () => {});
    expect(sent('Catalog Batch Loaded')).toEqual([]);
  });

  it('is not sent when the call added no page', async () => {
    batch = () => json({ items: [product(1)], total: 1, nextCursor: null });
    mount({});
    await userEvent.setup().click(await screen.findByRole('button', { name: 'scroll' }));
    await act(async () => {});
    expect(sent('Catalog Batch Loaded')).toEqual([]);
    expect(screen.getByText('products:1')).toBeInTheDocument();
  });

  it('is sent with the number of the batch in the list after each scroll load', async () => {
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'scroll' }));
    await vi.waitFor(() => expect(sent('Catalog Batch Loaded')).toHaveLength(1));
    await screen.findByText('products:2');
    await user.click(screen.getByRole('button', { name: 'scroll' }));
    await vi.waitFor(() => expect(sent('Catalog Batch Loaded')).toHaveLength(2));
    expect(sent('Catalog Batch Loaded')).toEqual([{ batch: 2 }, { batch: 3 }]);
  });

  it('is not sent for a batch loaded to go back to a place', async () => {
    mount();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'restore' }));
    await screen.findByText('products:2');
    expect(sent('Catalog Batch Loaded')).toEqual([]);
  });

  it('is not sent when the batch fails', async () => {
    mount();
    const button = await screen.findByRole('button', { name: 'scroll' });
    batch = () => json({ error: { code: 'INTERNAL_ERROR', message: 'm', details: [] } }, 500);
    await userEvent.setup().click(button);
    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(3));
    await act(async () => {});
    expect(sent('Catalog Batch Loaded')).toEqual([]);
  });
});

describe('Catalog Filter Applied and Catalog Sorted from the row', () => {
  it('sends the discount chip once, as 1, and no sort', async () => {
    mount({ q: 'платье' });
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Только со скидкой' }));
    expect(sent('Catalog Filter Applied')).toEqual([{ filter: 'discount', values: 1 }]);
    expect(sent('Catalog Sorted')).toEqual([]);
    expect(nav.replace).toHaveBeenCalledTimes(1);
  });

  it('sends values 0 for the × of a chip', async () => {
    mount({ brandId: [BRAND] });
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Сбросить «Бренд»' }));
    expect(sent('Catalog Filter Applied')).toEqual([{ filter: 'brand', values: 0 }]);
    expect(sent('Catalog Sorted')).toEqual([]);
  });

  it('sends the picked sort alone', async () => {
    mount({ brandId: [BRAND] });
    await screen.findByRole('button', { name: 'Сбросить «Бренд»' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Новинки' }));
    await user.click(screen.getByRole('radio', { name: 'Сначала дешевле' }));
    expect(sent('Catalog Sorted')).toEqual([{ sort: 'price_asc' }]);
    expect(sent('Catalog Filter Applied')).toEqual([]);
  });

  it('sends the default sort when the chosen one is picked away', async () => {
    mount({ sort: 'price_asc' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Сначала дешевле' }));
    await user.click(screen.getByRole('radio', { name: 'Новинки' }));
    expect(sent('Catalog Sorted')).toEqual([{ sort: 'new' }]);
  });
});

describe('the drawer', () => {
  it('sends one Filter Applied per changed filter and the sort, on "Показать"', async () => {
    mount({ brandId: [BRAND] });
    await screen.findByRole('button', { name: 'Сбросить «Бренд»' });
    // The open drawer's modal layer sets `pointer-events: none` on the page around it.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await user.click(screen.getByRole('button', { name: 'Фильтры' }));
    const drawer = await screen.findByRole('dialog');
    await user.click(within(drawer).getByRole('switch', { name: 'Только со скидкой' }));
    await user.click(within(drawer).getByRole('button', { name: 'Сортировка' }));
    await user.click(within(drawer).getByRole('radio', { name: 'По рейтингу' }));
    expect(track).not.toHaveBeenCalled();

    await user.click(within(drawer).getByRole('button', { name: /^Показать/ }));
    expect(sent('Catalog Filter Applied')).toEqual([{ filter: 'discount', values: 1 }]);
    expect(sent('Catalog Sorted')).toEqual([{ sort: 'rating' }]);
    expect(nav.replace).toHaveBeenCalledTimes(1);
  });

  it('sends each filter gone on "Очистить фильтры"', async () => {
    mount({ brandId: [BRAND], hasDiscount: true, sort: 'rating' });
    await screen.findByRole('button', { name: 'Сбросить «Бренд»' });
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await user.click(screen.getByRole('button', { name: 'Фильтры' }));
    const drawer = await screen.findByRole('dialog');
    await user.click(within(drawer).getByRole('button', { name: 'Очистить фильтры' }));
    expect(sent('Catalog Filter Applied')).toEqual([
      { filter: 'brand', values: 0 },
      { filter: 'discount', values: 0 },
    ]);
    expect(sent('Catalog Sorted')).toEqual([]);
  });

  it('sends no click or hover for the drawer button', async () => {
    mount();
    await screen.findByRole('button', { name: 'Только со скидкой' });
    fireEvent.click(screen.getByRole('button', { name: 'Фильтры' }));
    expect(track).not.toHaveBeenCalled();
  });
});

describe('the category list', () => {
  it('sends Element Clicked and Element Hovered for a row, without its name', async () => {
    mount();
    const row = (await screen.findByText('Платья')).closest('a')!;
    // jsdom does not navigate.
    row.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(row);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenLastCalledWith('Element Clicked', {
      element: 'catalog.category',
      zone: 'catalog',
      type: 'navigation',
    });

    vi.useFakeTimers();
    fireEvent.pointerEnter(row, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(500));
    expect(track).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenLastCalledWith('Element Hovered', {
      element: 'catalog.category',
      zone: 'catalog',
      type: 'navigation',
    });
  });
});
