import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Fitting } from '@/entities/fitting';
import { useRoomStore } from '@/entities/fitting-room';
import type { SessionState } from '@/entities/session';
import { FITTINGS_HREF, PHONE_QUERY } from '@/shared/config';

const mocks = vi.hoisted(() => ({
  track: vi.fn(),
  captureException: vi.fn(),
  session: { status: 'pending' } as SessionState,
}));

vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  reset: vi.fn(),
  track: mocks.track,
}));
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }));
vi.mock('@/entities/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/session')>()),
  useSession: () => mocks.session,
}));

import { TryOn } from './try-on';

const USER = 'user-look';
const BRAND = '00000000-0000-4000-8000-0000000000b1';
const SHIRT = '00000000-0000-4000-8000-0000000000a1';
const JEANS = '00000000-0000-4000-8000-0000000000a2';
const SNEAKERS = '00000000-0000-4000-8000-0000000000a3';
const WHITE = '00000000-0000-4000-8000-0000000000c1';
const BLACK = '00000000-0000-4000-8000-0000000000c2';
const BLUE = '00000000-0000-4000-8000-0000000000c3';
const PHOTO_A = '00000000-0000-4000-8000-0000000000f1';
const PHOTO_B = '00000000-0000-4000-8000-0000000000f2';
const RESULT = '00000000-0000-4000-8000-0000000000e1';
const NEXT = '00000000-0000-4000-8000-0000000000e2';
const EARLIER = '00000000-0000-4000-8000-0000000000e3';
const DATE = '2026-10-20T12:00:00.000Z';
const RESULT_URL = 'https://s3.test/keep/users/u/result.webp?X-Amz-Signature=abc';

const fetchMock = vi.fn();

