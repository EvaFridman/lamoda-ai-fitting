import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fittingRoomKeys, type FittingRoom } from '@/entities/fitting-room';
import type { ProductListItem } from '@/entities/product';

import { RoomLookToggle } from './room-look-toggle';

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
vi.mock('next/navigation', () => ({ usePathname: () => '/catalog' }));

const DATE = '2026-10-01T12:00:00.000Z';
const BRAND = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';

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
  items: [{ slot: 'top', product: shirt, attributeValueId: null, colour: null }],
  count: 1,
  sum: 5000,
};
const empty: FittingRoom = { items: [], count: 0, sum: 0 };

const fetchMock = vi.fn();

function setup(room: FittingRoom) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(fittingRoomKeys.all, room);
  const onSignIn = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <RoomLookToggle product={shirt} slot="top" element="catalog.to-look" onSignIn={onSignIn} />
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

describe('RoomLookToggle', () => {
  it('is the card’s hanger, not pressed, for a product out of the room', () => {
    setup(empty);

    expect(screen.getByRole('button', { name: 'Добавить к образу' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('is pressed and named for taking out when the product is in the room', () => {
    setup(inRoom);

    expect(screen.getByRole('button', { name: 'В примерочной — убрать' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('puts the product into its slot with no colour and tracks catalog.to-look', async () => {
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
      expect(screen.getByRole('button', { name: 'В примерочной — убрать' })).toBeInTheDocument(),
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).pathname).toBe('/api/me/fitting-room/top');
    expect(JSON.parse(String(init.body))).toEqual({ productId: shirt.id });
    expect(mocks.track).toHaveBeenCalledWith('Element Clicked', {
      element: 'catalog.to-look',
      zone: 'catalog',
      type: 'interaction',
      slot: 'top',
      action: 'add',
      signed_in: true,
    });
  });

  it('asks the placer for its sign-in window for a visitor, with no request (AC16)', async () => {
    mocks.session = { status: 'signed-out', failed: false };
    const { user, onSignIn } = setup(empty);

    await user.click(screen.getByRole('button', { name: 'Добавить к образу' }));

    expect(onSignIn).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.track).toHaveBeenCalledWith(
      'Element Clicked',
      expect.objectContaining({ element: 'catalog.to-look', signed_in: false }),
    );
  });

  it('is busy, focusable and inert while the session loads', async () => {
    mocks.session = { status: 'pending' };
    const { user, onSignIn } = setup(empty);
    const button = screen.getByRole('button', { name: 'Добавить к образу' });

    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toBeEnabled();
    await user.click(button);

    expect(onSignIn).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
  });
});
