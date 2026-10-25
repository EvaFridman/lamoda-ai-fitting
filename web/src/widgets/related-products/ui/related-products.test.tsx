import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ clientFetch: vi.fn(), reportFailure: vi.fn() }));
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));

vi.mock('@/shared/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api')>()),
  clientFetch: api.clientFetch,
  reportFailure: api.reportFailure,
}));
vi.mock('@/shared/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/ui')>()),
  showToast: toast.showToast,
}));

vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  track: vi.fn(),
  reset: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/products/p1',
  useSearchParams: () => new URLSearchParams(),
}));

import { type ProductListItem, relatedProductsOptions } from '@/entities/product';
import { track } from '@/shared/analytics/client';
import { ApiError, errorText } from '@/shared/api';

import { RelatedProducts } from './related-products';

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
    rating: 4.5,
    createdAt: DATE,
    updatedAt: DATE,
  }));
}

function renderWith(client: QueryClient, ui: ReactNode = <RelatedProducts productId={ID} />) {
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

// The page hands the list over under the key the browser reads it by.
function hydrated(items: ProductListItem[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(relatedProductsOptions(ID).queryKey, items);
  return client;
}

beforeEach(() => {
  api.clientFetch.mockReset();
  api.reportFailure.mockReset();
  toast.showToast.mockReset();
  vi.mocked(track).mockClear();
});

describe('RelatedProducts', () => {
  it('shows the heading and six compact cards that lead to their products (AC21)', async () => {
    const items = productsOf(6);
    const client = newClient();
    api.clientFetch.mockResolvedValue(items);
    renderWith(client);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'С этим товаром выбирают' }),
    ).toBeInTheDocument();
    const cards = await screen.findAllByRole('article');
    expect(cards).toHaveLength(6);
    expect(api.clientFetch).toHaveBeenCalledOnce();
    expect(api.clientFetch.mock.calls[0]?.[0]).toMatchObject({
      path: `/products/${ID}/related`,
    });
    for (const [index, card] of cards.entries()) {
      expect(within(card).getByRole('link')).toHaveAttribute(
        'href',
        `/products/${items[index]?.id}`,
      );
      expect(within(card).queryByRole('img', { name: /Рейтинг/ })).not.toBeInTheDocument();
    }
  });

  it('reads nothing when the page handed the list over', () => {
    renderWith(hydrated(productsOf(2)));

    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(api.clientFetch).not.toHaveBeenCalled();
  });

  it('gives each card a disabled hanger, a heart and «В корзину» (A33, A83)', () => {
    renderWith(hydrated(productsOf(1)));

    const card = screen.getByRole('article');
    expect(within(card).getByRole('button', { name: 'Добавить к образу' })).toBeDisabled();
    expect(within(card).getByRole('button', { name: 'В избранное' })).toBeEnabled();
    expect(within(card).getByRole('button', { name: 'В корзину' })).toBeEnabled();
    expect(within(card).getByRole('link')).not.toContainElement(
      within(card).getByRole('button', { name: 'В корзину' }),
    );
  });

  it('answers «В корзину» with the prototype toast and does not follow the link', async () => {
    const user = userEvent.setup();
    renderWith(hydrated(productsOf(1)));
    const link = screen.getByRole('link');
    const linkClick = vi.fn();
    link.addEventListener('click', linkClick);

    await user.click(screen.getByRole('button', { name: 'В корзину' }));

    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith({
      title: 'В прототипе нет корзины и избранного',
    });
    expect(linkClick).not.toHaveBeenCalled();
  });

  it('shows the toast for the heart and leaves it unpressed', async () => {
    const user = userEvent.setup();
    renderWith(hydrated(productsOf(1)));
    const heart = screen.getByRole('button', { name: 'В избранное' });

    await user.click(heart);

    expect(toast.showToast).toHaveBeenCalledOnce();
    expect(heart).toHaveAttribute('aria-pressed', 'false');
  });

  describe('tracked elements (A84)', () => {
    it('sends related.card with the position from 1 for each card link', async () => {
      const user = userEvent.setup();
      renderWith(hydrated(productsOf(3)));
      const cards = screen.getAllByRole('article');
      for (const card of cards) {
        within(card)
          .getByRole('link')
          .addEventListener('click', (event) => event.preventDefault());
      }

      await user.click(within(cards[2]!).getByRole('link'));
      await user.click(within(cards[0]!).getByRole('link'));

      expect(vi.mocked(track).mock.calls).toEqual([
        [
          'Element Clicked',
          { element: 'related.card', zone: 'product', type: 'navigation', position: 3 },
        ],
        [
          'Element Clicked',
          { element: 'related.card', zone: 'product', type: 'navigation', position: 1 },
        ],
      ]);
    });

    it('sends related.add-to-cart with no properties, whichever card, and shows the toast', async () => {
      const user = userEvent.setup();
      renderWith(hydrated(productsOf(2)));
      const cards = screen.getAllByRole('article');

      await user.click(within(cards[1]!).getByRole('button', { name: 'В корзину' }));

      expect(vi.mocked(track).mock.calls).toEqual([
        [
          'Element Clicked',
          { element: 'related.add-to-cart', zone: 'product', type: 'interaction' },
        ],
      ]);
      expect(toast.showToast).toHaveBeenCalledOnce();
    });

    describe('the arrows (A87.8)', () => {
      beforeEach(() => {
        vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(1000);
        vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(400);
        Object.defineProperty(Element.prototype, 'scrollBy', {
          value: vi.fn(),
          configurable: true,
          writable: true,
        });
      });

      afterEach(() => {
        vi.restoreAllMocks();
        Reflect.deleteProperty(Element.prototype, 'scrollBy');
      });

      it('sends related.scroll with direction next from «Следующие»', async () => {
        const user = userEvent.setup();
        renderWith(hydrated(productsOf(6)));

        await user.click(screen.getByRole('button', { name: 'Следующие' }));

        expect(vi.mocked(track).mock.calls).toEqual([
          [
            'Element Clicked',
            { element: 'related.scroll', zone: 'product', type: 'interaction', direction: 'next' },
          ],
        ]);
      });

      it('sends nothing for a scroll of the row itself', () => {
        renderWith(hydrated(productsOf(6)));

        fireEvent.scroll(screen.getByRole('list'));

        expect(track).not.toHaveBeenCalled();
      });
    });

    it('sends nothing from the heart and the disabled hanger', async () => {
      const user = userEvent.setup();
      renderWith(hydrated(productsOf(1)));
      const card = screen.getByRole('article');

      await user.click(within(card).getByRole('button', { name: 'В избранное' }));
      await user.click(within(card).getByRole('button', { name: 'Добавить к образу' }));

      expect(track).not.toHaveBeenCalled();
    });
  });

  it('renders nothing for an empty list (A83.8)', () => {
    const { container } = renderWith(hydrated([]));

    expect(container).toBeEmptyDOMElement();
  });

  it('shows six hidden placeholders while it loads', () => {
    api.clientFetch.mockReturnValue(new Promise(() => undefined));
    const { container } = renderWith(newClient());

    expect(screen.getByRole('heading', { name: 'С этим товаром выбирают' })).toBeInTheDocument();
    expect(container.querySelectorAll('[aria-busy="true"]')).toHaveLength(6);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the error text as an alert and reports the failure', async () => {
    const failure = new ApiError('m', { kind: 'http', template: '/t', status: 503 });
    api.clientFetch.mockRejectedValue(failure);
    renderWith(newClient());

    expect(await screen.findByRole('alert')).toHaveTextContent(errorText(failure));
    expect(api.reportFailure).toHaveBeenCalledWith(failure);
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });
});
