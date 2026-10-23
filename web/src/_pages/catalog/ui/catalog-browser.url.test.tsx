import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({
  pathname: '/catalog',
  replace: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/shared/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/shared/api')>();
  return { ...original, reportFailure: vi.fn() };
});

import { createBrowserQueryClient } from '@/_app/providers';

import { CatalogBrowser, type CatalogBrowserProps } from './catalog-browser';

const fetchMock = vi.fn();

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DATE = '2026-10-01T12:00:00.000Z';
const DRESSES = id(10);
const SKIRTS = id(11);
const HIDDEN = id(12);
const NIKE = id(1);

const product = {
  id: id(50),
  article: 'A-1',
  name: 'Летнее платье',
  brand: { id: NIKE, name: 'Nike' },
  category: { id: DRESSES, name: 'Платья', slug: 'dresses' },
  image: null,
  price: 5000,
  discount: 0,
  finalPrice: 5000,
  rating: null,
  createdAt: DATE,
};

function categoryRecord(categoryId: string, name: string, slug: string) {
  return {
    id: categoryId,
    name,
    slug,
    isActive: true,
    description: null,
    sortOrder: 1,
    slot: null,
    createdAt: DATE,
    updatedAt: DATE,
  };
}

function facetsOf(total: number) {
  return {
    total,
    discounted: 1,
    price: { min: 1000, max: 10000 },
    categories: [
      { id: DRESSES, name: 'Платья', count: 5 },
      { id: SKIRTS, name: 'Юбки', count: 3 },
      { id: HIDDEN, name: 'Скрытая', count: 1 },
    ],
    brands: [
      { id: NIKE, name: 'Nike', count: 12 },
      { id: id(2), name: 'Puma', count: 5 },
    ],
    sizes: [],
    attributes: [],
  };
}

function stubApi(batch: unknown, total = 1) {
  fetchMock.mockImplementation((input: unknown) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    const body = path.endsWith('/products/facets')
      ? facetsOf(total)
      : path.endsWith('/categories')
        ? {
            items: [
              categoryRecord(DRESSES, 'Платья', 'dresses'),
              categoryRecord(SKIRTS, 'Юбки', 'skirts'),
            ],
            total: 2,
          }
        : batch;
    return Promise.resolve(new Response(JSON.stringify(body)));
  });
}

const oneProduct = { items: [product], total: 1, nextCursor: null };

async function show(props: Partial<CatalogBrowserProps> = {}) {
  render(
    <QueryClientProvider client={createBrowserQueryClient()}>
      <CatalogBrowser title="Каталог" query={{}} {...props} />
    </QueryClientProvider>,
  );
  await act(async () => {});
  await screen.findByRole('button', { name: 'Только со скидкой' });
  await categoryNav();
}

// The list sits in an aside that the stylesheet hides below 1024px, which jsdom applies to the
// accessibility tree.
function categoryNav() {
  return screen.findByRole('navigation', { name: 'Список категорий', hidden: true });
}

function lastAddress() {
  return nav.replace.mock.lastCall;
}

