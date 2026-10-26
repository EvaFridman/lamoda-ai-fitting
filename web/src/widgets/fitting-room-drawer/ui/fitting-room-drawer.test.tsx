import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRoomStore } from '@/entities/fitting-room';
import { PHONE_QUERY } from '@/shared/config';

import { FittingRoomDrawer } from './fitting-room-drawer';

const mocks = vi.hoisted(() => ({
  session: { status: 'signed-in', user: { id: 'u1', email: 'a@b.c', name: null } } as
    | { status: 'pending' }
    | { status: 'signed-in'; user: { id: string; email: string; name: string | null } }
    | { status: 'signed-out'; failed: boolean },
  pathname: '/catalog',
  showToast: vi.fn(),
  track: vi.fn(),
  captureException: vi.fn(),
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
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }));
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const DATE = '2026-10-01T12:00:00.000Z';
const BRAND = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const WHITE = '11111111-1111-4111-8111-111111111111';
const BLACK = '22222222-2222-4222-8222-222222222222';
const BLUE = '33333333-3333-4333-8333-333333333333';
const SIZE_ID = '44444444-4444-4444-8444-444444444444';
const COLOUR_ATTRIBUTE = '55555555-5555-4555-8555-555555555555';

function listItem(n: number, name: string, finalPrice: number) {
  return {
    id: `7c9e6679-7425-40de-944b-e07fc1f9${String(n).padStart(4, '0')}`,
    article: `A-${n}`,
    name,
    brand: { id: BRAND, name: 'Annen' },
    category: { id: BRAND, name: 'Категория', slug: 'cat' },
    image: null,
    price: finalPrice,
    discount: 0,
    finalPrice,
    rating: null,
    createdAt: DATE,
    updatedAt: DATE,
  };
}

const shirt = listItem(1, 'Рубашка', 5000);
const jeans = listItem(2, 'Джинсы', 4000);

function detail(base: ReturnType<typeof listItem>, colours: [string, string, string | null][]) {
  return {
    ...base,
    description: null,
    images: [],
    variations: [
      { id: SIZE_ID, size: 'M', stock: 2 },
      { id: BRAND, size: 'S', stock: 2 },
    ],
    attributes: [
      {
        attribute: { id: COLOUR_ATTRIBUTE, name: 'Цвет' },
        values: colours.map(([id, value, colorHex]) => ({ id, value, colorHex })),
      },
    ],
  };
}

const details = new Map([
  [
    shirt.id,
    detail(shirt, [
      [WHITE, 'белый', '#FFFFFF'],
      [BLACK, 'чёрный', '#000000'],
    ]),
  ],
  [jeans.id, detail(jeans, [[BLUE, 'синий', '#0000FF']])],
]);

function roomItem(
  slot: string,
  product: ReturnType<typeof listItem>,
  attributeValueId: string | null,
  colour: string | null,
) {
  return { slot, product, attributeValueId, colour };
}

function roomOf(...items: ReturnType<typeof roomItem>[]) {
  return {
    items,
    count: items.length,
    sum: items.reduce((sum, item) => sum + item.product.finalPrice, 0),
  };
}

const FILLED = roomOf(
  roomItem('top', shirt, WHITE, 'белый'),
  roomItem('bottom', jeans, BLUE, 'синий'),
);
const EMPTY = roomOf();

function category(id: string, slug: string, slot: string | null, sortOrder: number) {
  return {
    id,
    name: slug,
    slug,
    isActive: true,
    description: null,
    sortOrder,
    slot,
    createdAt: DATE,
    updatedAt: DATE,
  };
}

const CATEGORIES = {
  items: [
    category('a0000000-0000-4000-8000-000000000001', 'shirts', 'top', 1),
    category('a0000000-0000-4000-8000-000000000002', 'more-shirts', 'top', 2),
    category('a0000000-0000-4000-8000-000000000003', 'pants', 'bottom', 3),
    category('a0000000-0000-4000-8000-000000000004', 'coats', 'outerwear', 4),
    category('a0000000-0000-4000-8000-000000000005', 'shoes', 'shoes', 5),
    category('a0000000-0000-4000-8000-000000000006', 'gifts', null, 6),
  ],
  total: 6,
  limit: 100,
  offset: 0,
};

const fetchMock = vi.fn();

interface Api {
  room: unknown;
  // The GET of the room fails with this status.
  roomStatus: number;
  left: number;
  // A PUT /me/fitting-room/:slot answers this.
  change: unknown;
}

let api: Api;

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

