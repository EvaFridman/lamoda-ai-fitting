import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fittingRoomKeys, type FittingRoom } from '@/entities/fitting-room';
import type { ProductListItem } from '@/entities/product';

import { ToLookButton } from './to-look-button';

const mocks = vi.hoisted(() => ({
  session: { status: 'signed-in', user: { id: 'u1', email: 'a@b.c', name: null } } as
    | { status: 'pending' }
    | { status: 'signed-in'; user: { id: string; email: string; name: string | null } }
    | { status: 'signed-out'; failed: boolean },
  showToast: vi.fn(),
  track: vi.fn(),
}));

vi.mock('@/entities/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/session')>()),
  useSession: () => mocks.session,
}));
vi.mock('@/shared/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/ui')>()),
  showToast: mocks.showToast,
}));
vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  reset: vi.fn(),
  track: mocks.track,
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/products/p' }));

const DATE = '2026-10-01T12:00:00.000Z';
const BRAND = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const WHITE = '11111111-1111-4111-8111-111111111111';

const shirt: ProductListItem = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90001',
  article: 'A-1',
  name: 'Рубашка',
  brand: { id: BRAND, name: 'Annen' },
  category: { id: BRAND, name: 'Рубашки', slug: 'shirts' },
  image: null,
  price: 5000,
  discount: 0,
  finalPrice: 5000,
  rating: null,
  createdAt: DATE,
  updatedAt: DATE,
};

const inRoom: FittingRoom = {
  items: [{ slot: 'top', product: shirt, attributeValueId: WHITE, colour: 'белый' }],
  count: 1,
  sum: 5000,
};
const empty: FittingRoom = { items: [], count: 0, sum: 0 };

const fetchMock = vi.fn();

function setup(
  room: FittingRoom,
  props: {
    element?: 'buy-box.to-look';
    size?: 32 | 40 | 48 | 56;
    textSize?: 'body-m' | 'body-s';
  } = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(fittingRoomKeys.all, room);
  const onSignIn = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ToLookButton
        product={shirt}
        slot="top"
        attributeValueId={WHITE}
        onSignIn={onSignIn}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onSignIn, user: userEvent.setup() };
}

beforeEach(() => {
  mocks.session = { status: 'signed-in', user: { id: 'u1', email: 'a@b.c', name: null } };
  mocks.showToast.mockReset();
  mocks.track.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ToLookButton', () => {
  it('is «Добавить к образу», not pressed, while the product is not in the room', () => {
    setup(empty);

    expect(screen.getByRole('button', { name: 'Добавить к образу' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('is an outline button of size 48 (spec 0024 AC6)', () => {
    setup(empty);

    expect(screen.getByRole('button', { name: 'Добавить к образу' })).toHaveClass(
      'outline',
      'size48',
    );
  });

  it('has the normal text size by default', () => {
    setup(empty);

    expect(screen.getByRole('button', { name: 'Добавить к образу' })).not.toHaveClass('textBodyS');
  });

  it('is the small one, 32 in small text, when given (spec 0024 Z49)', () => {
    setup(empty, { size: 32, textSize: 'body-s' });

    const button = screen.getByRole('button', { name: 'Добавить к образу' });
    expect(button).toHaveClass('outline', 'size32', 'textBodyS');
    expect(button).not.toHaveClass('size48');
  });

  it('is «В образе», pressed, once the product is in the room', () => {
    setup(inRoom);

    expect(screen.getByRole('button', { name: 'В образе' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByRole('button', { name: 'Добавить к образу' })).not.toBeInTheDocument();
  });

  it('puts the product with the colour beside it', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ room: inRoom, replaced: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const { user } = setup(empty);

    await user.click(screen.getByRole('button', { name: 'Добавить к образу' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'В образе' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ productId: shirt.id, attributeValueId: WHITE });
  });

  it('takes the product out on a click while it is in the room', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })));
    const { user } = setup(inRoom);

    await user.click(screen.getByRole('button', { name: 'В образе' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Добавить к образу' })).toHaveAttribute(
        'aria-pressed',
        'false',
      ),
    );
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].method).toBe('DELETE');
  });

  it('asks a visitor to sign in and changes nothing (AC16)', async () => {
    mocks.session = { status: 'signed-out', failed: false };
    const { user, onSignIn } = setup(empty);

    await user.click(screen.getByRole('button', { name: 'Добавить к образу' }));

    expect(onSignIn).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tracks buy-box.to-look when given the element, and nothing without it', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })));
    const tracked = setup(inRoom, { element: 'buy-box.to-look' });

    await tracked.user.click(screen.getByRole('button', { name: 'В образе' }));

    expect(mocks.track).toHaveBeenCalledWith('Element Clicked', {
      element: 'buy-box.to-look',
      zone: 'product',
      type: 'interaction',
      slot: 'top',
      action: 'remove',
      signed_in: true,
    });
  });

  it('sends no element event without an element', async () => {
    mocks.session = { status: 'signed-out', failed: false };
    const { user } = setup(empty);

    await user.click(screen.getByRole('button', { name: 'Добавить к образу' }));

    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('waits (busy) while the session loads', () => {
    mocks.session = { status: 'pending' };
    setup(empty);

    expect(screen.getByRole('button', { name: 'Добавить к образу' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });
});