beforeEach(() => {
  fetchMock.mockReset();
  nav.replace.mockClear();
  nav.push.mockClear();
  nav.pathname = '/catalog';
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('CatalogBrowser heading', () => {
  it.each([
    [1, 'товар'],
    [2, 'товара'],
    [5, 'товаров'],
    [21, 'товар'],
    [111, 'товаров'],
  ])('shows the title with the count: %i %s', async (total, noun) => {
    stubApi(oneProduct, total);
    await show({ title: 'Платья' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(`Платья ${total} ${noun}`);
  });

  it('shows the title alone until the counts are known', () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    render(
      <QueryClientProvider client={createBrowserQueryClient()}>
        <CatalogBrowser title="Каталог" query={{}} />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Каталог$/);
  });
});

describe('CatalogBrowser categories', () => {
  it('lists the categories that have a page and links them with the current query', async () => {
    stubApi(oneProduct);
    await show({ query: { sort: 'price_asc', hasDiscount: true, q: 'платье' } });
    const list = within(await categoryNav());
    const query = `?q=${encodeURIComponent('платье')}&sort=price_asc&hasDiscount=true`;
    expect(list.getByRole('link', { name: /Платья/, hidden: true })).toHaveAttribute(
      'href',
      `/catalog/dresses${query}`,
    );
    expect(list.getByRole('link', { name: /Юбки/, hidden: true })).toHaveAttribute(
      'href',
      `/catalog/skirts${query}`,
    );
    expect(list.queryByRole('link', { name: /Скрытая/, hidden: true })).not.toBeInTheDocument();
  });

  it('links a category with no query when nothing is selected, and marks the chosen one', async () => {
    stubApi(oneProduct);
    nav.pathname = '/catalog/dresses';
    await show({ categoryId: DRESSES, start: 'c-1' });
    const list = within(await categoryNav());
    expect(list.getByRole('link', { name: /Юбки/, hidden: true })).toHaveAttribute(
      'href',
      '/catalog/skirts',
    );
    expect(list.getByRole('link', { name: /Платья/, hidden: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

describe('CatalogBrowser selection in the address (AC7)', () => {
  it('replaces the address when a filter is applied, with no scroll and no history entry', async () => {
    stubApi(oneProduct);
    const user = userEvent.setup();
    await show({ query: { sort: 'price_asc' } });
    await user.click(screen.getByRole('button', { name: 'Бренд' }));
    await user.click(screen.getByRole('checkbox', { name: 'Nike 12' }));
    await user.click(screen.getByRole('button', { name: 'Применить' }));
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(lastAddress()).toEqual([`/catalog?sort=price_asc&brandId=${NIKE}`, { scroll: false }]);
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('replaces the address when the phone drawer applies its draft (AC4)', async () => {
    stubApi(oneProduct);
    nav.pathname = '/catalog/dresses';
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await show({ categoryId: DRESSES, start: 'c-1', query: { sort: 'price_asc' } });
    await user.click(screen.getByRole('button', { name: 'Фильтры' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Фильтры' }));
    await user.click(dialog.getByRole('button', { name: /^Бренд/ }));
    await user.click(dialog.getByRole('checkbox', { name: 'Nike 12' }));
    await user.click(dialog.getByRole('button', { name: 'Применить' }));
    expect(nav.replace).not.toHaveBeenCalled();
    await user.click(dialog.getByRole('button', { name: /^Показать/ }));
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(lastAddress()).toEqual([
      `/catalog/dresses?sort=price_asc&brandId=${NIKE}`,
      { scroll: false },
    ]);
  });

  it('the phone drawer\'s "Сбросить" drops the filters and the sort, keeps the search, and applies on "Показать"', async () => {
    stubApi(oneProduct);
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await show({ query: { q: 'платье', sort: 'price_asc', brandId: [NIKE] } });
    await user.click(screen.getByRole('button', { name: 'Фильтры' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Фильтры' }));
    await user.click(dialog.getByRole('button', { name: 'Сбросить' }));
    expect(nav.replace).not.toHaveBeenCalled();
    await user.click(dialog.getByRole('button', { name: /^Показать/ }));
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(lastAddress()).toEqual([
      `/catalog?q=${encodeURIComponent('платье')}`,
      { scroll: false },
    ]);
  });

  it('keeps the category path and drops the cursor', async () => {
    stubApi(oneProduct);
    nav.pathname = '/catalog/dresses';
    const user = userEvent.setup();
    await show({ categoryId: DRESSES, start: 'c-1', query: { q: 'a' } });
    await user.click(screen.getByRole('button', { name: 'Только со скидкой' }));
    expect(lastAddress()).toEqual(['/catalog/dresses?q=a&hasDiscount=true', { scroll: false }]);
    expect(lastAddress()?.[0]).not.toContain('cursor');
  });

  it('removes a filter through the × of its chip', async () => {
    stubApi(oneProduct);
    const user = userEvent.setup();
    await show({ query: { brandId: [NIKE], sort: 'price_desc', hasDiscount: true } });
    await user.click(screen.getByRole('button', { name: 'Сбросить «Бренд»' }));
    expect(lastAddress()).toEqual(['/catalog?sort=price_desc&hasDiscount=true', { scroll: false }]);
  });

  it('puts the default sort back by leaving it out of the address', async () => {
    stubApi(oneProduct);
    const user = userEvent.setup();
    await show({ query: { sort: 'price_asc', q: 'a' } });
    await user.click(screen.getByRole('button', { name: 'Сначала дешевле' }));
    await user.click(screen.getByRole('radio', { name: 'Новинки' }));
    expect(lastAddress()).toEqual(['/catalog?q=a', { scroll: false }]);
  });

  it('keeps the sort chip while the counts are pending', async () => {
    fetchMock.mockImplementation((input: unknown) => {
      const path = new URL(String(input), 'http://localhost').pathname;
      return path.endsWith('/products/facets')
        ? new Promise<Response>(() => {})
        : Promise.resolve(new Response(JSON.stringify(oneProduct)));
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={createBrowserQueryClient()}>
        <CatalogBrowser title="Каталог" query={{ q: 'a' }} />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Только со скидкой' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Новинки' }));
    await user.click(screen.getByRole('radio', { name: 'Сначала дороже' }));
    expect(lastAddress()).toEqual(['/catalog?q=a&sort=price_desc', { scroll: false }]);
  });

  it('keeps the sort chip when the counts fail', async () => {
    fetchMock.mockImplementation((input: unknown) => {
      const path = new URL(String(input), 'http://localhost').pathname;
      return path.endsWith('/products/facets')
        ? Promise.reject(new TypeError('network'))
        : Promise.resolve(new Response(JSON.stringify(oneProduct)));
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={createBrowserQueryClient()}>
        <CatalogBrowser title="Каталог" query={{ sort: 'price_asc' }} />
      </QueryClientProvider>,
    );
    await act(async () => {});
    expect(screen.queryByRole('button', { name: 'Только со скидкой' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Сначала дешевле' }));
    await user.click(screen.getByRole('radio', { name: 'Новинки' }));
    expect(lastAddress()).toEqual(['/catalog', { scroll: false }]);
  });

  it('"Очистить фильтры" drops every filter and the search but keeps the category path and the sort', async () => {
    stubApi(oneProduct);
    nav.pathname = '/catalog/dresses';
    const user = userEvent.setup();
    await show({
      categoryId: DRESSES,
      query: { q: 'платье', sort: 'price_asc', brandId: [NIKE], hasDiscount: true, minPrice: 2000 },
    });
    await user.click(screen.getByRole('button', { name: 'Очистить фильтры' }));
    expect(lastAddress()).toEqual(['/catalog/dresses?sort=price_asc', { scroll: false }]);
  });
});

describe('CatalogBrowser with no products (AC10)', () => {
  const empty = { items: [], total: 0, nextCursor: null };

  it('says nothing was found and offers no clearing when nothing is applied', async () => {
    stubApi(empty, 0);
    await show({ query: { sort: 'price_asc' } });
    expect(await screen.findByText('Ничего не нашлось')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Очистить фильтры' })).not.toBeInTheDocument();
    expect(screen.queryByText('Попробуйте изменить или сбросить фильтры')).not.toBeInTheDocument();
  });

  it.each([
    ['a filter', { hasDiscount: true }],
    ['the search', { q: 'платье' }],
  ])('offers to clear %s and clears it', async (_, query) => {
    stubApi(empty, 0);
    const user = userEvent.setup();
    await show({ query: { ...query, sort: 'price_desc' } });
    const block = (await screen.findByText('Ничего не нашлось')).parentElement as HTMLElement;
    expect(within(block).getByText('Попробуйте изменить или сбросить фильтры')).toBeInTheDocument();
    await user.click(within(block).getByRole('button', { name: 'Очистить фильтры' }));
    expect(lastAddress()).toEqual(['/catalog?sort=price_desc', { scroll: false }]);
  });

  it('shows no cards and no grid', async () => {
    stubApi(empty, 0);
    await show();
    await screen.findByText('Ничего не нашлось');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});

describe('CatalogBrowser scroll on a new selection (O82)', () => {
  const top = 300;

  function scrolledTo(scrollY: number) {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: top - scrollY,
      bottom: 0,
      left: 0,
      right: 0,
      width: 0,
      height: 0,
      x: 0,
      y: top - scrollY,
      toJSON: () => ({}),
    });
    vi.stubGlobal('scrollY', scrollY);
    // The grid scrolls the window itself while it mounts.
    vi.mocked(window.scrollTo).mockClear();
  }

  it('goes up to the column top when the visitor is below it, before the address changes', async () => {
    stubApi(oneProduct);
    const user = userEvent.setup();
    await show();
    scrolledTo(900);
    await user.click(screen.getByRole('button', { name: 'Только со скидкой' }));
    expect(window.scrollTo).toHaveBeenCalledWith({ top });
    expect(vi.mocked(window.scrollTo).mock.invocationCallOrder[0]).toBeLessThan(
      nav.replace.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('goes up when the phone drawer applies while the visitor is below the column top', async () => {
    stubApi(oneProduct);
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await show();
    scrolledTo(900);
    await user.click(screen.getByRole('button', { name: 'Фильтры' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Фильтры' }));
    await user.click(dialog.getByRole('switch', { name: 'Только со скидкой' }));
    expect(window.scrollTo).not.toHaveBeenCalled();
    await user.click(dialog.getByRole('button', { name: /^Показать/ }));
    expect(window.scrollTo).toHaveBeenCalledWith({ top });
    expect(vi.mocked(window.scrollTo).mock.invocationCallOrder[0]).toBeLessThan(
      nav.replace.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it.each([
    ['above', 100],
    ['exactly at', 300],
  ])('stays when the visitor is %s the column top', async (_, scrollY) => {
    stubApi(oneProduct);
    const user = userEvent.setup();
    await show();
    scrolledTo(scrollY);
    await user.click(screen.getByRole('button', { name: 'Только со скидкой' }));
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(nav.replace).toHaveBeenCalledTimes(1);
  });
});