function route(url: string, init?: RequestInit) {
  const { pathname } = new URL(url);
  const method = init?.method ?? 'GET';
  if (pathname === '/api/me/fitting-room' && method === 'GET') {
    return api.roomStatus === 200
      ? json(api.room)
      : json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'm', details: [] } }, api.roomStatus);
  }
  if (pathname.startsWith('/api/me/fitting-room') && method === 'DELETE') {
    return Promise.resolve(new Response(null, { status: 204 }));
  }
  if (pathname.startsWith('/api/me/fitting-room/') && method === 'PUT') return json(api.change);
  if (pathname === '/api/me/fitting-quota') {
    return json({
      limit: 20,
      used: 20 - api.left,
      left: api.left,
      renewsAt: '2026-10-31T21:00:00.000Z',
    });
  }
  if (pathname === '/api/categories') return json(CATEGORIES);
  const product = /^\/api\/products\/([^/]+)$/.exec(pathname);
  const found = product?.[1] ? details.get(product[1]) : undefined;
  if (found) return json(found);
  return json({ error: { code: 'NOT_FOUND', message: 'm', details: [] } }, 404);
}

interface Write {
  method: string;
  path: string;
  body: unknown;
}

function writes(): Write[] {
  return fetchMock.mock.calls
    .map(([url, init]) => {
      const request = init as RequestInit | undefined;
      return {
        method: request?.method ?? 'GET',
        path: new URL(String(url)).pathname,
        body: typeof request?.body === 'string' ? JSON.parse(request.body) : undefined,
      };
    })
    .filter((call) => call.method !== 'GET');
}

function stubPhone() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === PHONE_QUERY,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

function renderDrawer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (
    <QueryClientProvider client={client}>
      <FittingRoomDrawer />
    </QueryClientProvider>
  );
  const view = render(ui);
  return { ...view, again: () => view.rerender(ui), client };
}

const setup = () => userEvent.setup({ pointerEventsCheck: 0 });

async function openDrawer() {
  const view = renderDrawer();
  useRoomStore.setState({ open: true });
  return { ...view, dialog: await screen.findByRole('dialog', { name: 'Примерочная' }) };
}

const clicks = () =>
  mocks.track.mock.calls.filter(([name]) => name === 'Element Clicked').map(([, event]) => event);