function listItem(id: string, name: string, finalPrice: number) {
  return {
    id,
    article: `A-${name}`,
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

const shirt = listItem(SHIRT, 'Рубашка', 5000);
const jeans = listItem(JEANS, 'Джинсы', 4000);
const sneakers = listItem(SNEAKERS, 'Кеды', 3000);

function detail(base: ReturnType<typeof listItem>, colours: [string, string, string][]) {
  return {
    ...base,
    description: null,
    images: [],
    variations: [{ id: BRAND, size: 'M', stock: 2 }],
    attributes:
      colours.length === 0
        ? []
        : [
            {
              attribute: { id: BRAND, name: 'Цвет' },
              values: colours.map(([id, value, colorHex]) => ({ id, value, colorHex })),
            },
          ],
  };
}

const details = new Map([
  [
    SHIRT,
    detail(shirt, [
      [WHITE, 'Белый', '#FFFFFF'],
      [BLACK, 'Чёрный', '#000000'],
    ]),
  ],
  [JEANS, detail(jeans, [[BLUE, 'Синий', '#0000FF']])],
  [SNEAKERS, detail(sneakers, [])],
]);

const ROOM = {
  items: [
    { slot: 'top', product: shirt, attributeValueId: WHITE, colour: 'Белый' },
    { slot: 'bottom', product: jeans, attributeValueId: BLUE, colour: 'Синий' },
    { slot: 'shoes', product: sneakers, attributeValueId: null, colour: null },
  ],
  count: 3,
  sum: 12000,
};

function lookItem(
  product: ReturnType<typeof listItem>,
  slot: 'top' | 'bottom' | 'shoes',
  attributeValueId: string | null,
  colour: string | null,
) {
  return {
    productId: product.id,
    name: product.name,
    brand: 'Annen',
    imageUrl: null,
    price: product.price,
    finalPrice: product.finalPrice,
    attributeValueId,
    colour,
    slot,
  };
}

const IN_SLOT_ORDER = [
  lookItem(shirt, 'top', WHITE, 'Белый'),
  lookItem(jeans, 'bottom', BLUE, 'Синий'),
  lookItem(sneakers, 'shoes', null, null),
];

function look(patch: Partial<Fitting> = {}): Fitting {
  return {
    id: RESULT,
    kind: 'look',
    parentId: null,
    status: 'completed',
    stage: 'done',
    failureCode: null,
    countsAgainstLimit: true,
    regenerationFree: true,
    model: 'gpt-image-2',
    items: IN_SLOT_ORDER,
    promptText: 'шарф поверх',
    photoId: PHOTO_A,
    resultUrl: RESULT_URL,
    createdAt: DATE,
    startedAt: DATE,
    finishedAt: DATE,
    estimatedSeconds: null,
    ...patch,
  };
}

function running(patch: Partial<Fitting> = {}): Fitting {
  return look({
    id: NEXT,
    status: 'pending',
    stage: 'queued',
    resultUrl: null,
    startedAt: null,
    finishedAt: null,
    estimatedSeconds: 20,
    createdAt: new Date().toISOString(),
    ...patch,
  });
}

function photo(id: string, patch: Record<string, unknown> = {}) {
  return {
    id,
    url: `https://s3.test/keep/users/u/${id}.webp?X-Amz-Signature=abc`,
    isDefault: false,
    transient: false,
    width: 768,
    height: 1024,
    createdAt: DATE,
    ...patch,
  };
}

interface Api {
  photos: unknown[];
  quota: { limit: number; used: number; left: number; renewsAt: string };
  room: unknown;
  fittings: Map<string, Fitting>;
  // What POST /fittings answers.
  started: () => Response;
}

let api: Api;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

function failure(status: number, code: string) {
  return json(status, { error: { code, message: 'm', details: [] } });
}

function route(url: string, init?: RequestInit): Response {
  const { pathname } = new URL(url);
  const method = init?.method ?? 'GET';
  if (pathname === '/api/me' && method === 'GET') {
    return json(200, {
      id: '00000000-0000-4000-8000-000000000001',
      phone: null,
      email: 'a@example.com',
      firstName: null,
      lastName: null,
      patronymic: null,
      dateOfBirth: null,
      gender: null,
      fittingProfileImageKey: null,
      fittingProfileImageUrl: null,
      photoConsentVersion: 1,
      createdAt: DATE,
      updatedAt: DATE,
    });
  }
  if (pathname === '/api/me/photos' && method === 'GET') return json(200, api.photos);
  if (pathname.startsWith('/api/me/photos/transient/')) return new Response(null, { status: 204 });
  if (pathname === '/api/me/fitting-quota') return json(200, api.quota);
  if (pathname === '/api/me/fitting-room' && method === 'GET') return json(200, api.room);
  if (pathname === '/api/categories') {
    return json(200, { items: [], total: 0, limit: 100, offset: 0 });
  }
  const product = /^\/api\/products\/([^/]+)$/.exec(pathname);
  const found = product?.[1] ? details.get(product[1]) : undefined;
  if (found) return json(200, found);
  if (pathname === '/api/fittings' && method === 'POST') return api.started();
  if (pathname === '/api/fittings') {
    return json(200, { items: [...api.fittings.values()], nextCursor: null, total: 0 });
  }
  const regenerate = /^\/api\/fittings\/([^/]+)\/regenerate$/.exec(pathname);
  if (regenerate && method === 'POST') return api.started();
  const one = /^\/api\/fittings\/([^/]+)$/.exec(pathname);
  const fitting = one?.[1] ? api.fittings.get(one[1]) : undefined;
  if (fitting) return json(200, fitting);
  return failure(404, 'NOT_FOUND');
}

function posts() {
  return fetchMock.mock.calls
    .map(([url, init]) => ({ path: new URL(String(url)).pathname, init: init as RequestInit }))
    .filter(({ init }) => init?.method === 'POST');
}

function bodyOf(index: number) {
  return JSON.parse(String(posts()[index]?.init.body));
}

function renderTryOn(props: { look?: boolean; fittingId?: string } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = vi.fn();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <TryOn {...props} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose, ...view };
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

// Base UI turns pointer events off on the page while a modal is open.
const setup = () => userEvent.setup({ pointerEventsCheck: 0 });
const start = () => screen.getByRole('button', { name: 'Примерить образ' });
const limitHeading = () =>
  screen.findByRole('heading', { name: 'Примерки на этот месяц закончились' });

function showResult(fitting: Fitting = look()) {
  api.fittings.set(fitting.id, fitting);
}

// The row of an item in «Вещи образа»: its name link's list item.
async function rowOf(name: string) {
  const link = await screen.findByRole('link', { name });
  return link.closest('li') as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  api = {
    photos: [photo(PHOTO_A), photo(PHOTO_B, { isDefault: true })],
    quota: { limit: 20, used: 3, left: 17, renewsAt: '2026-10-31T21:00:00.000Z' },
    room: ROOM,
    fittings: new Map(),
    started: () => json(201, { ...running(), repeated: false }),
  };
  useRoomStore.setState({ open: false, lookOpen: false, wishes: null, userId: undefined });
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string, init?: RequestInit) =>
    Promise.resolve(route(String(url), init)),
  );
  vi.stubGlobal('fetch', fetchMock);
  mocks.session = { status: 'signed-in', user: { id: USER, email: 'a@example.com', name: 'A' } };
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('TryOn of a look: the picker (board 3.2)', () => {
  it('is «Примерка образа» with the room’s strip, count, sum, «Изменить» and the look’s meter', async () => {
    renderTryOn({ look: true });

    expect(await screen.findByRole('dialog', { name: 'Примерка образа' })).toBeInTheDocument();
    expect(await screen.findByText('Образ · 3 вещи')).toBeInTheDocument();
    expect(screen.getByText(/12\s000/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Изменить' })).toBeInTheDocument();
    expect(await screen.findByText('Образ целиком — 1 примерка · осталось 17')).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'Ваше фото' })).toHaveAttribute(
      'src',
      expect.stringContaining(PHOTO_B),
    );
  });

  it('lists every item of the look as a card with its name, colour and price, no strip (AC11)', async () => {
    renderTryOn({ look: true });
    await screen.findByText('Образ · 3 вещи');

    const names = ['Рубашка', 'Джинсы', 'Кеды'];
    const colours = ['Белый', 'Синий', null];
    const prices = [/5\s000/, /4\s000/, /3\s000/];
    names.forEach((name, index) => {
      const card = screen.getByText(name).closest('li') as HTMLElement;
      expect(card).toHaveTextContent(prices[index]!);
      const colour = colours[index];
      if (colour) expect(within(card).getByText(colour)).toBeInTheDocument();
      expect(within(card).getByRole('button', { name: 'В корзину' })).toBeEnabled();
      expect(within(card).getByRole('button', { name: 'В избранное' })).toBeInTheDocument();
    });
    expect(screen.getAllByRole('button', { name: 'В избранное' })).toHaveLength(3);
  });

  it('tracks each look item’s heart as try-on.favourite of kind look', async () => {
    const user = setup();
    renderTryOn({ look: true });
    await screen.findByText('Образ · 3 вещи');

    const card = screen.getByText('Джинсы').closest('li') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'В избранное' }));

    expect(mocks.track).toHaveBeenCalledWith(
      'Element Clicked',
      expect.objectContaining({ element: 'try-on.favourite', kind: 'look' }),
    );
  });

  it('has no subtitle about an approximate picture (AC10)', async () => {
    renderTryOn({ look: true });
    await screen.findByText('Образ · 3 вещи');

    expect(screen.queryByText(/Изображение приблизительное/)).not.toBeInTheDocument();
  });

  it('closes the window and opens the fitting room from «Изменить»', async () => {
    const user = setup();
    const { onClose } = renderTryOn({ look: true });

    await user.click(await screen.findByRole('button', { name: 'Изменить' }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(useRoomStore.getState().open).toBe(true);
  });

  it('starts the look with the default photo, the room’s items in their colours and no wishes (AC14)', async () => {
    const user = setup();
    renderTryOn({ look: true });
    await screen.findByRole('img', { name: 'Ваше фото' });
    await vi.waitFor(() => expect(start()).toBeEnabled());

    await user.click(start());

    expect(await screen.findByText('Примеряем…')).toBeInTheDocument();
    expect(posts()).toHaveLength(1);
    expect(posts()[0]?.path).toBe('/api/fittings');
    expect(bodyOf(0)).toEqual({
      photoId: PHOTO_B,
      kind: 'look',
      items: [
        { productId: SHIRT, attributeValueId: WHITE },
        { productId: JEANS, attributeValueId: BLUE },
        { productId: SNEAKERS },
      ],
    });
    expect(mocks.track).toHaveBeenCalledWith(
      'Fitting Started',
      expect.objectContaining({ kind: 'look', source: 'picker', with_prompt: false }),
    );
  });

  it('starts one look for a double click while the first start is in flight (AC12)', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? new Promise<Response>(() => undefined)
        : Promise.resolve(route(String(url), init)),
    );
    const user = setup();
    renderTryOn({ look: true });
    await vi.waitFor(() => expect(start()).toBeEnabled());

    await user.dblClick(start());

    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]?.path).toBe('/api/fittings');
  });

  it('names the look, not an item, on the wait', async () => {
    const user = setup();
    renderTryOn({ look: true });
    await vi.waitFor(() => expect(start()).toBeEnabled());

    await user.click(start());

    expect(await screen.findByText('Надеваем образ')).toBeInTheDocument();
  });

  it('sends the room’s wishes of the signed-in user, trimmed', async () => {
    useRoomStore.setState({ wishes: { userId: USER, text: '  без шарфа ' } });
    const user = setup();
    renderTryOn({ look: true });
    await vi.waitFor(() => expect(start()).toBeEnabled());

    await user.click(start());

    await screen.findByText('Примеряем…');
    expect(bodyOf(0).promptText).toBe('без шарфа');
    expect(mocks.track).toHaveBeenCalledWith(
      'Fitting Started',
      expect.objectContaining({ with_prompt: true }),
    );
  });

  it('sends nothing of another user’s wishes', async () => {
    useRoomStore.setState({ wishes: { userId: 'someone-else', text: 'чужое' } });
    const user = setup();
    renderTryOn({ look: true });
    await vi.waitFor(() => expect(start()).toBeEnabled());

    await user.click(start());

    await screen.findByText('Примеряем…');
    expect(bodyOf(0)).not.toHaveProperty('promptText');
  });

  it('keeps «Примерить образ» off with one item in the room and sends nothing', async () => {
    api.room = { items: ROOM.items.slice(0, 1), count: 1, sum: 5000 };
    const user = setup();
    renderTryOn({ look: true });
    await screen.findByText('Образ · 1 вещь');

    expect(start()).toBeDisabled();
    await user.click(start());
    expect(posts()).toHaveLength(0);
  });

  it('keeps «Примерить образ» off while there is no photo', async () => {
    api.photos = [];
    renderTryOn({ look: true });

    await screen.findByText('Образ · 3 вещи');
    expect(start()).toBeDisabled();
  });

  it('shows the limit card when the api refuses at the limit and tracks the refusal of a look', async () => {
    api.started = () => failure(409, 'LIMIT_REACHED');
    const user = setup();
    renderTryOn({ look: true });
    await vi.waitFor(() => expect(start()).toBeEnabled());

    await user.click(start());

    expect(await limitHeading()).toBeInTheDocument();
    expect(mocks.track).toHaveBeenCalledWith('Fitting Refused', {
      kind: 'look',
      reason: 'limit_reached',
    });
  });

  it('shows the limit card at once when none are left, without a start', async () => {
    api.quota = { ...api.quota, used: 20, left: 0 };
    renderTryOn({ look: true });

    expect(await limitHeading()).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it('shows another failure under the picker and lets it be tried again', async () => {
    api.started = () => failure(503, 'SERVICE_UNAVAILABLE');
    const user = setup();
    renderTryOn({ look: true });
    await vi.waitFor(() => expect(start()).toBeEnabled());

    await user.click(start());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Сервис временно недоступен, попробуйте позже',
    );
    expect(start()).toBeEnabled();
  });

  it('shows the room’s failure with «Повторить» that reads it again', async () => {
    let reads = 0;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (new URL(String(url)).pathname === '/api/me/fitting-room') {
        reads += 1;
        return Promise.resolve(failure(503, 'SERVICE_UNAVAILABLE'));
      }
      return Promise.resolve(route(String(url), init));
    });
    const user = setup();
    renderTryOn({ look: true });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Сервис временно недоступен, попробуйте позже',
    );
    expect(screen.queryByRole('button', { name: 'Примерить образ' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Повторить' }));

    await vi.waitFor(() => expect(reads).toBe(2));
  });
});

