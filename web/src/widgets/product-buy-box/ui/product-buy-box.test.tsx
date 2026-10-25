import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OutfitSlot } from '@/entities/category';
import type { ProductDetail } from '@/entities/product';
import { track } from '@/shared/analytics/client';
import { HOVER_MS } from '@/shared/analytics/use-tracked-element';
import { fittingHref } from '@/shared/config';

import { ProductBuyBox } from './product-buy-box';

const mocks = vi.hoisted(() => ({
  session: { status: 'signed-in', user: { id: 'u1', email: 'a@example.com', name: null } } as
    | { status: 'pending' }
    | { status: 'signed-in'; user: { id: string; email: string; name: string | null } }
    | { status: 'signed-out'; failed: boolean },
  showToast: vi.fn(),
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
  track: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/products/p1',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const OTHER = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const FITTING_ID = '7a1c2d3e-4b5f-4a6b-8c7d-9e0f1a2b3c4d';
const DATE = '2026-10-01T12:00:00.000Z';
const RESULT = 'https://s3.test/keep/users/u/r.webp?X-Amz-Signature=sig';

const WHITE = '11111111-1111-4111-8111-111111111111';
const BLACK = '22222222-2222-4222-8222-222222222222';
const COTTON = '33333333-3333-4333-8333-333333333333';

const product: ProductDetail = {
  id: ID,
  article: 'A-1',
  name: 'Рубашка Design collection',
  brand: { id: OTHER, name: 'Annen' },
  category: { id: OTHER, name: 'Рубашки', slug: 'shirts' },
  image: null,
  price: 5000,
  discount: 0,
  finalPrice: 5000,
  rating: 4.7,
  createdAt: DATE,
  updatedAt: DATE,
  description: null,
  images: [],
  variations: [
    { id: OTHER, size: 'XL', stock: 1 },
    { id: ID, size: 'S', stock: 1 },
    { id: WHITE, size: 'M', stock: 1 },
  ],
  attributes: [
    {
      attribute: { id: OTHER, name: 'Цвет' },
      values: [
        { id: WHITE, value: 'белый', colorHex: '#FFFFFF' },
        { id: BLACK, value: 'чёрный', colorHex: '#000000' },
      ],
    },
    {
      attribute: { id: ID, name: 'Материал' },
      values: [{ id: COTTON, value: 'хлопок', colorHex: null }],
    },
  ],
};

const completed = {
  id: FITTING_ID,
  kind: 'single',
  parentId: null,
  status: 'completed',
  stage: 'done',
  failureCode: null,
  countsAgainstLimit: true,
  regenerationFree: true,
  model: 'gpt-image-2',
  items: [
    {
      productId: ID,
      name: 'Рубашка Design collection',
      brand: 'Annen',
      imageUrl: null,
      price: 5000,
      finalPrice: 5000,
      attributeValueId: BLACK,
      colour: 'чёрный',
      slot: 'top',
    },
  ],
  promptText: null,
  photoId: null,
  resultUrl: RESULT,
  createdAt: '2026-10-01T11:06:00.000Z',
  startedAt: null,
  finishedAt: null,
  estimatedSeconds: null,
};

const fetchMock = vi.fn();

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

const OTHER_PRODUCT_ID = '5d6e7f80-1a2b-4c3d-8e4f-5a6b7c8d9e0f';
const otherProduct: ProductDetail = {
  ...product,
  id: OTHER_PRODUCT_ID,
  name: 'Блузка',
};

function roomItem(of: ProductDetail, attributeValueId: string | null, colour: string | null) {
  return { slot: 'top', product: of, attributeValueId, colour };
}

function roomOf(...items: ReturnType<typeof roomItem>[]) {
  return { items, count: items.length, sum: items.length * 5000 };
}

interface Api {
  left?: number;
  last?: unknown;
  // The quota never answers.
  quotaPending?: boolean;
  // GET /me/fitting-room.
  room?: unknown;
  // The answer of a PUT /me/fitting-room/:slot.
  change?: unknown;
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

function api({
  left = 5,
  last = null,
  quotaPending = false,
  room = roomOf(),
  change = { room: roomOf(roomItem(product, WHITE, 'белый')), replaced: null },
}: Api = {}) {
  fetchMock.mockImplementation((url: unknown, init?: RequestInit) => {
    const { pathname } = new URL(String(url));
    const method = init?.method ?? 'GET';
    if (pathname === '/api/me/fitting-room' && method === 'GET') return json(room);
    if (pathname.startsWith('/api/me/fitting-room/')) {
      return method === 'PUT' ? json(change) : Promise.resolve(new Response(null, { status: 204 }));
    }
    if (pathname === '/api/me/fitting-quota') {
      if (quotaPending) return new Promise(() => {});
      return json({ limit: 20, used: 20 - left, left, renewsAt: '2026-10-31T21:00:00.000Z' });
    }
    if (pathname === `/api/products/${ID}/fittings/last`) {
      if (last === null) {
        return json({ error: { code: 'NOT_FOUND', message: 'm', details: [] } }, 404);
      }
      return json(last);
    }
    return json({}, 500);
  });
}

function setup(
  props: { slot?: OutfitSlot | null; product?: ProductDetail; onTryOn?: () => void } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onTryOn = props.onTryOn ?? vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <ProductBuyBox
        product={props.product ?? product}
        slot={props.slot === undefined ? 'top' : props.slot}
        onTryOn={onTryOn}
      />
    </QueryClientProvider>,
  );
  return { onTryOn, user: userEvent.setup({ pointerEventsCheck: 0 }) };
}

beforeEach(() => {
  mocks.session = { status: 'signed-in', user: { id: 'u1', email: 'a@example.com', name: null } };
  mocks.showToast.mockReset();
  vi.mocked(track).mockClear();
  fetchMock.mockReset();
  api();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProductBuyBox: the product', () => {
  it('shows the rating, the brand as the heading, the name and the price', () => {
    setup();

    expect(screen.getByRole('img', { name: 'Рейтинг 4,7 из 5' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Annen$/);
    expect(screen.getByText('Рубашка Design collection')).toBeInTheDocument();
    expect(screen.getByText(/5\s000/)).toBeInTheDocument();
  });

  it('shows no old price and no badge without a discount', () => {
    setup();

    expect(screen.queryByText(/Старая цена/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^−\d+%$/)).not.toBeInTheDocument();
  });

  it('strikes out the old price and shows the «−N%» badge with a discount', () => {
    setup({ product: { ...product, discount: 20, finalPrice: 4000 } });

    expect(screen.getByText(/Старая цена/)).toBeInTheDocument();
    expect(screen.getByText('−20%')).toBeInTheDocument();
    expect(screen.getByText(/4\s000/)).toBeInTheDocument();
  });

  it('shows no rating for a product without one', () => {
    setup({ product: { ...product, rating: null } });

    expect(screen.queryByRole('img', { name: /Рейтинг/ })).not.toBeInTheDocument();
  });
});

describe('ProductBuyBox: colour and size', () => {
  it('picks the first colour by default, capitalised', () => {
    setup();

    expect(screen.getByRole('combobox', { name: 'Цвет' })).toHaveTextContent('Белый');
  });

  it('lists only the values that have a swatch colour', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('combobox', { name: 'Цвет' }));

    const options = within(await screen.findByRole('listbox')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['Белый', 'Чёрный']);
  });

  it('lists a value of the colour attribute with no swatch too, and no value of another attribute (A91)', async () => {
    const STRIPED = '44444444-4444-4444-8444-444444444444';
    const first = product.attributes[0]!;
    const { user } = setup({
      product: {
        ...product,
        attributes: [
          {
            ...first,
            values: [...first.values, { id: STRIPED, value: 'в полоску', colorHex: null }],
          },
          product.attributes[1]!,
        ],
      },
    });

    await user.click(screen.getByRole('combobox', { name: 'Цвет' }));

    const options = within(await screen.findByRole('listbox')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['Белый', 'Чёрный', 'В полоску']);
  });

  it('has no colour select for a product with no coloured value', () => {
    setup({ product: { ...product, attributes: [product.attributes[1]!] } });

    expect(screen.queryByRole('combobox', { name: 'Цвет' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Размер' })).toBeInTheDocument();
  });

  it('asks for a size and lists the sizes in order', async () => {
    const { user } = setup();
    const select = screen.getByRole('combobox', { name: 'Размер' });

    expect(select).toHaveTextContent('Выберите размер');
    await user.click(select);

    const options = within(await screen.findByRole('listbox')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['S', 'M', 'XL']);
  });

  it('has no size select for a product without variations', () => {
    setup({ product: { ...product, variations: [] } });

    expect(screen.queryByRole('combobox', { name: 'Размер' })).not.toBeInTheDocument();
  });
});

describe('ProductBuyBox: the actions (A87)', () => {
  it('has no fixed bar and keeps the cart, try-on, look and meter in that order', async () => {
    setup();
    const meter = await screen.findByText('Осталось 5 примерок в этом месяце');

    expect(document.querySelector('[data-fixed-bar]')).toBeNull();
    const cart = screen.getByRole('button', { name: 'Добавить в корзину' });
    const tryOn = screen.getByRole('button', { name: 'Примерить' });
    const look = screen.getByRole('button', { name: 'К образу' });
    const follows = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(cart, tryOn)).toBe(true);
    expect(follows(tryOn, look)).toBe(true);
    expect(follows(look, meter)).toBe(true);
  });
});

describe('ProductBuyBox: the cart and favourites stubs (A33)', () => {
  it('shows the toast on «Добавить в корзину» and on the heart, which stays off', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: 'Добавить в корзину' }));
    expect(mocks.showToast).toHaveBeenLastCalledWith({
      title: 'В прототипе нет корзины и избранного',
    });

    const heart = screen.getByRole('button', { name: 'В избранное' });
    await user.click(heart);
    expect(mocks.showToast).toHaveBeenCalledTimes(2);
    expect(heart).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows the stubs signed out too', () => {
    mocks.session = { status: 'signed-out', failed: false };
    setup();

    expect(screen.getByRole('button', { name: 'Добавить в корзину' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'В избранное' })).toBeInTheDocument();
  });
});

describe('ProductBuyBox: «Примерить» signed in', () => {
  it('calls onTryOn and nothing else', async () => {
    const { user, onTryOn } = setup();
    const button = await screen.findByRole('button', { name: 'Примерить' });
    await vi.waitFor(() => expect(button).toBeEnabled());

    await user.click(button);

    expect(onTryOn).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it('waits while the quota loads', () => {
    api({ quotaPending: true });
    setup();

    expect(screen.getByRole('button', { name: 'Примерить' })).toHaveAttribute('aria-busy', 'true');
  });

  it('waits while the session loads, and reads nothing of the user', () => {
    mocks.session = { status: 'pending' };
    setup();

    expect(screen.getByRole('button', { name: 'Примерить' })).toHaveAttribute('aria-busy', 'true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is turned off at no tries left (AC19)', async () => {
    api({ left: 0 });
    setup();

    expect(await screen.findByText('Закончились · снова с 1 ноября')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Примерить' })).toBeDisabled();
  });

  it('stays on with a single try left', async () => {
    api({ left: 1 });
    setup();

    expect(await screen.findByText('Осталась 1 — мало')).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Примерить' })).toBeEnabled());
  });
});

describe('ProductBuyBox: «Примерить» signed out (AC16)', () => {
  beforeEach(() => {
    mocks.session = { status: 'signed-out', failed: false };
  });

  it('opens the sign-in window and starts nothing', async () => {
    const { user, onTryOn } = setup();

    await user.click(screen.getByRole('button', { name: 'Примерить' }));

    expect(await screen.findByRole('dialog', { name: 'Вход' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Войти через Google' })).toBeInTheDocument();
    expect(onTryOn).not.toHaveBeenCalled();
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it('reads neither the quota nor the last fitting and shows no meter or note', () => {
    setup();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/Осталось|Осталась|Закончились/)).not.toBeInTheDocument();
    expect(screen.queryByText('Вы это примеряли')).not.toBeInTheDocument();
  });

  it('does the same after a failed session read', async () => {
    mocks.session = { status: 'signed-out', failed: true };
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: 'Примерить' }));

    expect(await screen.findByRole('dialog', { name: 'Вход' })).toBeInTheDocument();
  });
});

describe('ProductBuyBox: tracked elements (A84)', () => {
  const clicked = (
    element: string,
    properties: Record<string, boolean> = {},
    type = 'interaction',
  ) => ({
    element,
    zone: 'product',
    type,
    ...properties,
  });
  const clicks = () => vi.mocked(track).mock.calls.filter(([name]) => name === 'Element Clicked');

  it('sends the cart and the heart with tried_on false when nothing was tried on', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: 'Добавить в корзину' }));
    await user.click(screen.getByRole('button', { name: 'В избранное' }));

    expect(track).toHaveBeenNthCalledWith(
      1,
      'Element Clicked',
      clicked('buy-box.add-to-cart', { tried_on: false }),
    );
    expect(track).toHaveBeenNthCalledWith(
      2,
      'Element Clicked',
      clicked('buy-box.favourite', { tried_on: false }),
    );
    expect(mocks.showToast).toHaveBeenCalledTimes(2);
  });

  it('sends tried_on true once «Вы это примеряли» is shown', async () => {
    api({ last: completed });
    const { user } = setup();
    await screen.findByRole('link', { name: /Вы это примеряли/ });

    await user.click(screen.getByRole('button', { name: 'Добавить в корзину' }));
    await user.click(screen.getByRole('button', { name: 'В избранное' }));

    expect(clicks().map(([, event]) => event)).toEqual([
      clicked('buy-box.add-to-cart', { tried_on: true }),
      clicked('buy-box.favourite', { tried_on: true }),
    ]);
  });

  it('sends tried_on false for a fitting that is not completed', async () => {
    api({ last: { ...completed, status: 'failed' } });
    const { user } = setup();
    await screen.findByText('Осталось 5 примерок в этом месяце');

    await user.click(screen.getByRole('button', { name: 'Добавить в корзину' }));

    expect(clicks().map(([, event]) => event)).toEqual([
      clicked('buy-box.add-to-cart', { tried_on: false }),
    ]);
  });

  it('sends tried_on false signed out', async () => {
    mocks.session = { status: 'signed-out', failed: false };
    api({ last: completed });
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: 'Добавить в корзину' }));

    expect(clicks().map(([, event]) => event)).toEqual([
      clicked('buy-box.add-to-cart', { tried_on: false }),
    ]);
  });

  it('sends «Примерить» with signed_in true, then opens the try-on', async () => {
    const { user, onTryOn } = setup();
    const button = await screen.findByRole('button', { name: 'Примерить' });
    await vi.waitFor(() => expect(button).toBeEnabled());

    await user.click(button);

    expect(clicks().map(([, event]) => event)).toEqual([
      clicked('buy-box.try-on', { signed_in: true }),
    ]);
    expect(onTryOn).toHaveBeenCalledOnce();
  });

  it('sends «Примерить» with signed_in false and opens the sign-in window', async () => {
    mocks.session = { status: 'signed-out', failed: false };
    const { user, onTryOn } = setup();

    await user.click(screen.getByRole('button', { name: 'Примерить' }));

    expect(await screen.findByRole('dialog', { name: 'Вход' })).toBeInTheDocument();
    expect(clicks().map(([, event]) => event)).toEqual([
      clicked('buy-box.try-on', { signed_in: false }),
    ]);
    expect(onTryOn).not.toHaveBeenCalled();
  });

  it('sends nothing from «Примерить» at no tries left', async () => {
    api({ left: 0 });
    const { user, onTryOn } = setup();
    await screen.findByText('Закончились · снова с 1 ноября');

    await user.click(screen.getByRole('button', { name: 'Примерить' }));

    expect(clicks()).toEqual([]);
    expect(onTryOn).not.toHaveBeenCalled();
  });

  it('sends nothing from «Примерить» while it loads', async () => {
    api({ quotaPending: true });
    const { user, onTryOn } = setup();

    await user.click(screen.getByRole('button', { name: 'Примерить' }));

    expect(clicks()).toEqual([]);
    expect(onTryOn).not.toHaveBeenCalled();
  });

  describe('the hover of «Примерить»', () => {
    const hovers = () => vi.mocked(track).mock.calls.filter(([name]) => name === 'Element Hovered');
    const hoverFor500 = () => {
      fireEvent.pointerEnter(screen.getByRole('button', { name: 'Примерить' }), {
        pointerType: 'mouse',
      });
      act(() => vi.advanceTimersByTime(HOVER_MS + 1));
    };

    afterEach(() => {
      vi.useRealTimers();
    });

    it('sends Element Hovered when it is ready (positive control)', async () => {
      setup();
      await screen.findByText('Осталось 5 примерок в этом месяце');
      expect(screen.getByRole('button', { name: 'Примерить' })).not.toHaveAttribute('aria-busy');
      vi.useFakeTimers();

      hoverFor500();

      expect(hovers().map(([, event]) => event)).toEqual([
        { element: 'buy-box.try-on', zone: 'product', type: 'interaction', signed_in: true },
      ]);
    });

    it('sends nothing while the quota loads', () => {
      api({ quotaPending: true });
      setup();
      vi.useFakeTimers();

      hoverFor500();

      expect(hovers()).toEqual([]);
    });

    it('sends nothing at no tries left', async () => {
      api({ left: 0 });
      setup();
      await screen.findByText('Закончились · снова с 1 ноября');
      vi.useFakeTimers();

      hoverFor500();

      expect(hovers()).toEqual([]);
    });

    it('sends nothing while the session loads, and a click opens nothing', async () => {
      mocks.session = { status: 'pending' };
      const { user, onTryOn } = setup();

      await user.click(screen.getByRole('button', { name: 'Примерить' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(onTryOn).not.toHaveBeenCalled();

      vi.useFakeTimers();
      hoverFor500();

      expect(vi.mocked(track)).not.toHaveBeenCalled();
    });
  });

  it('sends the link of «Вы это примеряли» with no properties', async () => {
    api({ last: completed });
    const { user } = setup();
    const link = await screen.findByRole('link', { name: /Вы это примеряли/ });
    link.addEventListener('click', (event) => event.preventDefault());

    await user.click(link);

    expect(clicks().map(([, event]) => event)).toEqual([
      clicked('buy-box.tried-on', {}, 'navigation'),
    ]);
  });
});

describe('ProductBuyBox: «К образу» (A18, A82, AC13, AC16)', () => {
  const NAME = '«Рубашка Design collection Annen»';
  const clicks = () =>
    vi
      .mocked(track)
      .mock.calls.filter(([name]) => name === 'Element Clicked')
      .map(([, event]) => event);

  async function readyLook(name = 'К образу') {
    const button = await screen.findByRole('button', { name });
    await vi.waitFor(() => expect(button).not.toHaveAttribute('aria-busy', 'true'));
    return button;
  }

  it('is not shown without a slot, signed in or out (AC16)', () => {
    setup({ slot: null });
    expect(screen.queryByRole('button', { name: 'К образу' })).not.toBeInTheDocument();
  });

  it('is not shown without a slot for a visitor either', () => {
    mocks.session = { status: 'signed-out', failed: false };
    setup({ slot: null });
    expect(screen.queryByRole('button', { name: 'К образу' })).not.toBeInTheDocument();
  });

  it('waits while the room loads and reads it', async () => {
    setup();

    expect(screen.getByRole('button', { name: 'К образу' })).toHaveAttribute('aria-busy', 'true');
    await readyLook();
    expect(screen.getByRole('button', { name: 'К образу' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('puts the product into its slot with the chosen colour and says so (AC13)', async () => {
    const { user } = setup();

    await user.click(await readyLook());

    await vi.waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({
      method: 'PUT',
      path: '/api/me/fitting-room/top',
      body: { productId: ID, attributeValueId: WHITE },
    });
    expect(await screen.findByRole('button', { name: 'В образе' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        title: `${NAME} в примерочной: верх`,
        actionLabel: 'Открыть',
      }),
    );
  });

  it('puts the colour picked in the select', async () => {
    const { user } = setup();
    await readyLook();

    await user.click(screen.getByRole('combobox', { name: 'Цвет' }));
    await user.click(await screen.findByRole('option', { name: 'Чёрный' }));
    await user.click(screen.getByRole('button', { name: 'К образу' }));

    await vi.waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]?.body).toEqual({ productId: ID, attributeValueId: BLACK });
  });

  it('takes the product out of the room on a second click, with «Вернуть»', async () => {
    api({ room: roomOf(roomItem(product, WHITE, 'белый')) });
    const { user } = setup();

    await user.click(await readyLook('В образе'));

    await vi.waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({
      method: 'DELETE',
      path: '/api/me/fitting-room/top',
      body: undefined,
    });
    expect(await screen.findByRole('button', { name: 'К образу' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        title: `Убрали ${NAME} из примерочной`,
        actionLabel: 'Вернуть',
      }),
    );
  });

  it('replaces an occupied slot with a toast whose «Вернуть» puts the previous item back (AC13)', async () => {
    const before = roomOf(roomItem(otherProduct, BLACK, 'чёрный'));
    api({
      room: before,
      change: {
        room: roomOf(roomItem(product, WHITE, 'белый')),
        replaced: roomItem(otherProduct, BLACK, 'чёрный'),
      },
    });
    const { user } = setup();

    await user.click(await readyLook());

    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalledOnce());
    const toast = mocks.showToast.mock.calls[0]![0] as {
      title: string;
      actionLabel: string;
      onAction: () => void;
    };
    expect(toast.title).toBe(`Заменили верх: ${NAME} вместо «Блузка Annen»`);
    expect(toast.actionLabel).toBe('Вернуть');

    toast.onAction();

    await vi.waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1]).toEqual({
      method: 'PUT',
      path: '/api/me/fitting-room/top',
      body: { productId: OTHER_PRODUCT_ID, attributeValueId: BLACK },
    });
    expect(clicks()).toContainEqual({
      element: 'room.undo',
      zone: 'fitting',
      type: 'interaction',
      slot: 'top',
      action: 'replace',
    });
    expect(mocks.showToast).toHaveBeenCalledTimes(1);
  });

  it('shows the error and keeps the button when the write fails', async () => {
    api();
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: unknown, init?: RequestInit) =>
      init?.method === 'PUT'
        ? json({ error: { code: 'RELATED_NOT_FOUND', message: 'm', details: [] } }, 400)
        : base(url, init),
    );
    const { user } = setup();

    await user.click(await readyLook());

    await vi.waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'error' })),
    );
    expect(screen.getByRole('button', { name: 'К образу' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('sends buy-box.to-look with the slot, the action and signed_in', async () => {
    const { user } = setup();

    await user.click(await readyLook());

    expect(clicks()).toContainEqual({
      element: 'buy-box.to-look',
      zone: 'product',
      type: 'interaction',
      slot: 'top',
      action: 'add',
      signed_in: true,
    });
  });

  it('opens the sign-in window for a visitor and changes nothing (AC16)', async () => {
    mocks.session = { status: 'signed-out', failed: false };
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: 'К образу' }));

    expect(await screen.findByRole('dialog', { name: 'Вход' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.showToast).not.toHaveBeenCalled();
    expect(clicks()).toContainEqual({
      element: 'buy-box.to-look',
      zone: 'product',
      type: 'interaction',
      slot: 'top',
      action: 'add',
      signed_in: false,
    });
  });

  it('waits while the session loads', () => {
    mocks.session = { status: 'pending' };
    setup();

    expect(screen.getByRole('button', { name: 'К образу' })).toHaveAttribute('aria-busy', 'true');
  });
});

