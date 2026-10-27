import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Fitting, FittingItem } from '@/entities/fitting';
import { fittingRoomKeys } from '@/entities/fitting-room';

const mocks = vi.hoisted(() => ({ track: vi.fn(), captureException: vi.fn() }));
vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  reset: vi.fn(),
  track: mocks.track,
}));
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }));
vi.mock('@/entities/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/session')>()),
  useSession: () => ({
    status: 'signed-in',
    user: { id: 'u1', email: 'a@example.com', name: 'A' },
  }),
}));

import { changedItemText, itemsBySlot, LookResult } from './look-result';
import { itemsText } from './look-subject';

const WHITE = '00000000-0000-4000-8000-0000000000c1';
const BLACK = '00000000-0000-4000-8000-0000000000c2';

function item(n: number, patch: Partial<FittingItem> = {}): FittingItem {
  return {
    productId: `00000000-0000-4000-8000-00000000000${n}`,
    name: `Рубашка Annen ${n}`,
    brand: 'Annen',
    imageUrl: null,
    price: 1000,
    finalPrice: 900,
    attributeValueId: WHITE,
    colour: 'Белый',
    slot: 'top',
    ...patch,
  };
}

function fitting(items: FittingItem[]): Fitting {
  return {
    id: '00000000-0000-4000-8000-0000000000e1',
    kind: 'look',
    parentId: null,
    status: 'completed',
    stage: 'done',
    failureCode: null,
    countsAgainstLimit: true,
    regenerationFree: true,
    model: 'gpt-image-2',
    items,
    promptText: null,
    photoId: null,
    resultUrl: null,
    createdAt: '2026-10-20T12:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    estimatedSeconds: null,
  };
}

describe('itemsBySlot', () => {
  it('orders the items top, bottom, outerwear, shoes, accessory', () => {
    const items = [
      item(1, { slot: 'accessory' }),
      item(2, { slot: 'shoes' }),
      item(3, { slot: 'top' }),
      item(4, { slot: 'outerwear' }),
      item(5, { slot: 'bottom' }),
    ];

    expect(itemsBySlot(items).map(({ slot }) => slot)).toEqual([
      'top',
      'bottom',
      'outerwear',
      'shoes',
      'accessory',
    ]);
  });

  it('puts an item with no slot last and leaves the input as it was', () => {
    const items = [item(1, { slot: null }), item(2, { slot: 'shoes' })];

    expect(itemsBySlot(items).map(({ slot }) => slot)).toEqual(['shoes', null]);
    expect(items.map(({ slot }) => slot)).toEqual([null, 'shoes']);
  });
});

describe('changedItemText', () => {
  it('names the item whose colour changed, in lower case, with the new colour', () => {
    const before = fitting([item(1), item(2, { slot: 'bottom', name: 'Джинсы' })]);
    const after = fitting([
      item(1, { attributeValueId: BLACK, colour: 'Чёрный', name: 'Тренч Nord' }),
      item(2, { slot: 'bottom', name: 'Джинсы' }),
    ]);

    expect(changedItemText(before, after)).toBe('тренч Nord, Чёрный');
  });

  it('is the name alone when the new colour has no name', () => {
    const before = fitting([item(1, { name: 'Рубашка' })]);
    const after = fitting([item(1, { name: 'Рубашка', attributeValueId: null, colour: null })]);

    expect(changedItemText(before, after)).toBe('рубашка');
  });

  it('is null when no colour changed', () => {
    const same = fitting([item(1), item(2, { slot: 'bottom' })]);

    expect(changedItemText(same, same)).toBeNull();
  });
});

describe('itemsText', () => {
  it.each([
    [2, '2 вещи'],
    [3, '3 вещи'],
    [5, '5 вещей'],
    [1, '1 вещь'],
  ])('says %i as %s', (count, text) => {
    expect(itemsText(count)).toBe(text);
  });
});