describe('TryOn of a look: the result (board 8, AC14)', () => {
  it('opens a look of the history as «Примерка образа» with the date and the three tiles (AC13)', async () => {
    showResult();
    renderTryOn({ fittingId: RESULT });

    await screen.findByText(
      (_, element) =>
        element?.tagName === 'P' && element.textContent === '3 вещи · 20 октября, 15:00',
    );
    expect(screen.queryByText(/сохранено в истории/)).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    const note = screen.getByText(
      (_, element) =>
        element?.tagName === 'P' && element.textContent === 'Сохранено в «Мои примерки»',
    );
    expect(within(note).getByRole('link', { name: '«Мои примерки»' })).toHaveAttribute(
      'href',
      FITTINGS_HREF,
    );
    expect(screen.getByRole('dialog', { name: 'Примерка образа' })).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Сгенерированное изображение: вы в образе' }),
    ).toHaveAttribute('src', expect.stringContaining('result.webp'));
    expect(screen.getByText('Сгенерировано ИИ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Поделиться' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Скачать' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Во весь экран' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'К образу' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'В образе' })).not.toBeInTheDocument();
  });

  it('lists the items with links to their products, prices and the sum of the look', async () => {
    showResult();
    renderTryOn({ fittingId: RESULT });

    expect(await screen.findByRole('heading', { name: 'Вещи образа' })).toBeInTheDocument();
    for (const [name, id, price] of [
      ['Рубашка', SHIRT, /5\s000/],
      ['Джинсы', JEANS, /4\s000/],
      ['Кеды', SNEAKERS, /3\s000/],
    ] as const) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveAttribute('href', `/products/${id}`);
      expect(link.closest('li')?.textContent).toMatch(price);
    }
    expect(screen.getByText('Сумма образа').nextElementSibling).toHaveTextContent(/^12\s000/);
  });

  it('puts the items in the slots’ order whatever order the api gave', async () => {
    showResult(look({ items: [IN_SLOT_ORDER[2]!, IN_SLOT_ORDER[0]!, IN_SLOT_ORDER[1]!] }));
    renderTryOn({ fittingId: RESULT });

    await screen.findByRole('heading', { name: 'Вещи образа' });
    const links = ['Рубашка', 'Джинсы', 'Кеды'].map((name) => screen.getByRole('link', { name }));
    expect(
      links[0]!.compareDocumentPosition(links[1]!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      links[1]!.compareDocumentPosition(links[2]!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('offers the product’s colours as swatches with the item’s one pressed, «один цвет» for one and nothing for none', async () => {
    showResult();
    renderTryOn({ fittingId: RESULT });

    const group = await screen.findByRole('group', { name: 'Цвет: Рубашка' });
    expect(within(group).getByRole('button', { name: 'Белый' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(group).getByRole('button', { name: 'Чёрный' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    const jeansRow = await rowOf('Джинсы');
    expect(await within(jeansRow).findByText('один цвет')).toBeInTheDocument();
    expect(within(jeansRow).queryByRole('group')).not.toBeInTheDocument();
    const sneakersRow = await rowOf('Кеды');
    expect(within(sneakersRow).queryByRole('group')).not.toBeInTheDocument();
    expect(within(sneakersRow).queryByText('один цвет')).not.toBeInTheDocument();
  });

  it('has the stubs, the question, «Заменить вещь в примерочной» and the look’s meter', async () => {
    showResult();
    renderTryOn({ fittingId: RESULT });

    expect(
      await screen.findByRole('button', { name: 'Добавить образ в корзину' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Добавить образ в избранное' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Всё в/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'В корзину' })).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Хотите что-то поменять в образе?' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Заменить вещь в примерочной' })).toBeInTheDocument();
    expect(await screen.findByText('Образ — 1 примерка · осталось 17')).toBeInTheDocument();
  });

  it('closes the window and opens the room from «Заменить вещь в примерочной»', async () => {
    showResult();
    const user = setup();
    const { onClose } = renderTryOn({ fittingId: RESULT });

    await user.click(await screen.findByRole('button', { name: 'Заменить вещь в примерочной' }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(useRoomStore.getState().open).toBe(true);
  });

  it('shows the wait of a look that runs, naming the look and not one item', async () => {
    showResult(running({ id: RESULT, status: 'processing', stage: 'generating' }));
    renderTryOn({ fittingId: RESULT });

    expect(await screen.findByText('Надеваем образ')).toBeInTheDocument();
    expect(screen.queryByText('Рубашка')).not.toBeInTheDocument();
  });
});

describe('TryOn of a look: another colour (AC15)', () => {
  async function pickBlack(user: ReturnType<typeof setup>) {
    const group = await screen.findByRole('group', { name: 'Цвет: Рубашка' });
    await user.click(within(group).getByRole('button', { name: 'Чёрный' }));
  }

  const BLACK_SHIRT = [
    lookItem(shirt, 'top', BLACK, 'Чёрный'),
    IN_SLOT_ORDER[1]!,
    IN_SLOT_ORDER[2]!,
  ];

  it('regenerates the whole look on the same photo with only that colour changed and the same wishes', async () => {
    showResult();
    api.started = () => json(201, { ...running({ items: BLACK_SHIRT }), repeated: false });
    const user = setup();
    renderTryOn({ fittingId: RESULT });

    await pickBlack(user);

    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]?.path).toBe('/api/fittings');
    expect(bodyOf(0)).toEqual({
      photoId: PHOTO_A,
      kind: 'look',
      items: [
        { productId: SHIRT, attributeValueId: BLACK },
        { productId: JEANS, attributeValueId: BLUE },
        { productId: SNEAKERS },
      ],
      promptText: 'шарф поверх',
    });
    expect(mocks.track).toHaveBeenCalledWith(
      'Fitting Started',
      expect.objectContaining({ kind: 'look', source: 'colour', with_prompt: true }),
    );
  });

  it('runs over the old result with the changed item named and «1 примерка», the controls off', async () => {
    showResult();
    api.started = () => json(201, { ...running({ items: BLACK_SHIRT }), repeated: false });
    const user = setup();
    renderTryOn({ fittingId: RESULT });

    await pickBlack(user);

    expect(await screen.findByText('Перегенерируем образ: рубашка, Чёрный')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Прогресс примерки' })).toBeInTheDocument();
    expect(screen.getByText(/· 1 примерка$/)).toBeInTheDocument();
    expect(screen.queryByText('Сгенерировано ИИ')).not.toBeInTheDocument();
    const group = screen.getByRole('group', { name: 'Цвет: Рубашка' });
    for (const swatch of within(group).getAllByRole('button')) expect(swatch).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Хотите что-то поменять в образе?' })).toBeDisabled();
    expect(posts()).toHaveLength(1);
  });

  it('does not say «1 примерка» when the running look does not count against the limit', async () => {
    showResult();
    api.started = () =>
      json(201, {
        ...running({ items: BLACK_SHIRT, countsAgainstLimit: false }),
        repeated: false,
      });
    const user = setup();
    renderTryOn({ fittingId: RESULT });

    await pickBlack(user);

    await screen.findByText('Перегенерируем образ: рубашка, Чёрный');
    expect(screen.queryByText(/· 1 примерка$/)).not.toBeInTheDocument();
  });

  it('opens an already tried combination at once, spends nothing and shows no regeneration', async () => {
    showResult();
    showResult(look({ id: EARLIER, items: BLACK_SHIRT }));
    api.started = () =>
      json(200, {
        ...look({ id: EARLIER, items: BLACK_SHIRT }),
        repeated: true,
      });
    const user = setup();
    renderTryOn({ fittingId: RESULT });

    await pickBlack(user);

    await vi.waitFor(() => {
      const group = screen.getByRole('group', { name: 'Цвет: Рубашка' });
      expect(within(group).getByRole('button', { name: 'Чёрный' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
    expect(screen.queryByText(/Перегенерируем образ/)).not.toBeInTheDocument();
    expect(screen.getByText('Сгенерировано ИИ')).toBeInTheDocument();
    expect(mocks.track).toHaveBeenCalledWith(
      'Fitting Completed',
      expect.objectContaining({ kind: 'look', repeated: true, counts_against_limit: false }),
    );
  });

  it('shows the limit card when the colour change meets the limit', async () => {
    showResult();
    api.started = () => failure(409, 'LIMIT_REACHED');
    const user = setup();
    renderTryOn({ fittingId: RESULT });

    await pickBlack(user);

    expect(await limitHeading()).toBeInTheDocument();
    expect(mocks.track).toHaveBeenCalledWith('Fitting Refused', {
      kind: 'look',
      reason: 'limit_reached',
    });
  });

  it('shows another failure in the list and gives the swatches back', async () => {
    showResult();
    api.started = () => failure(503, 'SERVICE_UNAVAILABLE');
    const user = setup();
    renderTryOn({ fittingId: RESULT });

    await pickBlack(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Сервис временно недоступен, попробуйте позже',
    );
    const group = screen.getByRole('group', { name: 'Цвет: Рубашка' });
    await vi.waitFor(() =>
      expect(within(group).getByRole('button', { name: 'Чёрный' })).toBeEnabled(),
    );
  });

  it('says a refused text in the list for a colour change, with no limit card', async () => {
    showResult();
    api.started = () => failure(400, 'PROMPT_REFUSED');
    const user = setup();
    renderTryOn({ fittingId: RESULT });

    await pickBlack(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Текст не подходит для примерки: опишите посадку или стиль выбранных вещей',
    );
    expect(
      screen.queryByRole('heading', { name: 'Примерки на этот месяц закончились' }),
    ).not.toBeInTheDocument();
  });

  it('opens the limit card for a colour change at the limit and shows no error text', async () => {
    showResult();
    api.started = () => failure(409, 'LIMIT_REACHED');
    const user = setup();
    renderTryOn({ fittingId: RESULT });

    await pickBlack(user);

    expect(await limitHeading()).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Достигнут лимит, больше добавить нельзя')).not.toBeInTheDocument();
  });

  it('starts nothing for the colour that is already the item’s', async () => {
    showResult();
    const user = setup();
    renderTryOn({ fittingId: RESULT });
    const group = await screen.findByRole('group', { name: 'Цвет: Рубашка' });

    await user.click(within(group).getByRole('button', { name: 'Белый' }));

    expect(posts()).toHaveLength(0);
  });

  it('cannot run again when the photo is gone: the swatches and the regeneration are off', async () => {
    showResult(look({ photoId: null }));
    renderTryOn({ fittingId: RESULT });

    const group = await screen.findByRole('group', { name: 'Цвет: Рубашка' });
    for (const swatch of within(group).getAllByRole('button')) expect(swatch).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Хотите что-то поменять в образе?' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Заменить вещь в примерочной' })).toBeEnabled();
  });
});

describe('TryOn of a look: «Что поменять?» and the retry', () => {
  it('asks «Какая именно?» for a look and sends the item’s name as the comment', async () => {
    showResult();
    api.started = () => json(201, { ...running({ parentId: RESULT }), repeated: false });
    const user = setup();
    renderTryOn({ fittingId: RESULT });

    await user.click(
      await screen.findByRole('button', { name: 'Хотите что-то поменять в образе?' }),
    );
    const sheet = await screen.findByRole('dialog', { name: 'Что поменять?' });
    await user.click(within(sheet).getByRole('button', { name: 'Вещь' }));
    await user.click(within(sheet).getByRole('button', { name: 'Рубашка' }));
    await user.click(within(sheet).getByRole('button', { name: /Перегенерировать/ }));

    expect(await screen.findByText('Примеряем…')).toBeInTheDocument();
    expect(posts()[0]?.path).toBe(`/api/fittings/${RESULT}/regenerate`);
    expect(bodyOf(0)).toEqual({ reasons: ['item'], comment: 'Рубашка' });
    expect(mocks.track).toHaveBeenCalledWith(
      'Fitting Started',
      expect.objectContaining({ kind: 'look', source: 'regenerate' }),
    );
  });

  it('retries a failed look with its photo, its items in their colours and its wishes', async () => {
    showResult(look({ status: 'failed', failureCode: 'model_timeout', countsAgainstLimit: false }));
    const user = setup();
    renderTryOn({ fittingId: RESULT });

    await user.click(await screen.findByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await screen.findByText('Примеряем…')).toBeInTheDocument();
    expect(posts()[0]?.path).toBe('/api/fittings');
    expect(bodyOf(0)).toEqual({
      photoId: PHOTO_A,
      kind: 'look',
      items: [
        { productId: SHIRT, attributeValueId: WHITE },
        { productId: JEANS, attributeValueId: BLUE },
        { productId: SNEAKERS },
      ],
      promptText: 'шарф поверх',
    });
    expect(mocks.track).toHaveBeenCalledWith(
      'Fitting Started',
      expect.objectContaining({ kind: 'look', source: 'retry' }),
    );
  });

  it('sends no wishes on the retry of a look that had none', async () => {
    showResult(look({ status: 'failed', failureCode: 'model_timeout', promptText: null }));
    const user = setup();
    renderTryOn({ fittingId: RESULT });

    await user.click(await screen.findByRole('button', { name: 'Попробовать ещё раз' }));

    await screen.findByText('Примеряем…');
    expect(bodyOf(0)).not.toHaveProperty('promptText');
  });

  it('goes back to the look’s picker when the failed look’s photo is gone', async () => {
    showResult(look({ status: 'failed', failureCode: 'model_timeout', photoId: null }));
    const user = setup();
    renderTryOn({ fittingId: RESULT });

    await user.click(await screen.findByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await screen.findByText('Образ · 3 вещи')).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });
});

describe('TryOn of a look: the picker of a shown look keeps that look, not the room’s', () => {
  const BLACK_SHIRT_AND_SNEAKERS = [
    lookItem(shirt, 'top', BLACK, 'Чёрный'),
    lookItem(sneakers, 'shoes', null, null),
  ];

  function shownLook(patch: Partial<Fitting> = {}) {
    showResult(
      look({
        items: BLACK_SHIRT_AND_SNEAKERS,
        promptText: 'шарф поверх',
        status: 'failed',
        stage: 'done',
        failureCode: 'moderation',
        resultUrl: null,
        ...patch,
      }),
    );
  }

  async function startFromPicker(user: ReturnType<typeof setup>) {
    await screen.findByText('Образ · 2 вещи');
    await vi.waitFor(() => expect(start()).toBeEnabled());
    await user.click(start());
    await screen.findByText('Примеряем…');
  }

  it('tries the failed look’s items, colours and wishes on another photo (a «Другое фото»)', async () => {
    shownLook();
    useRoomStore.setState({ wishes: { userId: USER, text: 'из примерочной' } });
    const user = setup();
    renderTryOn({ fittingId: RESULT });

    await user.click(await screen.findByRole('button', { name: 'Другое фото' }));

    expect(await screen.findByText('Образ · 2 вещи')).toBeInTheDocument();
    expect(screen.getByText(/8\s000/)).toBeInTheDocument();
    expect(screen.queryByText(/12\s000/)).not.toBeInTheDocument();
    await startFromPicker(user);
    expect(bodyOf(0)).toEqual({
      photoId: PHOTO_B,
      kind: 'look',
      items: [{ productId: SHIRT, attributeValueId: BLACK }, { productId: SNEAKERS }],
      promptText: 'шарф поверх',
    });
  });

  it('sends no wishes of the room when the shown look had none', async () => {
    shownLook({ promptText: null });
    useRoomStore.setState({ wishes: { userId: USER, text: 'из примерочной' } });
    const user = setup();
    renderTryOn({ fittingId: RESULT });

    await user.click(await screen.findByRole('button', { name: 'Другое фото' }));
    await startFromPicker(user);

    expect(bodyOf(0)).not.toHaveProperty('promptText');
  });

  it('does the same when the retry finds the photo gone', async () => {
    shownLook({ failureCode: 'model_timeout', photoId: null });
    const user = setup();
    renderTryOn({ fittingId: RESULT });

    await user.click(await screen.findByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await screen.findByText('Образ · 2 вещи')).toBeInTheDocument();
    expect(screen.getByText(/8\s000/)).toBeInTheDocument();
    await startFromPicker(user);
    expect(bodyOf(0).items).toEqual([
      { productId: SHIRT, attributeValueId: BLACK },
      { productId: SNEAKERS },
    ]);
    expect(bodyOf(0).promptText).toBe('шарф поверх');
  });

  it('opened from the room with no fitting still uses the room and its wishes', async () => {
    useRoomStore.setState({ wishes: { userId: USER, text: 'из примерочной' } });
    const user = setup();
    renderTryOn({ look: true });

    expect(await screen.findByText('Образ · 3 вещи')).toBeInTheDocument();
    expect(screen.getByText(/12\s000/)).toBeInTheDocument();
    await vi.waitFor(() => expect(start()).toBeEnabled());
    await user.click(start());
    await screen.findByText('Примеряем…');
    expect(bodyOf(0).items).toHaveLength(3);
    expect(bodyOf(0).promptText).toBe('из примерочной');
  });
});

describe('TryOn of a look on a phone (boards 8.1, 8.2)', () => {
  beforeEach(stubPhone);

  it('shows the strip, the count and the sum with «Всё в корзину» and «Вещи образа» under the picture', async () => {
    showResult();
    renderTryOn({ fittingId: RESULT });

    expect(await screen.findByRole('button', { name: 'Вещи образа' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Добавить образ в корзину' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Добавить образ в избранное' })).toBeInTheDocument();
    expect(screen.getByText('3 вещи')).toBeInTheDocument();
    expect(screen.getByText(/12\s000/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Вещи образа' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Рубашка' })).not.toBeInTheDocument();
  });

  it('opens «Вещи образа» as a screen of its own with the list, the sum and the actions', async () => {
    showResult();
    const user = setup();
    renderTryOn({ fittingId: RESULT });

    await user.click(await screen.findByRole('button', { name: 'Вещи образа' }));

    const screen2 = await screen.findByRole('dialog', { name: 'Вещи образа' });
    expect(await within(screen2).findByRole('link', { name: 'Рубашка' })).toBeInTheDocument();
    expect(within(screen2).getByText('Сумма образа')).toBeInTheDocument();
    expect(
      within(screen2).getByRole('button', { name: 'Добавить образ в корзину' }),
    ).toBeInTheDocument();
    expect(
      within(screen2).getByRole('button', { name: 'Добавить образ в избранное' }),
    ).toBeInTheDocument();
    expect(
      within(screen2).getByRole('button', { name: 'Хотите что-то поменять в образе?' }),
    ).toBeEnabled();
    expect(
      within(screen2).getByRole('button', { name: 'Заменить вещь в примерочной' }),
    ).toBeInTheDocument();
  });

  it('changes a colour from the screen of the items the same way', async () => {
    showResult();
    api.started = () =>
      json(201, {
        ...running({
          items: [lookItem(shirt, 'top', BLACK, 'Чёрный'), IN_SLOT_ORDER[1]!, IN_SLOT_ORDER[2]!],
        }),
        repeated: false,
      });
    const user = setup();
    renderTryOn({ fittingId: RESULT });
    await user.click(await screen.findByRole('button', { name: 'Вещи образа' }));
    const items = await screen.findByRole('dialog', { name: 'Вещи образа' });
    const group = await within(items).findByRole('group', { name: 'Цвет: Рубашка' });

    await user.click(within(group).getByRole('button', { name: 'Чёрный' }));

    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    expect(bodyOf(0).items[0]).toEqual({ productId: SHIRT, attributeValueId: BLACK });
    expect(bodyOf(0).kind).toBe('look');
  });
});
