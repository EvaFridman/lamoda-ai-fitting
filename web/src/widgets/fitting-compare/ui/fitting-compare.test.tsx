import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FittingCompare } from './fitting-compare';

const mocks = vi.hoisted(() => ({
  track: vi.fn(),
  captureException: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }));

vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  reset: vi.fn(),
  track: mocks.track,
}));

vi.mock('@/shared/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/ui')>()),
  showToast: mocks.showToast,
}));

// jsdom cannot navigate: the link is a plain anchor whose click is cancelled.
vi.mock('next/link', async () => {
  const { createElement } = await import('react');
  return {
    default: ({
      onClick,
      ...props
    }: {
      href: string;
      onClick?: (event: { preventDefault: () => void }) => void;
    }) =>
      createElement('a', {
        ...props,
        onClick: (event: { preventDefault: () => void }) => {
          onClick?.(event);
          event.preventDefault();
        },
      }),
  };
});

const fetchMock = vi.fn();

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const A = uuid(1);
const B = uuid(2);
const RESULT = 'https://s3.test/keep/users/u/r.webp?X-Amz-Signature=sig';
const nbsp = String.fromCodePoint(0xa0);

function fitting(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    kind: 'single',
    parentId: null,
    status: 'completed',
    stage: 'done',
    failureCode: null,
    failureCategory: null,
    failureStage: null,
    countsAgainstLimit: true,
    regenerationFree: true,
    model: 'gpt-image-2',
    items: [
      {
        productId: uuid(100),
        name: 'Рубашка',
        brand: 'Annen',
        imageUrl: null,
        price: 1000,
        finalPrice: 900,
        attributeValueId: uuid(301),
        colour: 'белый',
        slot: 'top',
      },
    ],
    promptText: null,
    photoId: uuid(200),
    photoTransient: false,
    resultUrl: RESULT,
    createdAt: '2026-10-23T11:06:00.000Z',
    startedAt: '2026-10-23T11:06:00.000Z',
    finishedAt: '2026-10-23T11:07:00.000Z',
    estimatedSeconds: null,
    ...overrides,
  };
}

// The second entry: the same shirt in green, from another photo.
function greenOne(overrides: Record<string, unknown> = {}) {
  const base = fitting(B);
  return fitting(B, {
    photoId: uuid(201),
    createdAt: '2026-10-24T11:06:00.000Z',
    items: [{ ...base.items[0], attributeValueId: uuid(302), colour: 'зелёный', finalPrice: 950 }],
    ...overrides,
  });
}

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

const apiError = (status: number, code: string) =>
  json({ error: { code, message: 'm', details: [] } }, status);

// Answers GET /fittings/:id by the id; a missing key is an unknown one (404).
function api(answers: Record<string, () => Promise<Response>>) {
  fetchMock.mockImplementation((url: unknown) => {
    const id = new URL(String(url)).pathname.split('/').pop() ?? '';
    return (answers[id] ?? (() => apiError(404, 'NOT_FOUND')))();
  });
}

function renderCompare(a?: string, b?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <FittingCompare a={a} b={b} />
    </QueryClientProvider>,
  );
}

function stubPhone() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

const setup = () => userEvent.setup({ pointerEventsCheck: 0 });

async function columns() {
  return await screen.findAllByRole('region');
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FittingCompare with nothing to compare', () => {
  it.each([
    ['no ids', undefined, undefined],
    ['one id', A, undefined],
    ['the same id twice', A, A],
  ])('shows «Нечего сравнить» for %s and reads nothing', (_, a, b) => {
    renderCompare(a, b);

    expect(screen.getByText('Нечего сравнить')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'К истории примерок' })).toHaveAttribute(
      'href',
      '/customer/fittings',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['the first', { [B]: () => json(greenOne()) }],
    ['the second', { [A]: () => json(fitting(A)) }],
  ])('shows it when %s is not found', async (_, answers) => {
    api(answers);
    renderCompare(A, B);

    expect(await screen.findByText('Нечего сравнить')).toBeInTheDocument();
    expect(
      screen.getByText('Не удалось открыть сравнение. Выберите две примерки в истории.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'К истории примерок' })).toBeInTheDocument();
  });

  it.each(['pending', 'processing', 'failed'])('shows it when one is %s', async (status) => {
    api({
      [A]: () => json(fitting(A)),
      [B]: () => json(greenOne({ status, resultUrl: null })),
    });
    renderCompare(A, B);

    expect(await screen.findByText('Нечего сравнить')).toBeInTheDocument();
    expect(screen.queryByText('Чем отличаются')).not.toBeInTheDocument();
  });
});

