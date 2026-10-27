import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Activity } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OutfitSlot } from '@/entities/category';
import type { ProductDetail } from '@/entities/product';

import { ProductPurchase } from './product-purchase';

vi.mock('@/entities/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/session')>()),
  useSession: () => ({
    status: 'signed-in',
    user: { id: 'u1', email: 'a@example.com', name: null },
  }),
}));

vi.mock('@/widgets/try-on', () => ({
  TryOn: ({ productId, onClose }: { productId: string; onClose: () => void }) => {
    return (
      <div role="dialog" aria-label="Онлайн-примерка" data-product={productId}>
        <button type="button" onClick={onClose}>
          Закрыть окно
        </button>
      </div>
    );
  },
}));

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const DATE = '2026-10-01T12:00:00.000Z';

const product: ProductDetail = {
  id: ID,
  article: 'A-1',
  name: 'Рубашка',
  brand: { id: ID, name: 'Annen' },
  category: { id: ID, name: 'Рубашки', slug: 'shirts' },
  image: null,
  price: 5000,
  discount: 0,
  finalPrice: 5000,
  rating: null,
  createdAt: DATE,
  updatedAt: DATE,
  description: null,
  images: [],
  variations: [],
  attributes: [],
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: unknown) => {
    const { pathname } = new URL(String(url));
    let body: unknown = { limit: 20, used: 0, left: 20, renewsAt: '2026-10-31T21:00:00.000Z' };
    if (pathname.endsWith('/fittings/last')) {
      body = { error: { code: 'NOT_FOUND', message: 'm', details: [] } };
    } else if (pathname === '/api/me/fitting-room') {
      body = { items: [], count: 0, sum: 0 };
    }
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: pathname.endsWith('/fittings/last') ? 404 : 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
});

function setup(slot: OutfitSlot | null = 'top') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ProductPurchase product={product} slot={slot} />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

describe('ProductPurchase', () => {
  it('hands the slot to the buy box: «Добавить к образу» with a slot, none without (AC16)', () => {
    setup('top');
    expect(screen.getByRole('button', { name: 'Добавить к образу' })).toBeInTheDocument();
  });

  it('shows no «Добавить к образу» for a product without a slot', () => {
    setup(null);
    expect(screen.queryByRole('button', { name: 'Добавить к образу' })).not.toBeInTheDocument();
  });

  it('shows the buy box and no try-on window at first', () => {
    setup();

    expect(screen.getByRole('heading', { level: 1, name: 'Annen' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the window for this product from «Примерить»', async () => {
    const user = setup();
    const button = screen.getByRole('button', { name: 'Примерить' });
    await vi.waitFor(() => expect(button).toBeEnabled());

    await user.click(button);

    expect(screen.getByRole('dialog', { name: 'Онлайн-примерка' })).toHaveAttribute(
      'data-product',
      ID,
    );
  });

  it('unmounts the window on close and opens a fresh one the next time', async () => {
    const user = setup();
    const button = screen.getByRole('button', { name: 'Примерить' });
    await vi.waitFor(() => expect(button).toBeEnabled());
    await user.click(button);

    await user.click(screen.getByRole('button', { name: 'Закрыть окно' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Примерить' }));
    expect(screen.getByRole('dialog', { name: 'Онлайн-примерка' })).toBeInTheDocument();
  });
});

// Next keeps a page left by a link hidden in an <Activity> with its state (spec 0023 Y22).
describe('ProductPurchase in a page Next hides', () => {
  function renderIn(mode: 'visible' | 'hidden', queryClient: QueryClient) {
    return (
      <QueryClientProvider client={queryClient}>
        <Activity mode={mode}>
          <ProductPurchase product={product} slot="top" />
        </Activity>
      </QueryClientProvider>
    );
  }

  async function openTryOn() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(renderIn('visible', queryClient));
    const user = userEvent.setup();
    const button = screen.getByRole('button', { name: 'Примерить' });
    await vi.waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    expect(screen.getByRole('dialog', { name: 'Онлайн-примерка' })).toBeInTheDocument();
    return {
      user,
      rerender: (mode: 'visible' | 'hidden') => view.rerender(renderIn(mode, queryClient)),
    };
  }

  it('keeps the window while the page stays shown', async () => {
    const { rerender } = await openTryOn();

    rerender('visible');

    expect(screen.getByRole('dialog', { name: 'Онлайн-примерка' })).toBeInTheDocument();
  });

  it('closes the window once the page is hidden, so Back shows the page without it', async () => {
    const { rerender } = await openTryOn();

    act(() => rerender('hidden'));
    act(() => rerender('visible'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Примерить' })).toBeInTheDocument();
  });

  it('opens the window again after coming back', async () => {
    const { user, rerender } = await openTryOn();
    act(() => rerender('hidden'));
    act(() => rerender('visible'));

    await user.click(screen.getByRole('button', { name: 'Примерить' }));

    expect(screen.getByRole('dialog', { name: 'Онлайн-примерка' })).toBeInTheDocument();
  });
});
