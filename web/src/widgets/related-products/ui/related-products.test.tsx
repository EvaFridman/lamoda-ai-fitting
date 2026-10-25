import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ clientFetch: vi.fn(), reportFailure: vi.fn() }));
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
const auth = vi.hoisted(() => ({
  session: { status: 'signed-in', user: { id: 'u1', email: 'a@example.com', name: null } } as
    | { status: 'pending' }
    | { status: 'signed-in'; user: { id: string; email: string; name: string | null } }
    | { status: 'signed-out'; failed: boolean },
}));

vi.mock('@/shared/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api')>()),
  clientFetch: api.clientFetch,
  reportFailure: api.reportFailure,
}));
vi.mock('@/shared/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/ui')>()),
  showToast: toast.showToast,
}));
vi.mock('@/entities/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/session')>()),
  useSession: () => auth.session,
}));

vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  track: vi.fn(),
  reset: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/products/p1',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

import { type OutfitSlot } from '@/entities/category';
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

function roomOf(...items: { slot: string; product: ProductListItem }[]) {
  return {
    items: items.map((item) => ({ ...item, attributeValueId: null, colour: null })),
    count: items.length,
    sum: items.length * 5000,
  };
}

interface Served {
  // The related list, a promise, or an error to reject with.
  related?: unknown;
  // The slot of the products' category (the id ID); none: a category outside the room.
  slot?: OutfitSlot | null;
  room?: ReturnType<typeof roomOf>;
  // The answer of a PUT.
  change?: unknown;
}

function serve({ related, slot = 'top', room = roomOf(), change }: Served = {}) {
  const categories = {
    items: [
      {
        id: ID,
        name: 'Платья',
        slug: 'dresses',
        isActive: true,
        description: null,
        sortOrder: 0,
        slot,
        createdAt: DATE,
        updatedAt: DATE,
      },
    ],
  };
  api.clientFetch.mockImplementation((target: { template: string }) => {
    switch (target.template) {
      case '/categories':
        return Promise.resolve(categories);
      case '/me/fitting-room':
        return Promise.resolve(room);
      case '/me/fitting-room/:slot':
        return Promise.resolve(change);
      default:
        return related instanceof Error ? Promise.reject(related) : Promise.resolve(related);
    }
  });
}

function callsTo(template: string) {
  return api.clientFetch.mock.calls.filter(([target]) => target.template === template);
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

// The hanger is there once the categories give the slot and the room is read.
async function readyHanger(card: HTMLElement) {
  // The button is drawn again once it is enabled (a disabled one has no tooltip): look it up anew.
  await waitFor(() =>
    expect(within(card).getByRole('button', { name: 'Добавить к образу' })).toBeEnabled(),
  );
  return within(card).getByRole('button', { name: 'Добавить к образу' });
}

beforeEach(() => {
  api.clientFetch.mockReset();
  api.reportFailure.mockReset();
  toast.showToast.mockReset();
  vi.mocked(track).mockClear();
  auth.session = { status: 'signed-in', user: { id: 'u1', email: 'a@example.com', name: null } };
  serve();
});

describe('RelatedProducts', () => {
  it('shows the heading and six compact cards that lead to their products (AC21)', async () => {
    const items = productsOf(6);
    const client = newClient();
    serve({ related: items });
    renderWith(client);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'С этим товаром выбирают' }),
    ).toBeInTheDocument();
    const cards = await screen.findAllByRole('article');
    expect(cards).toHaveLength(6);
    expect(callsTo('/products/:id/related')).toHaveLength(1);
    expect(callsTo('/products/:id/related')[0]?.[0]).toMatchObject({
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

  it('reads nothing of the product when the page handed the list over', () => {
    renderWith(hydrated(productsOf(2)));

    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(callsTo('/products/:id/related')).toHaveLength(0);
  });

  it('gives each card a hanger, a heart and «В корзину» (A33, A83)', async () => {
    renderWith(hydrated(productsOf(1)));

    const card = screen.getByRole('article');
    expect(await readyHanger(card)).toHaveAttribute('aria-pressed', 'false');
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

  describe('the hanger (AC13, AC16, A90.1)', () => {
    it('puts the product into its slot and sends related.to-look', async () => {
      const items = productsOf(1);
      serve({
        slot: 'top',
        change: { room: roomOf({ slot: 'top', product: items[0]! }), replaced: null },
      });
      const user = userEvent.setup();
      renderWith(hydrated(items));
      const card = screen.getByRole('article');

      await user.click(await readyHanger(card));

      await waitFor(() => expect(callsTo('/me/fitting-room/:slot')).toHaveLength(1));
      const [target, , init] = callsTo('/me/fitting-room/:slot')[0]!;
      expect(target.path).toBe('/me/fitting-room/top');
      expect(init).toMatchObject({
        method: 'PUT',
        body: JSON.stringify({ productId: items[0]!.id }),
      });
      expect(
        await within(card).findByRole('button', { name: 'В примерочной — убрать' }),
      ).toHaveAttribute('aria-pressed', 'true');
      expect(vi.mocked(track)).toHaveBeenCalledWith('Element Clicked', {
        element: 'related.to-look',
        zone: 'product',
        type: 'interaction',
        slot: 'top',
        action: 'add',
        signed_in: true,
      });
    });

    it('is pressed for a product already in the room', async () => {
      const items = productsOf(1);
      serve({ slot: 'top', room: roomOf({ slot: 'top', product: items[0]! }) });
      renderWith(hydrated(items));

      expect(await screen.findByRole('button', { name: 'В примерочной — убрать' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('is not drawn for a category outside the room (AC16)', async () => {
      serve({ slot: null });
      renderWith(hydrated(productsOf(1)));

      await waitFor(() => expect(callsTo('/categories')).toHaveLength(1));
      await screen.findByRole('button', { name: 'В корзину' });
      expect(screen.queryByRole('button', { name: /образу|примерочной/ })).not.toBeInTheDocument();
    });

    it('opens the sign-in window for a visitor and changes nothing (AC16)', async () => {
      auth.session = { status: 'signed-out', failed: false };
      const items = productsOf(1);
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      renderWith(hydrated(items));
      const card = screen.getByRole('article');

      await user.click(await within(card).findByRole('button', { name: 'Добавить к образу' }));

      expect(await screen.findByRole('dialog', { name: 'Вход' })).toBeInTheDocument();
      expect(callsTo('/me/fitting-room')).toHaveLength(0);
      expect(callsTo('/me/fitting-room/:slot')).toHaveLength(0);
      expect(toast.showToast).not.toHaveBeenCalled();
      expect(vi.mocked(track)).toHaveBeenCalledWith('Element Clicked', {
        element: 'related.to-look',
        zone: 'product',
        type: 'interaction',
        slot: 'top',
        action: 'add',
        signed_in: false,
      });
    });
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

    it('sends nothing from the heart', async () => {
      const user = userEvent.setup();
      renderWith(hydrated(productsOf(1)));
      const card = screen.getByRole('article');

      await user.click(within(card).getByRole('button', { name: 'В избранное' }));

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
    serve({ related: failure });
    renderWith(newClient());

    expect(await screen.findByRole('alert')).toHaveTextContent(errorText(failure));
    expect(api.reportFailure).toHaveBeenCalledWith(failure);
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });
});
