import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    },
  ],
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

interface Api {
  left?: number;
  last?: unknown;
  // The quota never answers.
  quotaPending?: boolean;
}

function api({ left = 5, last = null, quotaPending = false }: Api = {}) {
  fetchMock.mockImplementation((url: unknown) => {
    const { pathname } = new URL(String(url));
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

function setup(props: { hasSlot?: boolean; product?: ProductDetail; onTryOn?: () => void } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onTryOn = props.onTryOn ?? vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <ProductBuyBox
        product={props.product ?? product}
        hasSlot={props.hasSlot ?? true}
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

describe('ProductBuyBox: «К образу» (A18, A82)', () => {
  it('is shown, and always disabled, when the category has a slot', () => {
    setup({ hasSlot: true });

    expect(screen.getByRole('button', { name: 'К образу' })).toBeDisabled();
  });

  it('is disabled for a signed-out visitor too', () => {
    mocks.session = { status: 'signed-out', failed: false };
    setup({ hasSlot: true });

    expect(screen.getByRole('button', { name: 'К образу' })).toBeDisabled();
  });

  it('is not shown without a slot', () => {
    setup({ hasSlot: false });

    expect(screen.queryByRole('button', { name: 'К образу' })).not.toBeInTheDocument();
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