beforeEach(() => {
  mocks.session = { status: 'signed-in', user: { id: 'u1', email: 'a@b.c', name: null } };
  mocks.pathname = '/catalog';
  mocks.showToast.mockReset();
  mocks.track.mockReset();
  api = {
    room: FILLED,
    roomStatus: 200,
    left: 17,
    change: { room: FILLED, replaced: null },
  };
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string, init?: RequestInit) => route(String(url), init));
  vi.stubGlobal('fetch', fetchMock);
  useRoomStore.setState({ open: false, wishes: null, userId: undefined });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FittingRoomDrawer closed or signed out', () => {
  it('is not in the page while it is closed', () => {
    renderDrawer();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows nothing, and reads nothing, for a visitor even when told to open (AC16)', () => {
    mocks.session = { status: 'signed-out', failed: false };
    renderDrawer();

    useRoomStore.setState({ open: true });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // The categories are public; nothing of the user's is read.
    const paths = fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname);
    expect(paths.filter((path) => path.startsWith('/api/me/'))).toEqual([]);
    expect(paths).not.toContain('/api/categories');
  });

  it('reads no categories for a signed-in user with an empty room', async () => {
    api.room = EMPTY;
    const { dialog } = await openDrawer();
    await within(dialog).findByRole('heading', { name: 'В примерочной пока пусто' });

    const paths = fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname);
    expect(paths).toContain('/api/me/fitting-room');
    expect(paths).not.toContain('/api/categories');
  });

  it('reads the active categories once for an open room with items', async () => {
    const { dialog } = await openDrawer();
    await within(dialog).findByText('Рубашка Annen');

    await waitFor(() =>
      expect(within(dialog).getAllByRole('link', { name: 'Подобрать в каталоге' })).toHaveLength(2),
    );
    const categoryUrls = fetchMock.mock.calls
      .map(([url]) => new URL(String(url)))
      .filter((url) => url.pathname === '/api/categories');
    expect(categoryUrls).toHaveLength(1);
    expect(categoryUrls[0]?.searchParams.get('isActive')).toBe('true');
    expect(categoryUrls[0]?.searchParams.get('limit')).toBe('100');
  });

  it('shows nothing while the session loads', () => {
    mocks.session = { status: 'pending' };
    renderDrawer();
    useRoomStore.setState({ open: true });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens when the store says so, named «Примерочная»', async () => {
    await openDrawer();

    expect(screen.getByRole('dialog', { name: 'Примерочная' })).toBeInTheDocument();
  });

  it('closes with the ×, and the store follows', async () => {
    await openDrawer();

    await setup().click(screen.getByRole('button', { name: 'Закрыть' }));

    await waitFor(() => expect(useRoomStore.getState().open).toBe(false));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes when the page changes, as its links lead away', async () => {
    const { again } = await openDrawer();
    expect(useRoomStore.getState().open).toBe(true);

    mocks.pathname = '/products/p';
    again();

    await waitFor(() => expect(useRoomStore.getState().open).toBe(false));
  });

  it('closes when the session ends', async () => {
    const { again } = await openDrawer();

    mocks.session = { status: 'signed-out', failed: false };
    again();

    await waitFor(() => expect(useRoomStore.getState().open).toBe(false));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('FittingRoomDrawer states', () => {
  it('shows «Загружаем вещи…» with placeholders and a loading «Примерить образ» while the room loads', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      new URL(url).pathname === '/api/me/fitting-room'
        ? new Promise(() => undefined)
        : route(url, init),
    );
    const { dialog } = await openDrawer();

    expect(within(dialog).getByText('Загружаем вещи…')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Примерить образ' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(within(dialog).queryByRole('button', { name: 'Очистить примерочную' })).toBeNull();
  });

  it('shows the error with «Повторить», which reads the room again', async () => {
    api.roomStatus = 503;
    const { dialog } = await openDrawer();
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Сервис временно недоступен, попробуйте позже',
    );
    api.roomStatus = 200;

    await setup().click(within(dialog).getByRole('button', { name: 'Повторить' }));

    expect(await within(dialog).findByText('Рубашка Annen')).toBeInTheDocument();
  });

  it('shows «В примерочной пока пусто» with the catalog link and no footer when the room is empty', async () => {
    api.room = EMPTY;
    const { dialog } = await openDrawer();

    expect(
      await within(dialog).findByRole('heading', { name: 'В примерочной пока пусто' }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Перейти в каталог' })).toHaveAttribute(
      'href',
      '/catalog',
    );
    expect(within(dialog).getByRole('button', { name: 'Примерить образ' })).toBeDisabled();
    expect(within(dialog).queryByRole('button', { name: 'Очистить примерочную' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Всё в корзину' })).toBeNull();
  });
});

describe('FittingRoomDrawer filled (desktop)', () => {
  it('counts the items in the subtitle', async () => {
    const { dialog } = await openDrawer();

    expect(
      await within(dialog).findByText(
        '2 из 5 вещей · по одной в каждом слоте. Образ целиком — одна примерка.',
      ),
    ).toBeInTheDocument();
  });

  it('lists the five slots in order, filled ones with their item and empty ones free', async () => {
    const { dialog } = await openDrawer();
    await within(dialog).findByText('Рубашка Annen');

    const slots = within(dialog)
      .getAllByRole('listitem')
      .map((row) => row.textContent ?? '');
    expect(slots).toHaveLength(5);
    expect(slots[0]).toContain('Верх');
    expect(slots[0]).toContain('Рубашка Annen');
    expect(slots[1]).toContain('Низ');
    expect(slots[1]).toContain('Джинсы Annen');
    expect(slots[2]).toContain('Верхняя одежда');
    expect(slots[2]).toContain('Слот свободен');
    expect(slots[3]).toContain('Обувь');
    expect(slots[4]).toContain('Аксессуар');
    expect(slots[4]).toContain('Слот свободен: сумка, шарф или головной убор');
  });

  it('links empty slots to the first active category with that slot, and the accessory to none', async () => {
    const { dialog } = await openDrawer();
    await within(dialog).findByText('Рубашка Annen');

    await waitFor(() =>
      expect(within(dialog).getAllByRole('link', { name: 'Подобрать в каталоге' })).toHaveLength(2),
    );
    const links = within(dialog).getAllByRole('link', { name: 'Подобрать в каталоге' });
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/catalog/coats',
      '/catalog/shoes',
    ]);
    const accessory = within(dialog).getAllByRole('listitem')[4] as HTMLElement;
    expect(within(accessory).queryByRole('link', { name: 'Подобрать в каталоге' })).toBeNull();
  });

  it('sends room.fill with the slot from «Подобрать в каталоге»', async () => {
    const { dialog } = await openDrawer();
    await waitFor(() =>
      expect(within(dialog).getAllByRole('link', { name: 'Подобрать в каталоге' })).toHaveLength(2),
    );
    const link = within(dialog).getAllByRole('link', { name: 'Подобрать в каталоге' })[1]!;
    link.addEventListener('click', (event) => event.preventDefault());

    await setup().click(link);

    expect(clicks()).toEqual([
      { element: 'room.fill', zone: 'fitting', type: 'navigation', slot: 'shoes' },
    ]);
  });

  it('shows the sum of the look, a live «Примерить образ» and the month’s meter', async () => {
    const { dialog } = await openDrawer();

    expect(await within(dialog).findByText('Сумма образа')).toBeInTheDocument();
    expect(within(dialog).getByText(/9\s000/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Примерить образ' })).toBeEnabled();
    expect(
      await within(dialog).findByText('Осталось 17 примерок в этом месяце'),
    ).toBeInTheDocument();
  });

  it('opens the look’s try-on from «Примерить образ», closing the room, and sends room.try-on with the count (AC14)', async () => {
    useRoomStore.setState({ lookOpen: false });
    const { dialog } = await openDrawer();
    await within(dialog).findByText('Рубашка Annen');

    await setup().click(within(dialog).getByRole('button', { name: 'Примерить образ' }));

    expect(useRoomStore.getState().lookOpen).toBe(true);
    expect(useRoomStore.getState().open).toBe(false);
    expect(clicks()).toEqual([
      { element: 'room.try-on', zone: 'fitting', type: 'interaction', items: 2 },
    ]);
  });

  it('keeps «Примерить образ» off with one item and opens nothing', async () => {
    useRoomStore.setState({ lookOpen: false });
    api.room = roomOf(roomItem('top', shirt, WHITE, 'белый'));
    const { dialog } = await openDrawer();
    await within(dialog).findByText('Рубашка Annen');
    const button = within(dialog).getByRole('button', { name: 'Примерить образ' });

    expect(button).toBeDisabled();
    await setup().click(button);

    expect(useRoomStore.getState().lookOpen).toBe(false);
    expect(clicks()).toEqual([]);
  });

  it('explains the disabled «Примерить образ» with a caption when the room holds one item (A92.4)', async () => {
    api.room = roomOf(roomItem('top', shirt, WHITE, 'белый'));
    const { dialog } = await openDrawer();
    await within(dialog).findByText('Рубашка Annen');

    expect(within(dialog).getByText('Добавьте ещё вещь — образ от двух')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Примерить образ' })).toBeDisabled();
  });

  it('shows no such caption when the room holds two items (A92.4)', async () => {
    const { dialog } = await openDrawer();
    await within(dialog).findByText('Рубашка Annen');

    expect(within(dialog).queryByText('Добавьте ещё вещь — образ от двух')).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Примерить образ' })).toBeEnabled();
  });

  it('answers «Всё в корзину» with the prototype toast and sends room.add-to-cart-all with the count', async () => {
    const { dialog } = await openDrawer();
    await within(dialog).findByText('Рубашка Annen');

    await setup().click(within(dialog).getByRole('button', { name: 'Всё в корзину' }));

    expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith({
      title: 'В прототипе нет корзины и избранного',
    });
    expect(clicks()).toEqual([
      { element: 'room.add-to-cart-all', zone: 'fitting', type: 'interaction', items: 2 },
    ]);
  });

  it('takes an item out with «Убрать»: deletes its slot, tells so with «Вернуть» and sends room.remove', async () => {
    const { dialog } = await openDrawer();
    await within(dialog).findByText('Рубашка Annen');

    await setup().click(within(dialog).getAllByRole('button', { name: 'Убрать' })[0]!);

    await waitFor(() => expect(within(dialog).queryByText('Рубашка Annen')).toBeNull());
    expect(writes()).toEqual([
      { method: 'DELETE', path: '/api/me/fitting-room/top', body: undefined },
    ]);
    expect(mocks.showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Убрали «Рубашка Annen» из примерочной',
        actionLabel: 'Вернуть',
      }),
    );
    expect(clicks()).toEqual([
      { element: 'room.remove', zone: 'fitting', type: 'interaction', slot: 'top' },
    ]);
    expect(
      await within(dialog).findByText(
        '1 из 5 вещей · по одной в каждом слоте. Образ целиком — одна примерка.',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Сумма образа').nextElementSibling).toHaveTextContent(
      /^4\s000/,
    );
  });

  it('empties the room with «Очистить примерочную» and shows the empty state', async () => {
    const { dialog } = await openDrawer();
    await within(dialog).findByText('Рубашка Annen');

    await setup().click(within(dialog).getByRole('button', { name: 'Очистить примерочную' }));

    expect(
      await within(dialog).findByRole('heading', { name: 'В примерочной пока пусто' }),
    ).toBeInTheDocument();
    expect(writes()).toEqual([{ method: 'DELETE', path: '/api/me/fitting-room', body: undefined }]);
    expect(clicks()).toEqual([
      { element: 'room.clear', zone: 'fitting', type: 'interaction', items: 2 },
    ]);
  });

  it('shows the error toast and keeps the items when a removal fails', async () => {
    const { dialog } = await openDrawer();
    await within(dialog).findByText('Рубашка Annen');
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === 'DELETE'
        ? json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'm', details: [] } }, 503)
        : route(url, init),
    );

    await setup().click(within(dialog).getAllByRole('button', { name: 'Убрать' })[0]!);

    await waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'error' })),
    );
    expect(within(dialog).getByText('Рубашка Annen')).toBeInTheDocument();
  });

  it('puts the item in another colour from the select, silently', async () => {
    api.change = {
      room: roomOf(
        roomItem('top', shirt, BLACK, 'чёрный'),
        roomItem('bottom', jeans, BLUE, 'синий'),
      ),
      replaced: roomItem('top', shirt, WHITE, 'белый'),
    };
    const { dialog } = await openDrawer();
    const colour = await within(dialog).findByRole('combobox', { name: 'Цвет: Рубашка Annen' });
    await waitFor(() => expect(colour).toBeEnabled());
    const user = setup();

    await user.click(colour);
    await user.click(await screen.findByRole('option', { name: 'Чёрный' }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({
      method: 'PUT',
      path: '/api/me/fitting-room/top',
      body: { productId: shirt.id, attributeValueId: BLACK },
    });
    expect(mocks.showToast).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        within(dialog).getByRole('combobox', { name: 'Цвет: Рубашка Annen' }),
      ).toHaveTextContent('Чёрный'),
    );
  });

  it('offers a value with no swatch as a colour, and no value of another attribute (A91)', async () => {
    const original = details.get(jeans.id)!;
    details.set(jeans.id, {
      ...original,
      attributes: [
        {
          attribute: { id: COLOUR_ATTRIBUTE, name: 'Цвет' },
          values: [
            { id: BLUE, value: 'синий', colorHex: '#0000FF' },
            { id: SIZE_ID, value: 'в полоску', colorHex: null },
          ],
        },
        {
          attribute: { id: BRAND, name: 'Сезон' },
          values: [{ id: WHITE, value: 'демисезон', colorHex: null }],
        },
      ],
    });
    try {
      const { dialog } = await openDrawer();
      const colour = await within(dialog).findByRole('combobox', { name: 'Цвет: Джинсы Annen' });
      await waitFor(() => expect(colour).toBeEnabled());
      const user = setup();

      await user.click(colour);

      const options = within(await screen.findByRole('listbox')).getAllByRole('option');
      expect(options.map((option) => option.textContent)).toEqual(['Синий', 'В полоску']);
    } finally {
      details.set(jeans.id, original);
    }
  });

  it('turns the colour select off for a product with one colour', async () => {
    const { dialog } = await openDrawer();
    const colour = await within(dialog).findByRole('combobox', { name: 'Цвет: Джинсы Annen' });

    await waitFor(() => expect(colour).toBeDisabled());
  });

  it('offers the product’s sizes in the size stub and sends nothing', async () => {
    const { dialog } = await openDrawer();
    const size = await within(dialog).findByRole('combobox', { name: 'Размер: Рубашка Annen' });
    await waitFor(() => expect(size).toBeEnabled());
    const user = setup();

    await user.click(size);
    const options = within(await screen.findByRole('listbox')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['S', 'M']);
    await user.click(options[1]!);

    await waitFor(() => expect(size).toHaveTextContent('M'));
    expect(writes()).toEqual([]);
  });

  it('answers a row’s «В корзину» with the prototype toast', async () => {
    const { dialog } = await openDrawer();
    await within(dialog).findByText('Рубашка Annen');

    await setup().click(within(dialog).getAllByRole('button', { name: 'В корзину' })[0]!);

    expect(mocks.showToast).toHaveBeenCalledWith({ title: 'В прототипе нет корзины и избранного' });
  });

  it('links the photo and the name of an item to its page', async () => {
    const { dialog } = await openDrawer();

    expect(await within(dialog).findByRole('link', { name: 'Рубашка Annen' })).toHaveAttribute(
      'href',
      `/products/${shirt.id}`,
    );
  });
});

