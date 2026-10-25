import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EMPTY_ROOM,
  fittingRoomKeys,
  type FittingRoom,
  type FittingRoomItem,
  useRoomStore,
} from '@/entities/fitting-room';
import type { ProductListItem } from '@/entities/product';
import { ApiError } from '@/shared/api';

import { useRoomActions } from './use-room-actions';

type MockSession =
  | { status: 'signed-in'; user: { id: string; email: string; name: string | null } }
  | { status: 'signed-out'; failed: boolean };

const mocks = vi.hoisted(() => ({
  showToast: vi.fn(),
  reportFailure: vi.fn(),
  track: vi.fn(),
  session: { status: 'signed-in', user: { id: 'u1', email: 'a@b.c', name: null } } as MockSession,
}));

vi.mock('@/entities/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/session')>()),
  useSession: () => mocks.session,
}));

vi.mock('@/shared/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/ui')>()),
  showToast: mocks.showToast,
}));
vi.mock('@/shared/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api')>()),
  reportFailure: mocks.reportFailure,
}));
vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  reset: vi.fn(),
  track: mocks.track,
}));

const DATE = '2026-10-01T12:00:00.000Z';
const BRAND = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const WHITE = '11111111-1111-4111-8111-111111111111';
const BLACK = '22222222-2222-4222-8222-222222222222';

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
const jeans = productOf(3, 'Джинсы');

function entry(
  slot: FittingRoomItem['slot'],
  product: ProductListItem,
  attributeValueId: string | null = null,
): FittingRoomItem {
  return { slot, product, attributeValueId, colour: attributeValueId ? 'белый' : null };
}

function roomOf(...items: FittingRoomItem[]): FittingRoom {
  return {
    items,
    count: items.length,
    sum: items.reduce((sum, item) => sum + item.product.finalPrice, 0),
  };
}

const fetchMock = vi.fn();

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

interface Write {
  method: string;
  path: string;
  body: unknown;
}

function writes(): Write[] {
  return fetchMock.mock.calls.map(([url, init]) => {
    const request = init as RequestInit;
    return {
      method: request.method ?? 'GET',
      path: new URL(String(url)).pathname,
      body: typeof request.body === 'string' ? JSON.parse(request.body) : undefined,
    };
  });
}

function setup(initial: FittingRoom = EMPTY_ROOM) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(fittingRoomKeys.all, initial);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = renderHook(() => useRoomActions(), { wrapper });
  return { ...view, client, room: () => client.getQueryData<FittingRoom>(fittingRoomKeys.all) };
}

interface Toast {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: string;
}

const lastToast = () => mocks.showToast.mock.calls.at(-1)?.[0] as Toast;

const elementClicks = () =>
  mocks.track.mock.calls.filter(([name]) => name === 'Element Clicked').map(([, event]) => event);

