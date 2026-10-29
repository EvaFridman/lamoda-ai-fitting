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
    updatedAt: DATE,
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
    await user.click(within(drawer).getByRole('button', { name: /^Сортировка/ }));
    const sortScreen = within(await screen.findByRole('dialog', { name: 'Сортировка' }));
    await user.click(sortScreen.getByRole('radio', { name: 'По рейтингу' }));
    await user.click(sortScreen.getByRole('button', { name: 'Применить' }));
    await vi.waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Сортировка' })).not.toBeInTheDocument(),
    );
    expect(sent('Catalog Filter Applied')).toEqual([]);
    expect(sent('Catalog Sorted')).toEqual([]);

    await user.click(within(drawer).getByRole('button', { name: /^Показать/ }));
    expect(sent('Catalog Filter Applied')).toEqual([{ filter: 'discount', values: 1 }]);
    expect(sent('Catalog Sorted')).toEqual([{ sort: 'rating' }]);
    expect(nav.replace).toHaveBeenCalledTimes(1);
  });

  it('sends each filter gone, and the sort back to the default, on "Сбросить" and "Показать"', async () => {
    mount({ brandId: [BRAND], hasDiscount: true, sort: 'rating' });
    await screen.findByRole('button', { name: 'Сбросить «Бренд»' });
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await user.click(screen.getByRole('button', { name: 'Фильтры' }));
    const drawer = await screen.findByRole('dialog');
    await user.click(within(drawer).getByRole('button', { name: 'Сбросить' }));
    expect(sent('Catalog Filter Applied')).toEqual([]);
    expect(sent('Catalog Sorted')).toEqual([]);

    await user.click(within(drawer).getByRole('button', { name: /^Показать/ }));
    expect(sent('Catalog Filter Applied')).toEqual([
      { filter: 'brand', values: 0 },
      { filter: 'discount', values: 0 },
    ]);
    expect(sent('Catalog Sorted')).toEqual([{ sort: 'new' }]);
  });

  it('sends Element Clicked catalog.sheet-open with active for the drawer button, and no hover', async () => {
    mount({ brandId: [BRAND] });
    await screen.findByRole('button', { name: 'Сбросить «Бренд»' });
    fireEvent.click(screen.getByRole('button', { name: 'Фильтры' }));
    expect(sent('Element Clicked')).toEqual([
      { element: 'catalog.sheet-open', zone: 'catalog', type: 'interaction', active: true },
    ]);
    expect(sent('Element Hovered')).toEqual([]);
  });
});