describe('ProductBuyBox: the limit meter (AC19, AC21)', () => {
  it('shows how many tries are left, signed in', async () => {
    api({ left: 12 });
    setup();

    expect(await screen.findByText('Осталось 12 примерок в этом месяце')).toBeInTheDocument();
  });

  it('turns to the caution look at three or fewer', async () => {
    api({ left: 3 });
    setup();

    const text = await screen.findByText('Осталось 3 — мало');
    expect(text.closest('p')).toHaveClass('few');
  });

  it('keeps the usual look above three', async () => {
    api({ left: 4 });
    setup();

    const text = await screen.findByText('Осталось 4 примерки в этом месяце');
    expect(text.closest('p')).not.toHaveClass('few');
  });

  it('says when the tries come back at none left', async () => {
    api({ left: 0 });
    setup();

    const text = await screen.findByText('Закончились · снова с 1 ноября');
    expect(text.closest('p')).toHaveClass('few');
  });

  it('is not shown while the quota is unknown', () => {
    api({ quotaPending: true });
    setup();

    expect(screen.queryByText(/Осталось|Осталась|Закончились/)).not.toBeInTheDocument();
  });
});

describe('ProductBuyBox: «Вы это примеряли» (AC24)', () => {
  it('links to the last completed fitting with its date and colour', async () => {
    api({ last: completed });
    setup();

    const link = await screen.findByRole('link', { name: /Вы это примеряли/ });
    expect(link).toHaveAttribute('href', fittingHref(FITTING_ID));
    expect(link).toHaveTextContent('1 октября · чёрный');
    expect(link).toHaveTextContent('Смотреть');
    expect(link.querySelector('img')).toHaveAttribute('src', RESULT);
  });

  it('is not shown when there is no earlier fitting', async () => {
    api({ left: 5, last: null });
    setup();

    await screen.findByText('Осталось 5 примерок в этом месяце');
    await vi.waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/fittings/last'))).toBe(
        true,
      ),
    );
    expect(screen.queryByText('Вы это примеряли')).not.toBeInTheDocument();
  });

  it.each(['pending', 'processing', 'failed'] as const)(
    'is not shown for a %s fitting',
    async (status) => {
      api({ last: { ...completed, status } });
      setup();

      await screen.findByText('Осталось 5 примерок в этом месяце');
      await vi.waitFor(() =>
        expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/fittings/last'))).toBe(
          true,
        ),
      );
      expect(screen.queryByText('Вы это примеряли')).not.toBeInTheDocument();
    },
  );

  it('is not shown signed out even if the cache holds one', () => {
    mocks.session = { status: 'signed-out', failed: false };
    api({ last: completed });
    setup();

    expect(screen.queryByText('Вы это примеряли')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