describe('FittingRoomDrawer wishes (A16, A90.5)', () => {
  it('is a labelled field in an mp-block with a counter and a 200 limit', async () => {
    const { dialog } = await openDrawer();

    const field = await within(dialog).findByRole('textbox', { name: /Пожелания к образу/ });
    expect(field.closest('.mp-block')).not.toBeNull();
    expect(field).toHaveAttribute('maxlength', '200');
    expect(within(dialog).getByText('0 / 200')).toBeInTheDocument();
  });

  it('counts what is typed and keeps it in the store for this user', async () => {
    const { dialog } = await openDrawer();
    const field = await within(dialog).findByRole('textbox', { name: /Пожелания к образу/ });

    await setup().type(field, 'тренч на плечи');

    expect(field).toHaveValue('тренч на плечи');
    expect(within(dialog).getByText('14 / 200')).toBeInTheDocument();
    expect(useRoomStore.getState().wishes).toEqual({ userId: 'u1', text: 'тренч на плечи' });
  });

  it('shows the text written before, and never in an attribute', async () => {
    useRoomStore.setState({ wishes: { userId: 'u1', text: 'сапоги вместо туфель' } });
    const { dialog } = await openDrawer();

    const field = await within(dialog).findByRole('textbox', { name: /Пожелания к образу/ });
    expect(field).toHaveValue('сапоги вместо туфель');
    for (const element of dialog.querySelectorAll('*')) {
      for (const attribute of element.getAttributeNames()) {
        expect(element.getAttribute(attribute)).not.toContain('сапоги');
      }
    }
  });

  it('is empty for another user signed in at the same tab', async () => {
    useRoomStore.setState({ wishes: { userId: 'someone-else', text: 'чужое' } });
    const { dialog } = await openDrawer();

    const field = await within(dialog).findByRole('textbox', { name: /Пожелания к образу/ });
    expect(field).toHaveValue('');
  });

  it('is not shown with an empty room', async () => {
    api.room = EMPTY;
    const { dialog } = await openDrawer();
    await within(dialog).findByRole('heading', { name: 'В примерочной пока пусто' });

    expect(within(dialog).queryByRole('textbox')).toBeNull();
  });
});

