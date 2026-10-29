import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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
    failureCategory: null,
    failureStage: null,
    countsAgainstLimit: true,
    regenerationFree: true,
    model: 'gpt-image-2',
    items,
    promptText: null,
    photoId: null,
    photoTransient: null,
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

  // The ids of products that have a second colour.
  let twoColours: string[] = [];

  function productOf(id: string) {
    const colours = twoColours.includes(id)
      ? [
          { id: WHITE, value: 'Белый', colorHex: '#FFFFFF' },
          { id: BLACK, value: 'Чёрный', colorHex: '#000000' },
        ]
      : [{ id: WHITE, value: 'Белый', colorHex: '#FFFFFF' }];
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
      attributes: [{ attribute: { id, name: 'Цвет' }, values: colours }],
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
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const { pathname } = new URL(String(url));
        if (pathname === '/api/me/fitting-room') return new Promise(() => undefined);
        const id = pathname.split('/').pop() ?? P1;
        return Promise.resolve(new Response(JSON.stringify(productOf(id)), { status: 200 }));
      }),
    );
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
    twoColours = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const COLOUR_LINE = 'Смена цвета одной вещи перегенерирует весь образ на этом же фото';

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

  it('keeps the approximate-picture caption out of the body: it is the hint of «Об изображении» (spec 0024 AC13)', async () => {
    renderResult(2);
    const user = userEvent.setup();

    expect(screen.queryByText(/Изображение приблизительное/)).not.toBeInTheDocument();
    await user.hover(screen.getByRole('button', { name: 'Об изображении' }));
    expect(await screen.findByText(/Изображение приблизительное/)).toHaveTextContent(
      'Изображение приблизительное, могут быть неточности в посадке, длине и цвете.',
    );
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

    it('has the same item cards and no separate «Вещи образа» screen (AC12)', async () => {
      renderResult(2);

      expect(screen.getByRole('heading', { name: 'Вещи образа' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Вещи образа' })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Рубашка Annen 1' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Рубашка Annen 2' })).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('keeps «Хотите что-то поменять в образе?»', () => {
      renderResult(2);

      // Off here only because the fixture's photo is gone.
      expect(
        screen.getByRole('button', { name: 'Хотите что-то поменять в образе?' }),
      ).toBeInTheDocument();
    });

    it('sends result.add-to-cart-all once, from the one button', async () => {
      renderResult(2);

      await userEvent
        .setup({ pointerEventsCheck: 0 })
        .click(screen.getByRole('button', { name: 'Добавить образ в корзину' }));

      expect(sent('result.add-to-cart-all')).toEqual([expect.objectContaining({ items: 2 })]);
    });
  });

  it('has no «Заменить вещь в примерочной» (AC14)', () => {
    renderResult(2);

    expect(
      screen.queryByRole('button', { name: 'Заменить вещь в примерочной' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Заменить вещь в примерочной' })).toBeNull();
  });

  it('says on a hover of the favourites heart that every item will be added (AC14)', async () => {
    renderResult(2);

    await userEvent
      .setup()
      .hover(screen.getByRole('button', { name: 'Добавить образ в избранное' }));

    expect(await screen.findByText('Добавим в избранное все вещи образа')).toBeInTheDocument();
  });

  it('opens the room at the item’s slot from its «Заменить», sending room.open', async () => {
    const onOpenRoom = renderResult(2);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Заменить: Рубашка Annen 2' }));

    expect(sent('room.open')).toEqual([
      expect.objectContaining({ element: 'room.open', source: 'result', items: 2 }),
    ]);
    expect(onOpenRoom).toHaveBeenCalledExactlyOnceWith('bottom');
  });

  it('opens the room with the top slot from the first item’s «Заменить»', async () => {
    const onOpenRoom = renderResult(2);

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Заменить: Рубашка Annen 1' }));

    expect(onOpenRoom).toHaveBeenCalledExactlyOnceWith('top');
  });

  it('counts 0 items while the room is unread', async () => {
    const onOpenRoom = renderResult(null);

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Заменить: Рубашка Annen 1' }));

    expect(sent('room.open')).toEqual([
      expect.objectContaining({ element: 'room.open', source: 'result', items: 0 }),
    ]);
    expect(onOpenRoom).toHaveBeenCalledOnce();
  });

  describe('the colour line and swatches (AC12)', () => {
    it('is not shown when every item has one colour', async () => {
      renderResult(2);

      await screen.findByRole('link', { name: 'Рубашка Annen 1' });
      await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
      expect(screen.queryByText(COLOUR_LINE)).not.toBeInTheDocument();
      expect(screen.queryByText('один цвет')).not.toBeInTheDocument();
      expect(screen.queryByRole('group', { name: /^Цвет:/ })).not.toBeInTheDocument();
    });

    it('is shown once some item has a second colour, with swatches for that item only', async () => {
      twoColours = [P2];
      renderResult(2);

      expect(await screen.findByText(COLOUR_LINE)).toBeInTheDocument();
      expect(
        await screen.findByRole('group', { name: 'Цвет: Рубашка Annen 2' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('group', { name: 'Цвет: Рубашка Annen 1' }),
      ).not.toBeInTheDocument();
    });
  });
});
