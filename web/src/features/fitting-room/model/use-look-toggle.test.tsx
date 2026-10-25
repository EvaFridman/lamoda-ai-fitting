import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fittingRoomKeys, type FittingRoom, type FittingRoomItem } from '@/entities/fitting-room';
import type { ProductListItem } from '@/entities/product';

import { lookAction, useLookToggle, type UseLookToggleOptions } from './use-look-toggle';

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
const WHITE = '11111111-1111-4111-8111-111111111111';

function productOf(n: number, name: string): ProductListItem {
  return {
    id: `7c9e6679-7425-40de-944b-e07fc1f9${String(n).padStart(4, '0')}`,
    article: `A-${n}`,
    name,
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
}

const shirt = productOf(1, 'Рубашка');
const blouse = productOf(2, 'Блузка');

function entry(slot: FittingRoomItem['slot'], product: ProductListItem): FittingRoomItem {
  return { slot, product, attributeValueId: null, colour: null };
}

function roomOf(...items: FittingRoomItem[]): FittingRoom {
  return { items, count: items.length, sum: items.length * 5000 };
}

describe('lookAction', () => {
  it('adds while the room is unknown or empty', () => {
    expect(lookAction(undefined, shirt.id, 'top')).toBe('add');
    expect(lookAction(roomOf(), shirt.id, 'top')).toBe('add');
  });

  it('adds when only other slots are taken', () => {
    expect(lookAction(roomOf(entry('bottom', blouse)), shirt.id, 'top')).toBe('add');
  });

  it('replaces when the slot holds another product', () => {
    expect(lookAction(roomOf(entry('top', blouse)), shirt.id, 'top')).toBe('replace');
  });

  it('removes when the product itself is in the room', () => {
    expect(lookAction(roomOf(entry('top', shirt)), shirt.id, 'top')).toBe('remove');
  });

  it('removes a product found under any slot', () => {
    expect(lookAction(roomOf(entry('bottom', shirt)), shirt.id, 'top')).toBe('remove');
  });
});

const fetchMock = vi.fn();
const json = (body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

function setup(options: Partial<UseLookToggleOptions> = {}, room: FittingRoom | null = roomOf()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  if (room) client.setQueryData(fittingRoomKeys.all, room);
  const onSignIn = vi.fn();
  const view = renderHook(
    () => useLookToggle({ product: shirt, slot: 'top', onSignIn, ...options }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  return { ...view, onSignIn, client };
}

const clicks = () =>
  mocks.track.mock.calls.filter(([name]) => name === 'Element Clicked').map(([, event]) => event);

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

describe('useLookToggle signed in', () => {
  it('is not pressed and enabled with the room read and the product out of it', () => {
    const { result } = setup();

    expect(result.current.pressed).toBe(false);
    expect(result.current.busy).toBe(false);
  });

  it('is pressed when the product is in the room', () => {
    const { result } = setup({}, roomOf(entry('top', shirt)));

    expect(result.current.pressed).toBe(true);
  });

  it('is busy while the room loads, and a click does nothing', () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    const { result } = setup({ element: 'catalog.to-look' }, null);

    expect(result.current.busy).toBe(true);
    fetchMock.mockClear();
    act(() => result.current.toggle());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(clicks()).toEqual([]);
  });

  it('gives no hover start while busy, but keeps the leave', () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    const { result } = setup({ element: 'catalog.to-look' }, null);

    expect(result.current.events.onPointerEnter).toBeUndefined();
    expect(result.current.events.onPointerLeave).toBeTypeOf('function');
  });

  it('puts the product with the colour given when toggled out of the room', async () => {
    fetchMock.mockImplementation(() => json({ room: roomOf(entry('top', shirt)), replaced: null }));
    const { result } = setup({ attributeValueId: WHITE });

    act(() => result.current.toggle());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).pathname).toBe('/api/me/fitting-room/top');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ productId: shirt.id, attributeValueId: WHITE });
    await waitFor(() => expect(result.current.pressed).toBe(true));
  });

  it('removes the product from its slot, whichever the slot given, when toggled in the room', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })));
    const { result } = setup({ slot: 'top' }, roomOf(entry('bottom', shirt)));

    act(() => result.current.toggle());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).pathname).toBe('/api/me/fitting-room/bottom');
    expect(init.method).toBe('DELETE');
    await waitFor(() => expect(result.current.pressed).toBe(false));
  });

  it('does not call onSignIn', async () => {
    fetchMock.mockImplementation(() => json({ room: roomOf(entry('top', shirt)), replaced: null }));
    const { result, onSignIn } = setup();

    act(() => result.current.toggle());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(onSignIn).not.toHaveBeenCalled();
  });

  it('is busy while its write runs, and a second click sends nothing', async () => {
    let finish: (response: Response) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = setup();

    act(() => result.current.toggle());
    await waitFor(() => expect(result.current.busy).toBe(true));
    act(() => result.current.toggle());
    expect(fetchMock).toHaveBeenCalledOnce();

    await act(async () => {
      finish(
        new Response(JSON.stringify({ room: roomOf(entry('top', shirt)), replaced: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });
    await waitFor(() => expect(result.current.busy).toBe(false));
  });
});

describe('useLookToggle signed out (AC16)', () => {
  beforeEach(() => {
    mocks.session = { status: 'signed-out', failed: false };
  });

  it('asks the placer for the sign-in window and sends no request', () => {
    const { result, onSignIn } = setup({}, null);

    act(() => result.current.toggle());

    expect(onSignIn).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it('is enabled and not pressed, and reads no room', () => {
    const { result } = setup({}, null);

    expect(result.current.busy).toBe(false);
    expect(result.current.pressed).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does the same after a failed session read', () => {
    mocks.session = { status: 'signed-out', failed: true };
    const { result, onSignIn } = setup({}, null);

    act(() => result.current.toggle());

    expect(onSignIn).toHaveBeenCalledOnce();
  });
});

describe('useLookToggle while the session loads', () => {
  it('is busy and reads nothing', () => {
    mocks.session = { status: 'pending' };
    const { result } = setup({}, null);

    expect(result.current.busy).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('useLookToggle tracking (A90.9)', () => {
  it('sends its element with the slot, the action and signed_in on a click', () => {
    const { result } = setup({ element: 'catalog.to-look' });

    act(() => result.current.toggle());

    expect(clicks()).toEqual([
      {
        element: 'catalog.to-look',
        zone: 'catalog',
        type: 'interaction',
        slot: 'top',
        action: 'add',
        signed_in: true,
      },
    ]);
  });

  it('reports the replace action when the slot holds another product', () => {
    const { result } = setup({ element: 'related.to-look' }, roomOf(entry('top', blouse)));

    act(() => result.current.toggle());

    expect(clicks()).toEqual([expect.objectContaining({ action: 'replace', signed_in: true })]);
  });

  it('reports the remove action when the product is in the room', () => {
    const { result } = setup({ element: 'buy-box.to-look' }, roomOf(entry('top', shirt)));

    act(() => result.current.toggle());

    expect(clicks()).toEqual([
      expect.objectContaining({ element: 'buy-box.to-look', action: 'remove', slot: 'top' }),
    ]);
  });

  it('reports signed_in false and the add action for a visitor', () => {
    mocks.session = { status: 'signed-out', failed: false };
    const { result } = setup({ element: 'catalog.to-look', slot: 'shoes' }, null);

    act(() => result.current.toggle());

    expect(clicks()).toEqual([
      expect.objectContaining({ slot: 'shoes', action: 'add', signed_in: false }),
    ]);
  });

  it('sends nothing, and gives no hover handlers, without an element (the result’s tile)', () => {
    fetchMock.mockImplementation(() => json({ room: roomOf(entry('top', shirt)), replaced: null }));
    const { result } = setup();

    act(() => result.current.toggle());

    expect(clicks()).toEqual([]);
    expect(result.current.events).toEqual({});
  });

  it('gives hover handlers for a tracked place', () => {
    const { result } = setup({ element: 'catalog.to-look' });

    expect(result.current.events.onPointerEnter).toBeTypeOf('function');
    expect(result.current.events.onPointerLeave).toBeTypeOf('function');
  });
});