// A link to the page the drawer is on changes no path, so the drawer closes by its own click.
function keepPage(link: HTMLElement) {
  link.addEventListener('click', (event) => event.preventDefault());
  return link;
}

describe('FittingRoomDrawer links close it even to the current page', () => {
  it('closes from «Перейти в каталог» of an empty room', async () => {
    api.room = EMPTY;
    const { dialog } = await openDrawer();
    const link = keepPage(await within(dialog).findByRole('link', { name: 'Перейти в каталог' }));

    await setup().click(link);

    await waitFor(() => expect(useRoomStore.getState().open).toBe(false));
  });

  it('closes from «Подобрать в каталоге», after sending room.fill', async () => {
    const { dialog } = await openDrawer();
    await waitFor(() =>
      expect(within(dialog).getAllByRole('link', { name: 'Подобрать в каталоге' })).toHaveLength(2),
    );

    await setup().click(
      keepPage(within(dialog).getAllByRole('link', { name: 'Подобрать в каталоге' })[0]!),
    );

    await waitFor(() => expect(useRoomStore.getState().open).toBe(false));
    expect(clicks()).toEqual([
      { element: 'room.fill', zone: 'fitting', type: 'navigation', slot: 'outerwear' },
    ]);
  });

  it('closes from the name of an item', async () => {
    const { dialog } = await openDrawer();
    const link = keepPage(await within(dialog).findByRole('link', { name: 'Рубашка Annen' }));

    await setup().click(link);

    await waitFor(() => expect(useRoomStore.getState().open).toBe(false));
  });

  it('closes from the photo of an item', async () => {
    const { dialog } = await openDrawer();
    await within(dialog).findByText('Рубашка Annen');
    const photo = dialog.querySelector<HTMLAnchorElement>(
      `a[aria-hidden="true"][href="/products/${shirt.id}"]`,
    );
    expect(photo).not.toBeNull();

    await setup().click(keepPage(photo!));

    await waitFor(() => expect(useRoomStore.getState().open).toBe(false));
  });

  it('stays open when something else is clicked', async () => {
    const { dialog } = await openDrawer();
    await within(dialog).findByText('Рубашка Annen');

    await setup().click(within(dialog).getByText('Сумма образа'));

    expect(useRoomStore.getState().open).toBe(true);
  });
});