describe('LookResult analytics (A94)', () => {
  const P1 = '00000000-0000-4000-8000-0000000000a1';
  const P2 = '00000000-0000-4000-8000-0000000000a2';
  const DATE = '2026-10-20T12:00:00.000Z';

  function productOf(id: string) {
    return {
      id,
      article: 'A-1',
      name: 'Вещь',
      brand: { id, name: 'Brand' },
      category: { id, name: 'Категория', slug: 'cat' },
      image: null,
      price: 1000,
      discount: 0,
      finalPrice: 1000,
      rating: null,
      createdAt: DATE,
      updatedAt: DATE,
      description: null,
      images: [],
      variations: [{ id, size: 'M', stock: 3 }],
      attributes: [],
    };
  }

  function renderResult(roomCount: number | null) {
    const onOpenRoom = vi.fn();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    if (roomCount !== null) {
      queryClient.setQueryData(fittingRoomKeys.all, { items: [], count: roomCount, sum: 0 });
    }
    vi.stubGlobal('fetch', (url: string) => {
      const { pathname } = new URL(String(url));
      if (pathname === '/api/me/fitting-room') return new Promise(() => undefined);
      const id = pathname.split('/').pop() ?? P1;
      return Promise.resolve(new Response(JSON.stringify(productOf(id)), { status: 200 }));
    });
    render(
      <QueryClientProvider client={queryClient}>
        <LookResult
          fitting={fitting([
            item(1, { productId: P1, slot: 'top' }),
            item(2, { productId: P2, slot: 'bottom' }),
          ])}
          running={null}
          quota={undefined}
          onStarted={vi.fn()}
          onRegenerated={vi.fn()}
          onLimit={vi.fn()}
          onOpenRoom={onOpenRoom}
        />
      </QueryClientProvider>,
    );
    return onOpenRoom;
  }

  const sent = (element: string) =>
    mocks.track.mock.calls
      .filter(([event, props]) => event === 'Element Clicked' && props.element === element)
      .map(([, props]) => props);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends result.add-to-cart-all with the items count from the wide button', async () => {
    renderResult(2);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Добавить образ в корзину' }));

    expect(sent('result.add-to-cart-all')).toEqual([
      expect.objectContaining({ element: 'result.add-to-cart-all', items: 2 }),
    ]);
  });

  it('sends result.history from the link of «Сохранено в «Мои примерки»»', async () => {
    renderResult(2);
    const link = screen.getByRole('link', { name: '«Мои примерки»' });
    link.addEventListener('click', (event) => event.preventDefault());

    await userEvent.setup().click(link);

    expect(sent('result.history')).toEqual([
      expect.objectContaining({ element: 'result.history' }),
    ]);
  });

  it('names the look’s favourites button «Добавить образ в избранное» on a wide screen', () => {
    renderResult(2);

    expect(screen.getByRole('button', { name: 'Добавить образ в избранное' })).toBeEnabled();
  });

  describe('on a phone', () => {
    beforeEach(() => {
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query === '(width < 600px)',
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }));
    });

    it('sends it from the row under the picture and from the drawer’s footer', async () => {
      renderResult(2);
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      await user.click(screen.getByRole('button', { name: 'Добавить образ в корзину' }));
      expect(sent('result.add-to-cart-all')).toHaveLength(1);

      await user.click(screen.getByRole('button', { name: 'Вещи образа' }));
      const drawer = await screen.findByRole('dialog', { name: 'Вещи образа' });
      await user.click(within(drawer).getByRole('button', { name: 'Добавить образ в корзину' }));

      expect(sent('result.add-to-cart-all')).toEqual([
        expect.objectContaining({ items: 2 }),
        expect.objectContaining({ items: 2 }),
      ]);
    });
  });

  it('sends room.open from the result with the room’s count and opens the room', async () => {
    const onOpenRoom = renderResult(2);

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Заменить вещь в примерочной' }));

    expect(sent('room.open')).toEqual([
      expect.objectContaining({ element: 'room.open', source: 'result', items: 2 }),
    ]);
    expect(onOpenRoom).toHaveBeenCalled();
  });

  it('counts 0 items while the room is unread', async () => {
    const onOpenRoom = renderResult(null);

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Заменить вещь в примерочной' }));

    expect(sent('room.open')).toEqual([
      expect.objectContaining({ element: 'room.open', source: 'result', items: 0 }),
    ]);
    expect(onOpenRoom).toHaveBeenCalledOnce();
  });
});
