import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fittingRoomKeys, type FittingRoom, useRoomStore } from '@/entities/fitting-room';

import { HeaderRoom } from './header-room';

const mocks = vi.hoisted(() => ({
  session: { status: 'signed-in', user: { id: 'u1', email: 'a@b.c', name: null } } as
    | { status: 'pending' }
    | { status: 'signed-in'; user: { id: string; email: string; name: string | null } }
    | { status: 'signed-out'; failed: boolean },
  track: vi.fn(),
}));

vi.mock('@/entities/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/session')>()),
  useSession: () => mocks.session,
}));
vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  reset: vi.fn(),
  track: mocks.track,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/catalog',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const DATE = '2026-10-01T12:00:00.000Z';
const BRAND = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';

function item(slot: FittingRoom['items'][number]['slot'], n: number) {
  return {
    slot,
    attributeValueId: null,
    colour: null,
    product: {
      id: `7c9e6679-7425-40de-944b-e07fc1f9${String(n).padStart(4, '0')}`,
      article: `A-${n}`,
      name: 'Вещь',
      brand: { id: BRAND, name: 'Annen' },
      category: { id: BRAND, name: 'Рубашки', slug: 'shirts' },
      image: null,
      price: 5000,
      discount: 0,
      finalPrice: 5000,
      rating: null,
      createdAt: DATE,
      updatedAt: DATE,
    },
  };
}

const fetchMock = vi.fn();

function setup(room?: FittingRoom) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  if (room) client.setQueryData(fittingRoomKeys.all, room);
  render(
    <QueryClientProvider client={client}>
      <HeaderRoom />
    </QueryClientProvider>,
  );
  return userEvent.setup({ pointerEventsCheck: 0 });
}

beforeEach(() => {
  mocks.session = { status: 'signed-in', user: { id: 'u1', email: 'a@b.c', name: null } };
  mocks.track.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  useRoomStore.setState({ open: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HeaderRoom signed in', () => {
  it('shows the count of the room in its name (AC13)', () => {
    setup({ items: [item('top', 1), item('shoes', 2), item('bottom', 3)], count: 3, sum: 15000 });

    expect(screen.getByRole('button', { name: 'Примерочная, 3 вещи' })).toBeInTheDocument();
  });

  it('has no count for an empty room', () => {
    setup({ items: [], count: 0, sum: 0 });

    expect(screen.getByRole('button', { name: 'Примерочная' })).toBeInTheDocument();
  });

  it('has no count while the room loads', () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    setup();

    expect(screen.getByRole('button', { name: 'Примерочная' })).toBeInTheDocument();
  });

  it('opens the room and sends room.open from the header with the count', async () => {
    const user = setup({ items: [item('top', 1), item('bottom', 2)], count: 2, sum: 10000 });

    await user.click(screen.getByRole('button', { name: 'Примерочная, 2 вещи' }));

    expect(useRoomStore.getState().open).toBe(true);
    expect(mocks.track).toHaveBeenCalledExactlyOnceWith('Element Clicked', {
      element: 'room.open',
      zone: 'fitting',
      type: 'interaction',
      source: 'header',
      items: 2,
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('HeaderRoom signed out (AC16)', () => {
  beforeEach(() => {
    mocks.session = { status: 'signed-out', failed: false };
  });

  it('opens the sign-in window and not the room, and reads nothing', async () => {
    const user = setup();

    await user.click(screen.getByRole('button', { name: 'Примерочная' }));

    expect(await screen.findByRole('dialog', { name: 'Вход' })).toBeInTheDocument();
    expect(useRoomStore.getState().open).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.track).toHaveBeenCalledWith('Login Opened', {});
  });

  it('does the same after a failed session read', async () => {
    mocks.session = { status: 'signed-out', failed: true };
    const user = setup();

    await user.click(screen.getByRole('button', { name: 'Примерочная' }));

    expect(await screen.findByRole('dialog', { name: 'Вход' })).toBeInTheDocument();
  });
});

describe('HeaderRoom while the session loads', () => {
  it('is inert: aria-disabled, no window, no room', async () => {
    mocks.session = { status: 'pending' };
    const user = setup();
    const button = screen.getByRole('button', { name: 'Примерочная' });

    await user.click(button);

    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useRoomStore.getState().open).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