describe('FittingRoomDrawer item without a put colour (a card’s hanger)', () => {
  const NO_COLOUR = roomOf(
    roomItem('top', shirt, null, null),
    roomItem('bottom', jeans, null, null),
  );

  beforeEach(() => {
    api.room = NO_COLOUR;
  });

  it('shows the only colour of a product in the select, not the placeholder', async () => {
    const { dialog } = await openDrawer();

    const select = await within(dialog).findByRole('combobox', { name: 'Цвет: Джинсы Annen' });
    await waitFor(() => expect(select).toHaveTextContent('Синий'));
    expect(select).not.toHaveTextContent(/^Цвет$/);
    expect(writes()).toEqual([]);
  });

  it('keeps the placeholder for a product with several colours and none put', async () => {
    const { dialog } = await openDrawer();

    const select = await within(dialog).findByRole('combobox', { name: 'Цвет: Рубашка Annen' });
    await waitFor(() => expect(select).toBeEnabled());
    expect(select).toHaveTextContent('Цвет');
    expect(select).not.toHaveTextContent('Белый');
  });

  it('names the only colour in the phone field, starts the sheet with it pressed and sends no PUT', async () => {
    stubPhone();
    const { dialog } = await openDrawer();
    const user = setup();
    const field = await within(dialog).findByRole('button', {
      name: 'Цвет и размер: Джинсы Annen',
    });
    await waitFor(() => expect(field).toHaveTextContent('Синий'));

    await user.click(field);
    const sheet = await screen.findByRole('dialog', { name: 'Цвет «Джинсы Annen»' });
    expect(await within(sheet).findByRole('button', { name: 'Синий' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Цвет «Джинсы Annen»' })).toBeNull(),
    );
    expect(writes()).toEqual([]);
  });

  it('puts another colour of a product with several from the phone sheet', async () => {
    stubPhone();
    api.change = { room: FILLED, replaced: null };
    const { dialog } = await openDrawer();
    const user = setup();

    await user.click(
      await within(dialog).findByRole('button', { name: 'Цвет и размер: Рубашка Annen' }),
    );
    const sheet = await screen.findByRole('dialog', { name: 'Цвет «Рубашка Annen»' });
    expect(await within(sheet).findByRole('button', { name: 'Белый' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await user.click(within(sheet).getByRole('button', { name: 'Белый' }));
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]?.body).toEqual({ productId: shirt.id, attributeValueId: WHITE });
  });
});

describe('FittingRoomDrawer wishes across closing', () => {
  it('keeps the text when the drawer is closed and opened again', async () => {
    const { dialog } = await openDrawer();
    const field = await within(dialog).findByRole('textbox', { name: /Пожелания к образу/ });
    await setup().type(field, 'шарф потеплее');

    useRoomStore.setState({ open: false });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    useRoomStore.setState({ open: true });

    const again = await screen.findByRole('dialog', { name: 'Примерочная' });
    expect(await within(again).findByRole('textbox', { name: /Пожелания к образу/ })).toHaveValue(
      'шарф потеплее',
    );
  });

  it('shows nothing of them to another user who signs in at the same tab', async () => {
    const { dialog, unmount } = await openDrawer();
    const field = await within(dialog).findByRole('textbox', { name: /Пожелания к образу/ });
    await setup().type(field, 'шарф потеплее');

    unmount();
    mocks.session = { status: 'signed-in', user: { id: 'u2', email: 'x@y.z', name: null } };
    renderDrawer();

    const other = await screen.findByRole('textbox', { name: /Пожелания к образу/ });
    expect(other).toHaveValue('');
  });
});

describe('FittingRoomDrawer tells the store who is signed in (spec 0017 U22)', () => {
  it('sets the signed-in user', async () => {
    renderDrawer();

    await waitFor(() => expect(useRoomStore.getState().userId).toBe('u1'));
  });

  it('leaves the store alone while the session loads', () => {
    mocks.session = { status: 'pending' };
    renderDrawer();

    expect(useRoomStore.getState().userId).toBeUndefined();
  });

  it('sets nobody for a visitor', async () => {
    mocks.session = { status: 'signed-out', failed: false };
    renderDrawer();

    await waitFor(() => expect(useRoomStore.getState().userId).toBeNull());
  });

  it('forgets the wishes when the session ends', async () => {
    const { again } = renderDrawer();
    await waitFor(() => expect(useRoomStore.getState().userId).toBe('u1'));
    useRoomStore.getState().setWishes('u1', 'шарф потеплее');

    mocks.session = { status: 'signed-out', failed: false };
    again();

    await waitFor(() => expect(useRoomStore.getState().wishes).toBeNull());
    expect(useRoomStore.getState().userId).toBeNull();
  });

  it('calls it again with another user, who loses the first one’s wishes', async () => {
    const { again } = renderDrawer();
    await waitFor(() => expect(useRoomStore.getState().userId).toBe('u1'));
    useRoomStore.getState().setWishes('u1', 'шарф потеплее');

    mocks.session = { status: 'signed-in', user: { id: 'u2', email: 'x@y.z', name: null } };
    again();

    await waitFor(() => expect(useRoomStore.getState().userId).toBe('u2'));
    expect(useRoomStore.getState().wishes).toBeNull();
  });

  it('keeps the wishes of the same user across a rerender', async () => {
    const { again } = renderDrawer();
    await waitFor(() => expect(useRoomStore.getState().userId).toBe('u1'));
    useRoomStore.getState().setWishes('u1', 'шарф потеплее');

    again();

    expect(useRoomStore.getState().wishes).toEqual({ userId: 'u1', text: 'шарф потеплее' });
  });
});

describe('FittingRoomDrawer «Вернуть» after a removal', () => {
  it('puts the item back with its slot and colour though the room changed meanwhile', async () => {
    const { dialog } = await openDrawer();
    await within(dialog).findByText('Рубашка Annen');
    const user = setup();

    await user.click(within(dialog).getAllByRole('button', { name: 'Убрать' })[0]!);
    await waitFor(() => expect(within(dialog).queryByText('Рубашка Annen')).toBeNull());
    await user.click(within(dialog).getByRole('button', { name: 'Убрать' }));
    await within(dialog).findByRole('heading', { name: 'В примерочной пока пусто' });
    const undo = mocks.showToast.mock.calls
      .map(([toast]) => toast as { actionLabel?: string; onAction?: () => void })
      .find((toast) => toast.actionLabel === 'Вернуть');
    expect(undo).toBeDefined();
    api.change = { room: roomOf(roomItem('top', shirt, WHITE, 'белый')), replaced: null };

    undo!.onAction!();

    await waitFor(() => expect(writes().filter((call) => call.method === 'PUT')).toHaveLength(1));
    expect(writes().find((call) => call.method === 'PUT')).toEqual({
      method: 'PUT',
      path: '/api/me/fitting-room/top',
      body: { productId: shirt.id, attributeValueId: WHITE },
    });
    expect(await within(dialog).findByText('Рубашка Annen')).toBeInTheDocument();
    expect(clicks()).toContainEqual({
      element: 'room.undo',
      zone: 'fitting',
      type: 'interaction',
      slot: 'top',
      action: 'remove',
    });
  });
});

describe('FittingRoomDrawer on a phone (board 2.1–2.3)', () => {
  beforeEach(() => {
    stubPhone();
  });

  it('has «‹» to close and no ×', async () => {
    const { dialog } = await openDrawer();

    expect(within(dialog).queryByRole('button', { name: 'Закрыть' })).toBeNull();
    await setup().click(within(dialog).getByRole('button', { name: 'Закрыть примерочную' }));

    await waitFor(() => expect(useRoomStore.getState().open).toBe(false));
  });

  it('says «Пока пусто» with the five cells when the room is empty', async () => {
    api.room = EMPTY;
    const { dialog } = await openDrawer();

    expect(await within(dialog).findByRole('heading', { name: 'Пока пусто' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Перейти в каталог' })).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Добавляйте вещи кнопкой «Добавить к образу» — до пяти/),
    ).toBeInTheDocument();
    expect(dialog.querySelectorAll('ul[aria-hidden="true"] li')).toHaveLength(5);
  });

  it('shortens the subtitle and the sum caption', async () => {
    const { dialog } = await openDrawer();

    expect(
      await within(dialog).findByText('2 из 5 · образ целиком — одна примерка'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Сумма образа · 2 вещи')).toBeInTheDocument();
  });

  it('keeps «Очистить примерочную» in the «…» menu and not in the footer', async () => {
    const { dialog } = await openDrawer();
    await within(dialog).findByText('Рубашка Annen');
    expect(within(dialog).queryByRole('button', { name: 'Очистить примерочную' })).toBeNull();
    const user = setup();

    await user.click(within(dialog).getByRole('button', { name: 'Ещё' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Очистить примерочную' }));

    expect(await within(dialog).findByRole('heading', { name: 'Пока пусто' })).toBeInTheDocument();
    expect(writes()).toEqual([{ method: 'DELETE', path: '/api/me/fitting-room', body: undefined }]);
    expect(clicks()).toContainEqual({
      element: 'room.clear',
      zone: 'fitting',
      type: 'interaction',
      items: 2,
    });
  });

  it('takes an item out with the ×', async () => {
    const { dialog } = await openDrawer();
    await within(dialog).findByText('Рубашка Annen');

    await setup().click(within(dialog).getByRole('button', { name: 'Убрать «Рубашка Annen»' }));

    await waitFor(() =>
      expect(writes()).toEqual([
        { method: 'DELETE', path: '/api/me/fitting-room/top', body: undefined },
      ]),
    );
  });

  it('changes the colour in the sheet with «Готово»', async () => {
    api.change = {
      room: roomOf(
        roomItem('top', shirt, BLACK, 'чёрный'),
        roomItem('bottom', jeans, BLUE, 'синий'),
      ),
      replaced: roomItem('top', shirt, WHITE, 'белый'),
    };
    const { dialog } = await openDrawer();
    await within(dialog).findByText('Рубашка Annen');
    const user = setup();

    await user.click(
      await within(dialog).findByRole('button', { name: 'Цвет и размер: Рубашка Annen' }),
    );
    const sheet = await screen.findByRole('dialog', { name: 'Цвет «Рубашка Annen»' });
    await user.click(await within(sheet).findByRole('button', { name: 'Чёрный' }));
    expect(writes()).toEqual([]);
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({
      method: 'PUT',
      path: '/api/me/fitting-room/top',
      body: { productId: shirt.id, attributeValueId: BLACK },
    });
  });
});