describe('the phone bar and category list', () => {
  // The sheet's list exists only while the sheet is open, and after the counts have loaded.
  const sheet = () => screen.findByRole('dialog', { name: 'Категории' });
  const phoneList = async () =>
    within(await sheet()).findByRole('navigation', { name: 'Список категорий' });
  // The open sheet's modal layer sets `pointer-events: none` on the page around it.
  const phoneUser = () => userEvent.setup({ pointerEventsCheck: 0 });

  it('labels the toggle "Все товары" on the catalog', async () => {
    mount();
    expect(await screen.findByRole('button', { name: 'Все товары' })).toBeInTheDocument();
  });

  it('labels the toggle with the title on a category', async () => {
    mount({}, { title: 'Платья', categoryId: CATEGORY });
    expect(await screen.findByRole('button', { name: 'Платья' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('opens the categories in a sheet on the click, with no list in the page before', async () => {
    mount();
    const toggle = await screen.findByRole('button', { name: 'Все товары' });
    await vi.waitFor(() => expect(document.querySelectorAll('aside a')).toHaveLength(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await phoneUser().click(toggle);
    expect(await sheet()).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('leaves the grid and the page address alone while the sheet opens', async () => {
    mount();
    const toggle = await screen.findByRole('button', { name: 'Все товары' });
    await screen.findByText('products:1');
    await phoneUser().click(toggle);
    await phoneList();
    expect(screen.getByText('products:1')).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('turns the chevron with the sheet and back when it closes', async () => {
    mount();
    const toggle = await screen.findByRole('button', { name: 'Все товары' });
    const closed = toggle.querySelector('svg')!.innerHTML;
    const user = phoneUser();
    await user.click(toggle);
    await phoneList();
    expect(toggle.querySelector('svg')!.innerHTML).not.toBe(closed);

    await user.keyboard('{Escape}');
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle.querySelector('svg')!.innerHTML).toBe(closed);
  });

  it('closes on Escape and returns the focus to the toggle', async () => {
    mount();
    const toggle = await screen.findByRole('button', { name: 'Все товары' });
    const user = phoneUser();
    await user.click(toggle);
    await phoneList();
    await user.keyboard('{Escape}');
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await vi.waitFor(() => expect(toggle).toHaveFocus());
  });

  it('lists «Все товары» first, then the categories, each with its count', async () => {
    mount();
    const toggle = await screen.findByRole('button', { name: 'Все товары' });
    await phoneUser().click(toggle);
    const links = within(await phoneList()).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Все товары 40', 'Платья 5']);
  });

  describe('the count of «Все товары»', () => {
    const SKIRTS = id(3);
    const category = (categoryId: string, name: string, slug: string, sortOrder: number) => ({
      id: categoryId,
      name,
      slug,
      isActive: true,
      description: null,
      sortOrder,
      slot: null,
      createdAt: DATE,
      updatedAt: DATE,
    });

    function answerWith(body: typeof facets) {
      fetchMock.mockImplementation((input: unknown) => {
        const path = new URL(String(input), 'http://localhost').pathname;
        if (path.endsWith('/products/facets')) return Promise.resolve(json(body));
        if (path.endsWith('/categories')) {
          return Promise.resolve(
            json({
              items: [
                category(CATEGORY, 'Платья', 'dresses', 0),
                category(SKIRTS, 'Юбки', 'skirts', 1),
              ],
              total: 2,
            }),
          );
        }
        return Promise.resolve(answer(input));
      });
    }

    it("is the facets' total on the catalog, even when it differs from the rows' sum", async () => {
      // 40 products in all, 5 + 3 in the listed categories: the rest are in inactive ones.
      answerWith({
        ...facets,
        total: 40,
        categories: [
          { id: CATEGORY, name: 'Платья', count: 5 },
          { id: SKIRTS, name: 'Юбки', count: 3 },
        ],
      });
      mount();
      await phoneUser().click(await screen.findByRole('button', { name: 'Все товары' }));
      const all = await within(await phoneList()).findByRole('link', { name: /^Все товары/ });
      expect(all).toHaveTextContent('Все товары 40');
    });

    it("is the rows' sum on a category's page, not the page's total", async () => {
      answerWith({
        ...facets,
        total: 5,
        categories: [
          { id: CATEGORY, name: 'Платья', count: 5 },
          { id: SKIRTS, name: 'Юбки', count: 3 },
        ],
      });
      mount({}, { title: 'Платья', categoryId: CATEGORY });
      await phoneUser().click(await screen.findByRole('button', { name: 'Платья' }));
      const all = await within(await phoneList()).findByRole('link', { name: /^Все товары/ });
      expect(all).toHaveTextContent('Все товары 8');
    });
  });

  it('links «Все товары» to the catalog with the selection kept and marks it on the catalog', async () => {
    mount({ q: 'платье', sort: 'price_asc' });
    await phoneUser().click(await screen.findByRole('button', { name: 'Все товары' }));
    const all = within(await phoneList()).getByRole('link', { name: /^Все товары/ });
    expect(all).toHaveAttribute(
      'href',
      `/catalog?q=${encodeURIComponent('платье')}&sort=price_asc`,
    );
    expect(all).toHaveAttribute('aria-current', 'page');
  });

  it("keeps the selection in a phone row's link like the desktop one", async () => {
    mount({ q: 'платье', sort: 'price_asc' });
    const toggle = await screen.findByRole('button', { name: 'Все товары' });
    const desktopRow = await vi.waitFor(() => {
      const row = document.querySelector('aside a');
      if (row === null) throw new Error('no desktop row yet');
      return row;
    });
    const href = desktopRow.getAttribute('href');
    expect(href).toBe(`/catalog/dresses?q=${encodeURIComponent('платье')}&sort=price_asc`);
    await phoneUser().click(toggle);
    const phone = await within(await phoneList()).findByRole('link', { name: 'Платья 5' });
    expect(phone).toHaveAttribute('href', href);
    expect(phone).not.toHaveAttribute('aria-current');
  });

  it('marks the chosen category, and not «Все товары», in the sheet', async () => {
    mount({}, { title: 'Платья', categoryId: CATEGORY });
    await phoneUser().click(await screen.findByRole('button', { name: 'Платья' }));
    const list = within(await phoneList());
    expect(await list.findByRole('link', { name: 'Платья 5' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(list.getByRole('link', { name: /^Все товары/ })).not.toHaveAttribute('aria-current');
  });

  it('closes the sheet on a row and sends catalog.category once', async () => {
    mount();
    const toggle = await screen.findByRole('button', { name: 'Все товары' });
    const user = phoneUser();
    await user.click(toggle);
    const row = await within(await phoneList()).findByRole('link', { name: 'Платья 5' });
    // jsdom does not navigate.
    row.addEventListener('click', (event) => event.preventDefault());
    vi.mocked(track).mockClear();
    await user.click(row);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenLastCalledWith('Element Clicked', {
      element: 'catalog.category',
      zone: 'catalog',
      type: 'navigation',
    });
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the sheet on «Все товары» as well', async () => {
    mount({}, { title: 'Платья', categoryId: CATEGORY });
    const user = phoneUser();
    await user.click(await screen.findByRole('button', { name: 'Платья' }));
    const all = await within(await phoneList()).findByRole('link', { name: /^Все товары/ });
    all.addEventListener('click', (event) => event.preventDefault());
    await user.click(all);
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  describe('the rows while the counts of a new selection are not there (plan §4)', () => {
    const OTHER = id(3);
    const isFacets = (input: unknown) =>
      new URL(String(input), 'http://localhost').pathname.endsWith('/products/facets');
    const desktopRows = () => document.querySelectorAll('aside a');

    // The sheet is open; its rows are «Все товары» and the one category.
    async function rowsShown() {
      const toggle = await screen.findByRole('button', { name: 'Все товары' });
      await vi.waitFor(() => expect(desktopRows()).toHaveLength(1));
      await phoneUser().click(toggle);
      const list = await phoneList();
      expect(within(list).getAllByRole('link')).toHaveLength(2);
      return list;
    }

    it('keeps both lists while the counts of a filter load', async () => {
      const { show } = mount();
      const list = await rowsShown();
      fetchMock.mockImplementation((input: unknown) =>
        isFacets(input) && String(input).includes('hasDiscount')
          ? new Promise<Response>(() => {})
          : Promise.resolve(answer(input)),
      );
      show({ hasDiscount: true });
      await vi.waitFor(() =>
        expect(fetchMock.mock.calls.some(([input]) => String(input).includes('hasDiscount'))).toBe(
          true,
        ),
      );
      await act(async () => {});
      expect(desktopRows()).toHaveLength(1);
      expect(within(list).getAllByRole('link')).toHaveLength(2);
    });

    it('keeps both lists when the counts of a filter fail', async () => {
      const { show } = mount();
      const list = await rowsShown();
      fetchMock.mockImplementation((input: unknown) =>
        Promise.resolve(
          isFacets(input) && String(input).includes('hasDiscount')
            ? json({ error: { code: 'INTERNAL', message: 'm', details: [] } }, 500)
            : answer(input),
        ),
      );
      show({ hasDiscount: true });
      await vi.waitFor(() =>
        expect(fetchMock.mock.calls.some(([input]) => String(input).includes('hasDiscount'))).toBe(
          true,
        ),
      );
      await act(async () => {});
      expect(desktopRows()).toHaveLength(1);
      expect(within(list).getAllByRole('link')).toHaveLength(2);
    });

    it("shows no rows of another category's counts while its counts fail", async () => {
      fetchMock.mockImplementation((input: unknown) =>
        Promise.resolve(
          isFacets(input) && String(input).includes(OTHER)
            ? json({ error: { code: 'INTERNAL', message: 'm', details: [] } }, 500)
            : answer(input),
        ),
      );
      const { show } = mount({}, { title: 'Платья', categoryId: CATEGORY });
      await vi.waitFor(() => expect(desktopRows()).toHaveLength(1));

      show({}, { title: 'Юбки', categoryId: OTHER });
      await vi.waitFor(() => expect(desktopRows()).toHaveLength(0));
      // No rows, so no phone list either: nothing of the previous category's.
      const toggle = screen.getByRole('button', { name: 'Юбки' });
      await phoneUser().click(toggle);
      await sheet();
      expect(screen.queryAllByRole('link', { name: /Платья/ })).toHaveLength(0);
    });
  });

  it('sends Element Clicked catalog.category-toggle with expanded true when the click opens the sheet', async () => {
    mount();
    const toggle = await screen.findByRole('button', { name: 'Все товары' });
    await phoneUser().click(toggle);
    await phoneList();
    expect(sent('Element Clicked')).toEqual([
      expect.objectContaining({ element: 'catalog.category-toggle', expanded: true }),
    ]);
  });

  it('sends nothing when Escape closes the sheet', async () => {
    mount();
    const toggle = await screen.findByRole('button', { name: 'Все товары' });
    const user = phoneUser();
    await user.click(toggle);
    await phoneList();
    vi.mocked(track).mockClear();
    await user.keyboard('{Escape}');
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(track).not.toHaveBeenCalled();
  });
});

describe('the scroll after a filter change', () => {
  const rect = (top: number) => ({ top }) as DOMRect;
  let scrollTo: ReturnType<typeof vi.fn>;
  // The page is scrolled to 1000; the column's top is then 400 and the bar's 200 on the page.
  function boxes(options: { sticky: boolean; barShown: boolean }) {
    scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    Object.defineProperty(window, 'scrollY', { value: 1000, configurable: true });
    // The real style, with `position` overridden for the heading and bar block only.
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
      const style = real(element, pseudo);
      if (!element.classList.contains('top')) return style;
      return new Proxy(style, {
        get(target, property) {
          if (property === 'position') return options.sticky ? 'sticky' : 'static';
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    });
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(90);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      if (this.classList.contains('column')) return rect(400 - window.scrollY);
      if (this.classList.contains('bar')) return rect(200 - window.scrollY);
      return rect(0);
    });
    vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
      const shown = !this.classList.contains('bar') || options.barShown;
      return (shown ? [rect(0)] : []) as unknown as DOMRectList;
    });
  }

  async function change() {
    mount();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Только со скидкой' }));
  }

  afterEach(() => {
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  // The categories are a sheet over the page (spec 0024 Z3): opening and closing it never scrolls.
  it('does not scroll the page when the categories sheet opens or closes', async () => {
    boxes({ sticky: true, barShown: true });
    mount();
    const toggle = await screen.findByRole('button', { name: 'Все товары' });
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await user.click(toggle);
    await screen.findByRole('dialog', { name: 'Категории' });
    await user.keyboard('{Escape}');
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('goes under the stuck block when the heading and bar stick', async () => {
    boxes({ sticky: true, barShown: true });
    await change();
    expect(scrollTo).toHaveBeenCalledWith({ top: 400 - 90 });
  });

  it('goes to the bar when it shows and nothing sticks', async () => {
    boxes({ sticky: false, barShown: true });
    await change();
    expect(scrollTo).toHaveBeenCalledWith({ top: 200 });
  });

  it("goes to the column's top when the bar is hidden", async () => {
    boxes({ sticky: false, barShown: false });
    await change();
    expect(scrollTo).toHaveBeenCalledWith({ top: 400 });
  });

  it('does not scroll when the visitor is above the target', async () => {
    boxes({ sticky: false, barShown: false });
    Object.defineProperty(window, 'scrollY', { value: 300, configurable: true });
    await change();
    expect(scrollTo).not.toHaveBeenCalled();
  });
});

describe('the category list', () => {
  it('sends Element Clicked and Element Hovered for a row, without its name', async () => {
    mount();
    // The desktop list is the one in the aside; the hidden phone list has the same rows.
    const desktop = document.querySelector('aside')!;
    const row = (await within(desktop).findByText('Платья')).closest('a')!;
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
