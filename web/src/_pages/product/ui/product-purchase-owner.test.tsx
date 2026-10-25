import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProductDetail } from '@/entities/product';
import type { SessionState } from '@/entities/session';

import { ProductPurchase } from './product-purchase';

const mocks = vi.hoisted(() => ({ session: { status: 'pending' } as SessionState }));

vi.mock('@/entities/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/session')>()),
  useSession: () => mocks.session,
}));
vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  reset: vi.fn(),
  track: vi.fn(),
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

function signedIn(id: string): SessionState {
  return { status: 'signed-in', user: { id, email: `${id}@example.com`, name: null } };
}

beforeEach(() => {
  mocks.session = signedIn('u1');
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: unknown) => {
    const { pathname } = new URL(String(url));
    let body: unknown = { limit: 20, used: 0, left: 20, renewsAt: '2026-10-31T21:00:00.000Z' };
    if (pathname === '/api/me/photos') body = [];
    else if (pathname === '/api/me/fitting-room') body = { items: [], count: 0, sum: 0 };
    const missing = pathname.endsWith('/fittings/last');
    return Promise.resolve(
      new Response(
        JSON.stringify(
          missing ? { error: { code: 'NOT_FOUND', message: 'm', details: [] } } : body,
        ),
        { status: missing ? 404 : 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('ProductPurchase window owner', () => {
  it('closes the try-on window opened from the buy box when another user signs in', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // A new element each time: the same one would bail out and not read the session again.
    const tree = () => (
      <QueryClientProvider client={queryClient}>
        <ProductPurchase product={product} slot="top" />
      </QueryClientProvider>
    );
    const view = render(tree());
    const button = screen.getByRole('button', { name: 'Примерить' });
    await vi.waitFor(() => expect(button).toBeEnabled());
    await userEvent.setup().click(button);
    expect(await screen.findByRole('dialog', { name: 'Онлайн-примерка' })).toBeInTheDocument();

    mocks.session = signedIn('u2');
    view.rerender(tree());

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