beforeEach(() => {
  mocks.showToast.mockReset();
  mocks.reportFailure.mockReset();
  mocks.track.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  mocks.session = { status: 'signed-in', user: { id: 'u1', email: 'a@b.c', name: null } };
  useRoomStore.setState({ open: false, wishes: null, userId: undefined });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('put', () => {
  it('sends the product and its colour to the slot and puts the answer into the cache', async () => {
    const after = roomOf(entry('top', shirt, WHITE));
    fetchMock.mockImplementation(() => json({ room: after, replaced: null }));
    const { result, room } = setup();

    let done = false;
    await act(async () => {
      done = await result.current.put({ product: shirt, slot: 'top', attributeValueId: WHITE });
    });

    expect(done).toBe(true);
    expect(writes()).toEqual([
      {
        method: 'PUT',
        path: '/api/me/fitting-room/top',
        body: { productId: shirt.id, attributeValueId: WHITE },
      },
    ]);
    expect(room()).toEqual(after);
  });

  it('leaves the colour out of the body when there is none', async () => {
    fetchMock.mockImplementation(() => json({ room: roomOf(entry('top', shirt)), replaced: null }));
    const { result } = setup();

    await act(async () => {
      await result.current.put({ product: shirt, slot: 'top', attributeValueId: null });
    });

    expect(writes()[0]?.body).toEqual({ productId: shirt.id });
  });

  it('says it is in the fitting room, with «Открыть», when the slot was empty (AC13)', async () => {
    fetchMock.mockImplementation(() => json({ room: roomOf(entry('top', shirt)), replaced: null }));
    const { result } = setup();

    await act(async () => {
      await result.current.put({ product: shirt, slot: 'top' });
    });

    expect(mocks.showToast).toHaveBeenCalledOnce();
    expect(lastToast().title).toBe('«Рубашка Annen» в примерочной: верх');
    expect(lastToast().actionLabel).toBe('Открыть');
  });

  it('names the slot in lower case in that toast', async () => {
    fetchMock.mockImplementation(() =>
      json({ room: roomOf(entry('outerwear', shirt)), replaced: null }),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.put({ product: shirt, slot: 'outerwear' });
    });

    expect(lastToast().title).toBe('«Рубашка Annen» в примерочной: верхняя одежда');
  });

  it('«Открыть» opens the room and sends room.open from the toast with the items now', async () => {
    fetchMock.mockImplementation(() =>
      json({ room: roomOf(entry('top', shirt), entry('bottom', jeans)), replaced: null }),
    );
    const { result } = setup();
    await act(async () => {
      await result.current.put({ product: shirt, slot: 'top' });
    });

    act(() => lastToast().onAction?.());

    expect(useRoomStore.getState().open).toBe(true);
    expect(elementClicks()).toEqual([
      { element: 'room.open', zone: 'fitting', type: 'interaction', source: 'toast', items: 2 },
    ]);
  });

  it('says what replaced what, with «Вернуть», when the slot held another product (AC13)', async () => {
    fetchMock.mockImplementation(() =>
      json({ room: roomOf(entry('top', blouse)), replaced: entry('top', shirt, WHITE) }),
    );
    const { result } = setup(roomOf(entry('top', shirt, WHITE)));

    await act(async () => {
      await result.current.put({ product: blouse, slot: 'top' });
    });

    expect(lastToast().title).toBe('Заменили верх: «Блузка Annen» вместо «Рубашка Annen»');
    expect(lastToast().actionLabel).toBe('Вернуть');
  });

  it('uses the accusative of the slot in the replace toast', async () => {
    fetchMock.mockImplementation(() =>
      json({ room: roomOf(entry('outerwear', blouse)), replaced: entry('outerwear', shirt) }),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.put({ product: blouse, slot: 'outerwear' });
    });

    expect(lastToast().title).toMatch(/^Заменили верхнюю одежду: /);
  });

  it('«Вернуть» puts the previous item back in its colour, silently, and sends room.undo', async () => {
    fetchMock.mockImplementation(() =>
      json({ room: roomOf(entry('top', blouse)), replaced: entry('top', shirt, WHITE) }),
    );
    const { result, room } = setup(roomOf(entry('top', shirt, WHITE)));
    await act(async () => {
      await result.current.put({ product: blouse, slot: 'top' });
    });
    const restored = roomOf(entry('top', shirt, WHITE));
    fetchMock.mockImplementation(() => json({ room: restored, replaced: entry('top', blouse) }));

    act(() => lastToast().onAction?.());

    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1]).toEqual({
      method: 'PUT',
      path: '/api/me/fitting-room/top',
      body: { productId: shirt.id, attributeValueId: WHITE },
    });
    await waitFor(() => expect(room()).toEqual(restored));
    expect(mocks.showToast).toHaveBeenCalledTimes(1);
    expect(elementClicks()).toEqual([
      {
        element: 'room.undo',
        zone: 'fitting',
        type: 'interaction',
        slot: 'top',
        action: 'replace',
      },
    ]);
  });

  it('says nothing for the same product in another colour', async () => {
    fetchMock.mockImplementation(() =>
      json({ room: roomOf(entry('top', shirt, BLACK)), replaced: entry('top', shirt, WHITE) }),
    );
    const { result } = setup(roomOf(entry('top', shirt, WHITE)));

    await act(async () => {
      await result.current.put({ product: shirt, slot: 'top', attributeValueId: BLACK });
    });

    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it('says nothing for a product already in the room (the api answers replaced: null)', async () => {
    fetchMock.mockImplementation(() => json({ room: roomOf(entry('top', shirt)), replaced: null }));
    const { result, room } = setup(roomOf(entry('top', shirt)));

    let done = false;
    await act(async () => {
      done = await result.current.put({ product: shirt, slot: 'top' });
    });

    expect(done).toBe(true);
    expect(writes()).toHaveLength(1);
    expect(room()).toEqual(roomOf(entry('top', shirt)));
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it('says nothing when announced silently, whether the slot was empty or not', async () => {
    fetchMock.mockImplementation(() =>
      json({ room: roomOf(entry('top', blouse)), replaced: entry('top', shirt) }),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.put({ product: blouse, slot: 'top' }, 'silent');
    });

    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it('shows the error in a toast, reports it, keeps the cache and answers false', async () => {
    const before = roomOf(entry('top', shirt));
    fetchMock.mockImplementation(() =>
      json({ error: { code: 'RELATED_NOT_FOUND', message: 'm', details: [] } }, 400),
    );
    const { result, room } = setup(before);

    let done = true;
    await act(async () => {
      done = await result.current.put({ product: blouse, slot: 'top' });
    });

    expect(done).toBe(false);
    expect(room()).toEqual(before);
    expect(mocks.showToast).toHaveBeenCalledOnce();
    expect(lastToast().tone).toBe('error');
    expect(lastToast().title).not.toBe('');
    expect(mocks.reportFailure).toHaveBeenCalledOnce();
    expect(mocks.reportFailure.mock.calls[0]?.[0]).toBeInstanceOf(ApiError);
  });

  it('does not repeat a failed write by itself', async () => {
    fetchMock.mockImplementation(() =>
      json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'm', details: [] } }, 503),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.put({ product: shirt, slot: 'top' });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('is pending while the write is on its way', async () => {
    let finish: (response: Response) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = setup();
    expect(result.current.pending).toBe(false);

    let done: Promise<boolean> = Promise.resolve(false);
    act(() => {
      done = result.current.put({ product: shirt, slot: 'top' });
    });
    await waitFor(() => expect(result.current.pending).toBe(true));

    await act(async () => {
      finish(
        new Response(JSON.stringify({ room: roomOf(entry('top', shirt)), replaced: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      await done;
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
  });
});

describe('another user at the tab (spec 0017 U22)', () => {
  const NO_CONTENT = () => Promise.resolve(new Response(null, { status: 204 }));

  function holdPut(answer: unknown) {
    let finish: () => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = () =>
            resolve(
              new Response(JSON.stringify(answer), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              }),
            );
        }),
    );
    return () => finish();
  }

  it('does not write a put answer that arrives after the user changed, and reads the room again', async () => {
    const before = roomOf(entry('top', jeans));
    const finish = holdPut({ room: roomOf(entry('top', shirt)), replaced: null });
    const { result, room, client } = setup(before);
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    let done: Promise<boolean> = Promise.resolve(false);
    act(() => {
      done = result.current.put({ product: shirt, slot: 'top' });
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    act(() => useRoomStore.getState().setUser('u2'));
    await act(async () => {
      finish();
      await done;
    });

    expect(room()).toEqual(before);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: fittingRoomKeys.all });
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it('does not write a remove answer after the user changed, and shows no toast', async () => {
    const before = roomOf(entry('top', shirt));
    let finish: () => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = () => resolve(new Response(null, { status: 204 }));
        }),
    );
    const { result, room, client } = setup(before);
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    let done: Promise<boolean> = Promise.resolve(false);
    act(() => {
      done = result.current.remove(entry('top', shirt));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    act(() => useRoomStore.getState().setUser(null));
    await act(async () => {
      finish();
      await done;
    });

    expect(room()).toEqual(before);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: fittingRoomKeys.all });
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it('does not empty the next user’s cached room when a clear answers late', async () => {
    const before = roomOf(entry('top', shirt));
    let finish: () => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = () => resolve(new Response(null, { status: 204 }));
        }),
    );
    const { result, room } = setup(before);

    let done: Promise<boolean> = Promise.resolve(false);
    act(() => {
      done = result.current.clear();
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    act(() => useRoomStore.getState().setUser('u2'));
    await act(async () => {
      finish();
      await done;
    });

    expect(room()).toEqual(before);
  });

  it('writes the answer when the store has learned the same user meanwhile', async () => {
    const after = roomOf(entry('top', shirt));
    const finish = holdPut({ room: after, replaced: null });
    const { result, room } = setup();

    let done: Promise<boolean> = Promise.resolve(false);
    act(() => {
      done = result.current.put({ product: shirt, slot: 'top' });
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    act(() => useRoomStore.getState().setUser('u1'));
    await act(async () => {
      finish();
      await done;
    });

    expect(room()).toEqual(after);
    expect(mocks.showToast).toHaveBeenCalledOnce();
  });

  it('«Открыть» does nothing for another user: the room stays shut and nothing is tracked', async () => {
    fetchMock.mockImplementation(() => json({ room: roomOf(entry('top', shirt)), replaced: null }));
    const { result } = setup();
    await act(async () => {
      await result.current.put({ product: shirt, slot: 'top' });
    });
    act(() => useRoomStore.getState().setUser('u2'));

    act(() => lastToast().onAction?.());

    expect(useRoomStore.getState().open).toBe(false);
    expect(elementClicks()).toEqual([]);
  });

  it('«Вернуть» after a replacement sends no PUT for another user and tracks nothing', async () => {
    fetchMock.mockImplementation(() =>
      json({ room: roomOf(entry('top', blouse)), replaced: entry('top', shirt, WHITE) }),
    );
    const { result } = setup(roomOf(entry('top', shirt, WHITE)));
    await act(async () => {
      await result.current.put({ product: blouse, slot: 'top' });
    });
    act(() => useRoomStore.getState().setUser('u2'));

    act(() => lastToast().onAction?.());

    expect(writes()).toHaveLength(1);
    expect(elementClicks()).toEqual([]);
  });

  it('«Вернуть» after a removal sends no PUT after the user signed out', async () => {
    fetchMock.mockImplementation(NO_CONTENT);
    const item = entry('top', shirt, WHITE);
    const { result } = setup(roomOf(item));
    await act(async () => {
      await result.current.remove(item);
    });
    act(() => useRoomStore.getState().setUser(null));

    act(() => lastToast().onAction?.());

    expect(writes()).toHaveLength(1);
    expect(elementClicks()).toEqual([]);
  });

  it('«Вернуть» still works for the same user', async () => {
    fetchMock.mockImplementation(NO_CONTENT);
    const item = entry('top', shirt, WHITE);
    const { result } = setup(roomOf(item));
    await act(async () => {
      await result.current.remove(item);
    });
    act(() => useRoomStore.getState().setUser('u1'));
    fetchMock.mockImplementation(() => json({ room: roomOf(item), replaced: null }));

    act(() => lastToast().onAction?.());

    await waitFor(() => expect(writes()).toHaveLength(2));
  });

  it('a write signed out writes nothing into the cache and shows no toast', async () => {
    mocks.session = { status: 'signed-out', failed: false };
    fetchMock.mockImplementation(() => json({ room: roomOf(entry('top', shirt)), replaced: null }));
    const before = roomOf(entry('top', jeans));
    const { result, room, client } = setup(before);
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await act(async () => {
      await result.current.put({ product: shirt, slot: 'top' });
    });

    expect(room()).toEqual(before);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: fittingRoomKeys.all });
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it('a remove signed out writes nothing into the cache and shows no toast', async () => {
    mocks.session = { status: 'signed-out', failed: false };
    fetchMock.mockImplementation(NO_CONTENT);
    const before = roomOf(entry('top', shirt));
    const { result, room } = setup(before);

    await act(async () => {
      await result.current.remove(entry('top', shirt));
    });

    expect(room()).toEqual(before);
    expect(mocks.showToast).not.toHaveBeenCalled();
  });
});

describe('a room read in flight', () => {
  it.each([
    [
      'put',
      (actions: ReturnType<typeof useRoomActions>) => actions.put({ product: shirt, slot: 'top' }),
    ],
    ['remove', (actions: ReturnType<typeof useRoomActions>) => actions.remove(entry('top', shirt))],
    ['clear', (actions: ReturnType<typeof useRoomActions>) => actions.clear()],
  ])('is cancelled before a %s writes', async (_name, write) => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === 'PUT'
        ? json({ room: roomOf(entry('top', shirt)), replaced: null })
        : Promise.resolve(new Response(null, { status: 204 })),
    );
    const { result, client } = setup(roomOf(entry('top', shirt)));
    const cancel = vi.spyOn(client, 'cancelQueries');

    await act(async () => {
      await write(result.current);
    });

    expect(cancel).toHaveBeenCalledWith({ queryKey: fittingRoomKeys.all });
    expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(
      fetchMock.mock.invocationCallOrder[0] ?? Infinity,
    );
  });

  it('cannot overwrite the answer of a put that started after it', async () => {
    const after = roomOf(entry('top', shirt));
    fetchMock.mockImplementation(() => json({ room: after, replaced: null }));
    const { result, client, room } = setup(roomOf());
    const staleRead = client
      .fetchQuery({
        queryKey: fittingRoomKeys.all,
        queryFn: () => new Promise<FittingRoom>(() => undefined),
        staleTime: 0,
      })
      .catch(() => undefined);

    await act(async () => {
      await result.current.put({ product: shirt, slot: 'top' });
    });
    await staleRead;

    expect(client.getQueryState(fittingRoomKeys.all)?.fetchStatus).toBe('idle');
    expect(room()).toEqual(after);
  });
});

describe('remove', () => {
  it('deletes the slot, takes the item out of the cached room and recounts', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })));
    const { result, room } = setup(roomOf(entry('top', shirt, WHITE), entry('bottom', jeans)));

    let done = false;
    await act(async () => {
      done = await result.current.remove(entry('top', shirt, WHITE));
    });

    expect(done).toBe(true);
    expect(writes()).toEqual([
      { method: 'DELETE', path: '/api/me/fitting-room/top', body: undefined },
    ]);
    expect(room()).toEqual(roomOf(entry('bottom', jeans)));
  });

  it('says «Убрали …» with «Вернуть»', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })));
    const { result } = setup(roomOf(entry('top', shirt)));

    await act(async () => {
      await result.current.remove(entry('top', shirt));
    });

    expect(lastToast().title).toBe('Убрали «Рубашка Annen» из примерочной');
    expect(lastToast().actionLabel).toBe('Вернуть');
  });

  it('«Вернуть» puts it back with its colour, with no toast of its own, and sends room.undo', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })));
    const item = entry('top', shirt, WHITE);
    const { result, room } = setup(roomOf(item));
    await act(async () => {
      await result.current.remove(item);
    });
    fetchMock.mockImplementation(() => json({ room: roomOf(item), replaced: null }));

    act(() => lastToast().onAction?.());

    await waitFor(() => expect(room()).toEqual(roomOf(item)));
    expect(writes()[1]).toEqual({
      method: 'PUT',
      path: '/api/me/fitting-room/top',
      body: { productId: shirt.id, attributeValueId: WHITE },
    });
    expect(mocks.showToast).toHaveBeenCalledTimes(1);
    expect(elementClicks()).toEqual([
      { element: 'room.undo', zone: 'fitting', type: 'interaction', slot: 'top', action: 'remove' },
    ]);
  });

  it('shows the error, keeps the item in the cache and answers false when the delete fails', async () => {
    fetchMock.mockImplementation(() =>
      json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'm', details: [] } }, 503),
    );
    const before = roomOf(entry('top', shirt));
    const { result, room } = setup(before);

    let done = true;
    await act(async () => {
      done = await result.current.remove(entry('top', shirt));
    });

    expect(done).toBe(false);
    expect(room()).toEqual(before);
    expect(lastToast().tone).toBe('error');
    expect(mocks.reportFailure).toHaveBeenCalledOnce();
  });

  it('works from an empty cache', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useRoomActions(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    await act(async () => {
      await result.current.remove(entry('top', shirt));
    });

    expect(client.getQueryData(fittingRoomKeys.all)).toEqual(EMPTY_ROOM);
  });
});

describe('clear', () => {
  it('deletes the room and empties the cache with no toast', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })));
    const { result, room } = setup(roomOf(entry('top', shirt), entry('bottom', jeans)));

    let done = false;
    await act(async () => {
      done = await result.current.clear();
    });

    expect(done).toBe(true);
    expect(writes()).toEqual([{ method: 'DELETE', path: '/api/me/fitting-room', body: undefined }]);
    expect(room()).toEqual(EMPTY_ROOM);
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it('shows the error and keeps the room when the delete fails', async () => {
    fetchMock.mockImplementation(() =>
      json({ error: { code: 'UNAUTHORIZED', message: 'm', details: [] } }, 401),
    );
    const before = roomOf(entry('top', shirt));
    const { result, room } = setup(before);

    let done = true;
    await act(async () => {
      done = await result.current.clear();
    });

    expect(done).toBe(false);
    expect(room()).toEqual(before);
    expect(lastToast().tone).toBe('error');
  });
});