describe('FittingCompare loading and failing', () => {
  it('shows skeletons while loading', () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    const { container } = renderCompare(A, B);

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByText('Нечего сравнить')).not.toBeInTheDocument();
  });

  it('shows the error text with «Повторить», which reads again', async () => {
    let calls = 0;
    api({
      [A]: () => {
        calls += 1;
        return calls === 1 ? apiError(503, 'SERVICE_UNAVAILABLE') : json(fitting(A));
      },
      [B]: () => json(greenOne()),
    });
    renderCompare(A, B);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Сервис временно недоступен, попробуйте позже',
    );
    expect(screen.queryByText('Нечего сравнить')).not.toBeInTheDocument();

    await setup().click(screen.getByRole('button', { name: 'Повторить' }));

    expect(await screen.findByText('Чем отличаются')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('FittingCompare on a wide screen', () => {
  beforeEach(() => {
    api({ [A]: () => json(fitting(A)), [B]: () => json(greenOne()) });
  });

  it('shows two columns with the result inside a recorded-off block and the AI label', async () => {
    const { container } = renderCompare(A, B);
    const [left, right] = await columns();

    expect(left).toHaveAccessibleName('Первая примерка');
    expect(right).toHaveAccessibleName('Вторая примерка');
    expect(screen.getAllByText('Сгенерировано ИИ')).toHaveLength(2);
    const pictures = Array.from(container.querySelectorAll('.mp-block')).filter((block) =>
      block.querySelector('img'),
    );
    expect(pictures).toHaveLength(2);
    for (const block of pictures) {
      expect(block.querySelector('img')).toHaveAttribute('src', RESULT);
    }
  });

  it('keeps the «Открыть» links out of recordings', async () => {
    renderCompare(A, B);
    await columns();

    for (const link of screen.getAllByRole('link', { name: 'Открыть' })) {
      expect(link).toHaveClass('mp-block');
    }
  });

  it('names the item and its colour, marking the colour only where it differs', async () => {
    renderCompare(A, B);
    const [left, right] = await columns();

    expect(left).toHaveTextContent('Рубашка · белый');
    expect(right).toHaveTextContent('Рубашка · зелёный');
    expect(within(left as HTMLElement).getByText('белый').className).toContain('diff');
    expect(within(right as HTMLElement).getByText('зелёный').className).toContain('diff');
  });

  it('does not mark a colour that is the same', async () => {
    api({
      [A]: () => json(fitting(A)),
      [B]: () => json(fitting(B, { photoId: uuid(201) })),
    });
    renderCompare(A, B);
    const [left] = await columns();

    expect(within(left as HTMLElement).getByText('белый').className).not.toContain('diff');
  });

  it('shows the price of each column', async () => {
    renderCompare(A, B);
    const [left, right] = await columns();

    expect(left).toHaveTextContent(/· 900 ₽/);
    expect(right).toHaveTextContent(/· 950 ₽/);
  });

  it('shows «Чем отличаются» with the colour, the photo and the price', async () => {
    renderCompare(A, B);
    await columns();

    const aside = screen.getByRole('complementary');
    expect(within(aside).getByRole('heading', { name: 'Чем отличаются' })).toBeInTheDocument();
    const rows = Array.from(aside.querySelectorAll('dl > div'), (row) => row.textContent);
    expect(rows).toEqual(['Цветбелый / зелёный', 'Фоторазные', `Цена900${nbsp}₽ / 950${nbsp}₽`]);
  });

  it('says the photo is the same when both used one', async () => {
    api({
      [A]: () => json(fitting(A)),
      [B]: () => json(greenOne({ photoId: uuid(200) })),
    });
    renderCompare(A, B);
    await columns();

    expect(screen.getByRole('complementary')).toHaveTextContent('Фотоодно и то же');
  });

  it('«Открыть» links to the fitting and tracks the kind', async () => {
    renderCompare(A, B);
    await columns();
    const [first, second] = screen.getAllByRole('link', { name: 'Открыть' });

    expect(first).toHaveAttribute('href', `/customer/fittings?fitting=${A}`);
    expect(second).toHaveAttribute('href', `/customer/fittings?fitting=${B}`);
    await setup().click(second as HTMLElement);

    expect(mocks.track).toHaveBeenCalledWith(
      'Element Clicked',
      expect.objectContaining({ element: 'compare.open', kind: 'single' }),
    );
  });

  it('«В корзину» shows the stub toast and tracks the click', async () => {
    renderCompare(A, B);
    await columns();

    await setup().click(screen.getAllByRole('button', { name: 'В корзину' })[0] as HTMLElement);

    expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith({
      title: 'В прототипе нет корзины и избранного',
    });
    expect(mocks.track).toHaveBeenCalledWith(
      'Element Clicked',
      expect.objectContaining({ element: 'compare.add-to-cart' }),
    );
  });

  it('shows a look as its items and «Образ» with the item changes by name', async () => {
    const item = (n: number, colourId: number, colour: string) => ({
      ...fitting(A).items[0],
      productId: uuid(100 + n),
      name: `Вещь ${n}`,
      attributeValueId: uuid(300 + colourId),
      colour,
      slot: n === 1 ? 'top' : 'bottom',
    });
    api({
      [A]: () =>
        json(fitting(A, { kind: 'look', items: [item(1, 1, 'белый'), item(2, 5, 'синий')] })),
      [B]: () =>
        json(greenOne({ kind: 'look', items: [item(1, 2, 'зелёный'), item(2, 5, 'синий')] })),
    });
    renderCompare(A, B);
    const [left] = await columns();

    expect(left).toHaveTextContent('Образ');
    expect(screen.getByRole('complementary')).toHaveTextContent('Вещь 1: белый / зелёный');
  });
});

describe('FittingCompare on a phone', () => {
  beforeEach(() => {
    stubPhone();
    api({ [A]: () => json(fitting(A)), [B]: () => json(greenOne()) });
  });

  it('shows «Отличается» and «Фото» in place of the aside rows', async () => {
    renderCompare(A, B);
    await columns();

    const aside = screen.getByRole('complementary');
    expect(within(aside).getByRole('heading', { name: 'Отличия' })).toBeInTheDocument();
    const rows = Array.from(aside.querySelectorAll('dl > div'), (row) => row.textContent);
    expect(rows).toEqual(['Отличаетсяцвет, фото', 'Фоторазные']);
  });

  it('has a capitalised «<Цвет> в корзину» for each and no «Открыть» link', async () => {
    renderCompare(A, B);
    await columns();

    expect(screen.getByRole('button', { name: 'Белый в корзину' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Зелёный в корзину' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Открыть' })).not.toBeInTheDocument();
  });

  it('says «Ничего» differs when it does not, and a plain «В корзину» for a look', async () => {
    api({
      [A]: () => json(fitting(A, { kind: 'look' })),
      [B]: () => json(fitting(B, { kind: 'look' })),
    });
    renderCompare(A, B);
    await columns();

    expect(screen.getByRole('complementary')).toHaveTextContent('Отличаетсяничего');
    expect(screen.getAllByRole('button', { name: 'В корзину' })).toHaveLength(2);
  });

  it('the phone cart button shows the stub toast and tracks the click', async () => {
    renderCompare(A, B);
    await columns();

    await setup().click(screen.getByRole('button', { name: 'Белый в корзину' }));

    expect(mocks.showToast).toHaveBeenCalledOnce();
    expect(mocks.track).toHaveBeenCalledWith(
      'Element Clicked',
      expect.objectContaining({ element: 'compare.add-to-cart' }),
    );
  });
});
