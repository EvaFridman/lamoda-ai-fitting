import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

// Outside the app router the hooks of the grid's address give nothing.
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => '/catalog',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/shared/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/shared/api')>();
  return { ...original, reportFailure: vi.fn() };
});

import { createBrowserQueryClient } from '@/_app/providers';
import { productFacetsOptions } from '@/entities/product';
import { errorText, reportFailure } from '@/shared/api';

import { CatalogBrowser, type CatalogBrowserProps } from './catalog-browser';

const fetchMock = vi.fn();
// When set, answers the filter counts of a selection with the discount filter.
let discountedFacets: (() => Promise<Response>) | undefined;

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const DATE = '2026-10-01T12:00:00.000Z';

function productNamed(n: number) {
  return {
    id: `7c9e6679-7425-40de-944b-e07fc1f9${String(n).padStart(4, '0')}`,
    article: `A-${n}`,
    name: `Платье ${n}`,
    brand: { id: ID, name: 'Бренд' },
    category: { id: ID, name: 'Платья', slug: 'dresses' },
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
  discounted: 3,
  price: null,
  categories: [],
  brands: [],
  sizes: [],
  attributes: [],
};

function json(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

function pathOf(input: unknown): string {
  return new URL(String(input), 'http://localhost').pathname;
}

// The filter counts and the category list answer whatever the batches do.
function side(input: unknown): Promise<Response> | undefined {
  const path = pathOf(input);
  if (path.endsWith('/products/facets')) {
    const discounted = new URL(String(input), 'http://localhost').searchParams.has('hasDiscount');
    if (discounted && discountedFacets) return discountedFacets();
    return json(discounted ? { ...facets, total: 7 } : facets);
  }
  if (path.endsWith('/categories')) return json({ items: [], total: 0 });
  return undefined;
}

function batchUrls(): URL[] {
  return fetchMock.mock.calls
    .filter(([input]) => side(input) === undefined)
    .map(([input]) => new URL(String(input), 'http://localhost'));
}

// `batches` answer the batch requests in turn; a function answers instead of a body.
function stubApi(...batches: (unknown | (() => Promise<Response>))[]) {
  let call = 0;
  fetchMock.mockImplementation((input: unknown) => {
    const other = side(input);
    if (other) return other;
    const next = batches[Math.min(call++, batches.length - 1)];
    return typeof next === 'function' ? (next as () => Promise<Response>)() : json(next);
  });
}

async function show(props: Omit<CatalogBrowserProps, 'title'>, settle = true) {
  render(
    <QueryClientProvider client={createBrowserQueryClient()}>
      <CatalogBrowser title="Каталог" {...props} />
    </QueryClientProvider>,
  );
  await act(async () => {});
  if (settle) await screen.findByRole('list');
}

const never = () => new Promise<Response>(() => {});

beforeEach(() => {
  fetchMock.mockReset();
  replace.mockReset();
  discountedFacets = undefined;
  vi.mocked(reportFailure).mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CatalogBrowser', () => {
  it('links "Дальше" to the next batch by the address state and the cursor', async () => {
    stubApi({ items: [productNamed(1)], total: 1, nextCursor: 'next 1' }, never);
    await show({ query: { q: 'платье', sort: 'price_asc' } });
    const link = screen.getByRole('link', { name: 'Дальше' });
    expect(link).toHaveAttribute(
      'href',
      `?q=${encodeURIComponent('платье')}&sort=price_asc&cursor=next%201`,
    );
    expect(link).toHaveAttribute('rel', 'next');
  });

  it('has no "Дальше" on the last batch', async () => {
    stubApi({ items: [productNamed(1)], total: 1, nextCursor: null });
    await show({ query: {} });
    expect(screen.queryByRole('link', { name: 'Дальше' })).not.toBeInTheDocument();
    expect(batchUrls()).toHaveLength(1);
  });

  it('keeps "Дальше" out of sight while the list loads batches itself', async () => {
    stubApi({ items: [productNamed(1)], total: 1, nextCursor: 'c' }, never);
    await show({ query: {} });
    expect(screen.getByRole('link', { name: 'Дальше' })).toHaveClass('hidden');
  });

  it('numbers the cards against the filter counts total', async () => {
    stubApi({ items: [productNamed(1)], total: 1, nextCursor: null });
    await show({ query: {} });
    await vi.waitFor(() =>
      expect(screen.getAllByRole('listitem')[0]).toHaveAttribute('aria-setsize', '40'),
    );
    expect(screen.getAllByRole('listitem')[0]).toHaveAttribute('aria-posinset', '1');
  });

  it('requests the next batch with the cursor and appends its cards', async () => {
    stubApi(
      { items: [productNamed(1)], total: 1, nextCursor: 'c-2' },
      { items: [productNamed(2)], total: 1, nextCursor: null },
    );
    await show({ query: {} });
    expect(await screen.findByRole('link', { name: /Платье 2/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Платье 1/ })).toBeInTheDocument();
    expect(batchUrls()[1]?.searchParams.get('cursor')).toBe('c-2');
  });

  it('makes "Дальше" visible and shows the error when the next batch fails', async () => {
    stubApi({ items: [productNamed(1)], total: 1, nextCursor: 'c-2' }, () =>
      json({ error: { code: 'INTERNAL', message: 'm', details: [] } }, 500),
    );
    await show({ query: { q: 'a' } });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBeTruthy();
    expect(screen.getByRole('link', { name: /Платье 1/ })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Дальше' });
    expect(link).not.toHaveClass('hidden');
    expect(link).toHaveAttribute('href', '?q=a&cursor=c-2');
    expect(batchUrls()).toHaveLength(2);
    expect(reportFailure).toHaveBeenCalled();
    expect(errorText(vi.mocked(reportFailure).mock.calls[0]?.[0])).toBe(alert.textContent);
  });

  describe('a cursor the api refuses (O72)', () => {
    const refused = () =>
      json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'm',
            details: [{ field: 'cursor', code: 'INVALID_CURSOR', message: 'x' }],
          },
        },
        400,
      );

    it('falls back to the first batch', async () => {
      stubApi(refused, { items: [productNamed(1)], total: 1, nextCursor: null });
      await show({ query: {}, start: 'bad' });
      expect(await screen.findByRole('link', { name: /Платье 1/ })).toBeInTheDocument();
      expect(batchUrls()).toHaveLength(2);
      expect(batchUrls()[0]?.searchParams.get('cursor')).toBe('bad');
      expect(batchUrls()[1]?.searchParams.has('cursor')).toBe(false);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('shows the error for any other failure of a cursor start', async () => {
      stubApi(() => json({ error: { code: 'X', message: 'm', details: [] } }, 400));
      await show({ query: {}, start: 'bad' }, false);
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(batchUrls()).toHaveLength(1);
    });
  });

  it('shows nothing while loading and no server failure text', async () => {
    stubApi(never);
    await show({ query: {} }, false);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  describe('accessibility (plan §3.4)', () => {
    // Two regions after the h1: the count of the visitor's change, then "Загружаем ещё".
    const regions = () => document.querySelectorAll('[aria-live="polite"]');
    const live = () => regions()[0];
    const loading = () => regions()[1];
    const one = { items: [productNamed(1)], total: 1, nextCursor: null };

    function mount(props: Omit<CatalogBrowserProps, 'title'>) {
      const client = createBrowserQueryClient();
      const tree = (next: Omit<CatalogBrowserProps, 'title'>) => (
        <QueryClientProvider client={client}>
          <CatalogBrowser title="Каталог" {...next} />
        </QueryClientProvider>
      );
      const view = render(tree(props));
      return {
        ...view,
        client,
        update: (next: Omit<CatalogBrowserProps, 'title'>) => view.rerender(tree(next)),
      };
    }

    it('names the page one heading, the categories, the list and its items', async () => {
      stubApi(one);
      await show({ query: {} });
      await screen.findByRole('heading', { level: 1, name: 'Каталог 40 товаров' });
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      // An aside with no categories in it has no role in jsdom, so it is found by its name.
      expect(screen.getByLabelText('Категории', { selector: 'aside' })).toBeInTheDocument();
      expect(screen.getByRole('list', { name: 'Товары' })).toBeInTheDocument();
      const item = screen.getAllByRole('listitem')[0];
      expect(item).toHaveAttribute('aria-setsize');
      expect(item).toHaveAttribute('aria-posinset', '1');
    });

    it('has an empty live region on load, the count loaded or not', async () => {
      stubApi(one);
      await show({ query: {} });
      expect(regions()).toHaveLength(2);
      expect(live()).toBeEmptyDOMElement();
      expect(loading()).toBeEmptyDOMElement();
      await screen.findByRole('heading', { name: 'Каталог 40 товаров' });
      expect(live()).toBeEmptyDOMElement();
      expect(loading()).toBeEmptyDOMElement();
    });

    it('reads the new count only once the address and its counts are in', async () => {
      stubApi(one);
      let answer: (response: Response) => void = () => {};
      discountedFacets = () => new Promise<Response>((resolve) => (answer = resolve));
      const user = userEvent.setup();
      const view = mount({ query: {} });
      await screen.findByRole('heading', { name: 'Каталог 40 товаров' });

      await user.click(screen.getByRole('button', { name: 'Только со скидкой' }));
      expect(replace).toHaveBeenCalledWith(expect.stringContaining('hasDiscount=true'), {
        scroll: false,
      });
      // The address has not changed yet: the old count is not read.
      expect(live()).toBeEmptyDOMElement();

      view.update({ query: { hasDiscount: true } });
      await act(async () => {});
      // The address matches, its counts do not: still nothing, never the old 40.
      expect(live()).toBeEmptyDOMElement();

      await act(async () => answer(await json({ ...facets, total: 7 })));
      await vi.waitFor(() => expect(live()).toHaveTextContent('Найдено 7 товаров'));
    });

    it('says "Загружаем ещё" while a next batch loads and nothing after it', async () => {
      let answer: (response: Response) => void = () => {};
      stubApi({ items: [productNamed(1)], total: 2, nextCursor: 'c-2' }, () => {
        return new Promise<Response>((resolve) => (answer = resolve));
      });
      await show({ query: {} });
      await vi.waitFor(() => expect(loading()).toHaveTextContent('Загружаем ещё'));
      expect(live()).toBeEmptyDOMElement();

      await act(async () =>
        answer(await json({ items: [productNamed(2)], total: 2, nextCursor: null })),
      );
      await screen.findByRole('link', { name: /Платье 2/ });
      await vi.waitFor(() => expect(loading()).toBeEmptyDOMElement());
      expect(live()).toBeEmptyDOMElement();
    });

    it('reads the count of a selection made while a next batch is still loading', async () => {
      stubApi({ items: [productNamed(1)], total: 2, nextCursor: 'c-2' }, never);
      const user = userEvent.setup();
      const view = mount({ query: {} });
      await vi.waitFor(() => expect(loading()).toHaveTextContent('Загружаем ещё'));

      await user.click(screen.getByRole('button', { name: 'Только со скидкой' }));
      view.update({ query: { hasDiscount: true } });

      await vi.waitFor(() => expect(live()).toHaveTextContent('Найдено 7 товаров'));
    });

    it('keeps the count in its region when a batch is requested right after it', async () => {
      let answer: (response: Response) => void = () => {};
      fetchMock.mockImplementation((input: unknown) => {
        const other = side(input);
        if (other) return other;
        const url = new URL(String(input), 'http://localhost');
        if (url.searchParams.get('cursor') === 'd-2') {
          return new Promise<Response>((resolve) => (answer = resolve));
        }
        return json({
          items: [productNamed(1)],
          total: 2,
          nextCursor: url.searchParams.has('hasDiscount') ? 'd-2' : null,
        });
      });
      const user = userEvent.setup();
      const view = mount({ query: {} });
      await screen.findByRole('list');

      await user.click(screen.getByRole('button', { name: 'Только со скидкой' }));
      view.update({ query: { hasDiscount: true } });

      await vi.waitFor(() => expect(loading()).toHaveTextContent('Загружаем ещё'));
      expect(live()).toHaveTextContent('Найдено 7 товаров');

      await act(async () =>
        answer(await json({ items: [productNamed(2)], total: 2, nextCursor: null })),
      );
      await vi.waitFor(() => expect(loading()).toBeEmptyDOMElement());
      expect(live()).toHaveTextContent('Найдено 7 товаров');
    });

    it('moves the focus to the heading after the row\'s "Очистить фильтры"', async () => {
      stubApi(one);
      const user = userEvent.setup();
      await show({ query: { q: 'платье' } });
      const heading = screen.getByRole('heading', { level: 1 });
      const focus = vi.spyOn(heading, 'focus');

      await user.click(screen.getByRole('button', { name: 'Очистить фильтры' }));

      expect(replace).toHaveBeenCalledTimes(1);
      expect(focus).toHaveBeenCalledWith({ preventScroll: true });
      expect(heading).toHaveFocus();
    });

    it('moves the focus to the heading after the empty state\'s "Очистить фильтры"', async () => {
      stubApi({ items: [], total: 0, nextCursor: null });
      const user = userEvent.setup();
      mount({ query: { q: 'нет' } });
      const empty = (await screen.findByText('Ничего не нашлось')).parentElement as HTMLElement;
      const heading = screen.getByRole('heading', { level: 1 });
      const focus = vi.spyOn(heading, 'focus');

      await user.click(within(empty).getByRole('button', { name: 'Очистить фильтры' }));

      expect(replace).toHaveBeenCalledTimes(1);
      expect(focus).toHaveBeenCalledWith({ preventScroll: true });
      expect(heading).toHaveFocus();
    });

    it('does not move the focus when a filter is applied', async () => {
      stubApi(one);
      const user = userEvent.setup();
      await show({ query: {} });
      const heading = screen.getByRole('heading', { level: 1 });
      const focus = vi.spyOn(heading, 'focus');

      await user.click(screen.getByRole('button', { name: 'Только со скидкой' }));

      expect(replace).toHaveBeenCalledTimes(1);
      expect(focus).not.toHaveBeenCalled();
    });

    // On a batch page the new address has no cursor, so the server renders the same browser with
    // `start` gone; it stays mounted (no key) and starts over from the first batch.
    describe('a selection changed on a batch page', () => {
      it('starts over from the first batch and reads the new count', async () => {
        stubApi(one);
        const user = userEvent.setup();
        const view = mount({ query: {}, start: 'X' });
        await screen.findByRole('list');
        expect(batchUrls()[0]?.searchParams.get('cursor')).toBe('X');

        await user.click(screen.getByRole('button', { name: 'Только со скидкой' }));
        view.update({ query: { hasDiscount: true }, start: undefined });

        await vi.waitFor(() => expect(live()).toHaveTextContent('Найдено 7 товаров'));
        const urls = batchUrls();
        expect(urls.at(-1)?.searchParams.has('cursor')).toBe(false);
        expect(urls.at(-1)?.searchParams.get('hasDiscount')).toBe('true');
      });

      it('mounts another grid for another start but keeps the heading node', async () => {
        stubApi(one);
        const view = mount({ query: {}, start: 'X' });
        await screen.findByRole('list');
        const heading = screen.getByRole('heading', { level: 1 });
        const list = screen.getByRole('list', { name: 'Товары' });

        view.update({ query: {}, start: 'Y' });
        await vi.waitFor(() => expect(batchUrls().at(-1)?.searchParams.get('cursor')).toBe('Y'));
        await screen.findByRole('list', { name: 'Товары' });

        expect(screen.getByRole('heading', { level: 1 })).toBe(heading);
        expect(screen.getByRole('list', { name: 'Товары' })).not.toBe(list);
      });

      it('keeps the focus on the toggled chip', async () => {
        stubApi(one);
        const user = userEvent.setup();
        const view = mount({ query: {}, start: 'X' });
        await screen.findByRole('list');

        await user.click(screen.getByRole('button', { name: 'Только со скидкой' }));
        // The server prefetches the new selection's counts into the cache before the new props
        // reach the browser, so they are there on the rerender and the chip stays mounted.
        const next = { hasDiscount: true } as const;
        view.client.setQueryData(productFacetsOptions(next).queryKey, { ...facets, total: 7 });
        view.update({ query: next, start: undefined });
        await vi.waitFor(() => expect(live()).toHaveTextContent('Найдено 7 товаров'));

        expect(screen.getByRole('button', { name: 'Только со скидкой' })).toHaveFocus();
      });

      it('focuses the heading after "Очистить фильтры" and reads the new count', async () => {
        stubApi(one);
        const user = userEvent.setup();
        const view = mount({ query: { hasDiscount: true }, start: 'X' });
        await screen.findByRole('list');

        await user.click(screen.getByRole('button', { name: 'Очистить фильтры' }));
        view.update({ query: {}, start: undefined });

        await vi.waitFor(() => expect(live()).toHaveTextContent('Найдено 40 товаров'));
        expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
        expect(batchUrls().at(-1)?.searchParams.has('cursor')).toBe(false);
      });
    });
  });
});
