import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FittingHistory } from './fitting-history';

const mocks = vi.hoisted(() => ({ track: vi.fn(), captureException: vi.fn() }));

vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }));

vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  reset: vi.fn(),
  track: mocks.track,
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
const RESULT = 'https://s3.test/keep/users/u/r.webp?X-Amz-Signature=sig';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function fitting(n: number, overrides: Record<string, unknown> = {}) {
  return {
    id: uuid(n),
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
        productId: uuid(100 + n),
        name: `Рубашка ${n}`,
        brand: 'Annen',
        imageUrl: `https://lamoda.test/media/p${n}.jpg`,
        price: 1000,
        finalPrice: 900,
        attributeValueId: null,
        colour: 'белый',
        slot: 'top',
      },
    ],
    promptText: null,
    photoId: uuid(200),
    resultUrl: RESULT,
    createdAt: '2026-10-23T11:06:00.000Z',
    startedAt: '2026-10-23T11:06:00.000Z',
    finishedAt: '2026-10-23T11:07:00.000Z',
    estimatedSeconds: null,
    ...overrides,
  };
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

type Page = { items: unknown[]; total: number | null; nextCursor: string | null };

// Answers GET /fittings by `kind` and `cursor` from `pages`, keyed `<kind or all>:<cursor or ''>`.
function api(pages: Record<string, Page>) {
  fetchMock.mockImplementation((url: unknown) => {
    const { searchParams } = new URL(String(url));
    const key = `${searchParams.get('kind') ?? 'all'}:${searchParams.get('cursor') ?? ''}`;
    const page = pages[key];
    return page ? json(page) : apiError(500, 'INTERNAL');
  });
}

function listCalls() {
  return fetchMock.mock.calls.map(([url]) => new URL(String(url)));
}

function renderHistory(onOpen = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <FittingHistory onOpen={onOpen} />
    </QueryClientProvider>,
  );
  return { ...view, onOpen };
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

function clicked(element: string, properties: Record<string, unknown> = {}) {
  return expect.objectContaining({ element, zone: 'fitting', ...properties });
}

const setup = () => userEvent.setup({ pointerEventsCheck: 0 });

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('FittingHistory list', () => {
  it('shows the count of the first batch and a card per fitting', async () => {
    api({ 'all:': { items: [fitting(1), fitting(2)], total: 5, nextCursor: null } });
    renderHistory();

    expect(await screen.findByText('5 примерок · фото видите только вы')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Открыть примерку' })).toHaveLength(2);
    expect(screen.getByText('Рубашка 1 · белый')).toBeInTheDocument();
  });

  it('says «Фото видите только вы» before the count is known', () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    const { container } = renderHistory();

    expect(screen.getByText('Фото видите только вы')).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('shows the empty list with a link to the catalog and tracks its click', async () => {
    api({ 'all:': { items: [], total: 0, nextCursor: null } });
    renderHistory();

    expect(await screen.findByText('Здесь появятся ваши примерки')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Выбрать вещь для примерки' });
    expect(link).toHaveAttribute('href', '/catalog');

    await setup().click(link);

    expect(mocks.track).toHaveBeenCalledWith(
      'Element Clicked',
      clicked('history.choose-item', { type: 'navigation' }),
    );
  });

  it('shows the error with «Повторить», which reads the list again', async () => {
    fetchMock.mockImplementationOnce(() => apiError(503, 'SERVICE_UNAVAILABLE'));
    api({ 'all:': { items: [fitting(1)], total: 1, nextCursor: null } });
    renderHistory();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Сервис временно недоступен, попробуйте позже',
    );
    await setup().click(screen.getByRole('button', { name: 'Повторить' }));

    expect(await screen.findByText('Рубашка 1 · белый')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('loads the next batch by its cursor with «Показать ещё»', async () => {
    api({
      'all:': { items: [fitting(1)], total: 2, nextCursor: 'c1' },
      'all:c1': { items: [fitting(2)], total: null, nextCursor: null },
    });
    renderHistory();
    await screen.findByText('Рубашка 1 · белый');

    await setup().click(screen.getByRole('button', { name: 'Показать ещё' }));

    expect(await screen.findByText('Рубашка 2 · белый')).toBeInTheDocument();
    expect(listCalls().at(-1)?.searchParams.get('cursor')).toBe('c1');
    expect(screen.queryByRole('button', { name: 'Показать ещё' })).not.toBeInTheDocument();
    expect(screen.getByText('2 примерки · фото видите только вы')).toBeInTheDocument();
  });

  it('puts no result link into an attribute but the images src', async () => {
    api({ 'all:': { items: [fitting(1)], total: 1, nextCursor: null } });
    const { container } = renderHistory();
    await screen.findByText('Рубашка 1 · белый');

    for (const element of container.querySelectorAll('*')) {
      for (const attribute of element.getAttributeNames()) {
        if (element.tagName === 'IMG' && attribute === 'src') continue;
        expect(element.getAttribute(attribute)).not.toContain('X-Amz-Signature');
      }
    }
  });
});

describe('FittingHistory tabs', () => {
  it('asks for each kind and tracks the change', async () => {
    api({
      'all:': { items: [fitting(1)], total: 1, nextCursor: null },
      'single:': { items: [fitting(2)], total: 3, nextCursor: null },
      'look:': {
        items: [fitting(3, { kind: 'look' })],
        total: 4,
        nextCursor: null,
      },
    });
    const user = setup();
    renderHistory();
    await screen.findByText('Рубашка 1 · белый');
    expect(listCalls()[0]?.searchParams.has('kind')).toBe(false);
    expect(mocks.track).not.toHaveBeenCalled();

    await user.click(screen.getByRole('tab', { name: 'Одна вещь' }));
    expect(await screen.findByText('Рубашка 2 · белый')).toBeInTheDocument();
    expect(screen.getByText('3 примерки · фото видите только вы')).toBeInTheDocument();
    expect(mocks.track).toHaveBeenLastCalledWith(
      'Element Clicked',
      clicked('history.tab', { tab: 'single' }),
    );

    await user.click(screen.getByRole('tab', { name: 'Образы' }));
    expect(await screen.findByText('Образ')).toBeInTheDocument();
    expect(mocks.track).toHaveBeenLastCalledWith(
      'Element Clicked',
      clicked('history.tab', { tab: 'look' }),
    );

    await user.click(screen.getByRole('tab', { name: 'Все' }));
    expect(await screen.findByText('Рубашка 1 · белый')).toBeInTheDocument();
    expect(mocks.track).toHaveBeenLastCalledWith(
      'Element Clicked',
      clicked('history.tab', { tab: 'all' }),
    );
    expect(
      listCalls()
        .map((url) => url.searchParams.get('kind'))
        .slice(0, 3),
    ).toEqual([null, 'single', 'look']);
  });

  const emptyPage: Page = { items: [], total: 0, nextCursor: null };

  it('says there are no looks in an empty «Образы» tab, without the whole history empty state', async () => {
    api({
      'all:': { items: [fitting(1)], total: 1, nextCursor: null },
      'look:': emptyPage,
    });
    renderHistory();
    await screen.findByText('Рубашка 1 · белый');

    await setup().click(screen.getByRole('tab', { name: 'Образы' }));

    expect(await screen.findByText('Образов пока нет')).toBeInTheDocument();
    expect(screen.queryByText('Здесь появятся ваши примерки')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Выбрать вещь для примерки' }),
    ).not.toBeInTheDocument();
  });

  it('says there are no single-item fittings in an empty «Одна вещь» tab', async () => {
    api({
      'all:': { items: [fitting(1)], total: 1, nextCursor: null },
      'single:': emptyPage,
    });
    renderHistory();
    await screen.findByText('Рубашка 1 · белый');

    await setup().click(screen.getByRole('tab', { name: 'Одна вещь' }));

    expect(await screen.findByText('Примерок одной вещи пока нет')).toBeInTheDocument();
    expect(screen.queryByText('Здесь появятся ваши примерки')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Выбрать вещь для примерки' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the full empty state with the catalog button in the «Все» tab', async () => {
    api({
      'all:': emptyPage,
      'look:': emptyPage,
    });
    const user = setup();
    renderHistory();
    expect(await screen.findByText('Здесь появятся ваши примерки')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Образы' }));
    await screen.findByText('Образов пока нет');
    await user.click(screen.getByRole('tab', { name: 'Все' }));

    expect(await screen.findByText('Здесь появятся ваши примерки')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Выбрать вещь для примерки' })).toHaveAttribute(
      'href',
      '/catalog',
    );
    expect(screen.queryByText('Образов пока нет')).not.toBeInTheDocument();
  });
});

describe('FittingHistory card menu', () => {
  // Base UI ignores an open that comes soon after the popup of the previous test, so the opening
  // is retried until the menu is there.
  async function openMenu(user: ReturnType<typeof setup>) {
    const trigger = await screen.findByRole('button', { name: 'Действия' });
    await vi.waitFor(async () => {
      if (trigger.getAttribute('aria-expanded') !== 'true') await user.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });
  }

  it('offers «Открыть», «Скачать» and «Удалить» for a result and tracks the «⋯»', async () => {
    api({ 'all:': { items: [fitting(1)], total: 1, nextCursor: null } });
    const user = setup();
    renderHistory();

    await openMenu(user);

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Открыть',
      'Скачать',
      'Удалить',
    ]);
    expect(mocks.track).toHaveBeenCalledWith('Element Clicked', clicked('history.menu'));
  });

  it('«Открыть» opens the fitting and tracks it from the menu', async () => {
    const fittingOne = fitting(1);
    api({ 'all:': { items: [fittingOne], total: 1, nextCursor: null } });
    const user = setup();
    const { onOpen } = renderHistory();

    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Открыть' }));

    expect(onOpen).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: fittingOne.id }));
    expect(mocks.track).toHaveBeenCalledWith(
      'Element Clicked',
      clicked('history.open', {
        type: 'navigation',
        from: 'menu',
        status: 'completed',
        kind: 'single',
      }),
    );
  });

  it('the picture opens the fitting and tracks it from the picture', async () => {
    api({ 'all:': { items: [fitting(1, { kind: 'look' })], total: 1, nextCursor: null } });
    const { onOpen } = renderHistory();

    await setup().click(await screen.findByRole('button', { name: 'Открыть примерку' }));

    expect(onOpen).toHaveBeenCalledOnce();
    expect(mocks.track).toHaveBeenCalledWith(
      'Element Clicked',
      clicked('history.open', { from: 'picture', status: 'completed', kind: 'look' }),
    );
  });

  it('«Скачать» saves the result in a new tab and tracks it', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    api({ 'all:': { items: [fitting(1)], total: 1, nextCursor: null } });
    const user = setup();
    renderHistory();

    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Скачать' }));

    expect(click).toHaveBeenCalledOnce();
    const link = click.mock.contexts[0] as HTMLAnchorElement;
    expect(link.href).toBe(RESULT);
    expect(link.target).toBe('_blank');
    expect(mocks.track).toHaveBeenCalledWith('Element Clicked', clicked('history.download'));
  });

  it('has no «Скачать» for a failed fitting but can delete it', async () => {
    api({
      'all:': {
        items: [fitting(1, { status: 'failed', stage: 'done', resultUrl: null })],
        total: 1,
        nextCursor: null,
      },
    });
    const user = setup();
    renderHistory();

    await openMenu(user);

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Открыть',
      'Удалить',
    ]);
  });

  it.each(['pending', 'processing'] as const)(
    'a %s fitting can only be opened, never deleted (A47)',
    async (status) => {
      api({
        'all:': {
          items: [fitting(1, { status, stage: 'queued', resultUrl: null })],
          total: 1,
          nextCursor: null,
        },
      });
      const user = setup();
      renderHistory();

      await openMenu(user);

      expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Открыть']);
    },
  );

  it('«Удалить» asks to confirm, then deletes and reads the list again', async () => {
    const first = fitting(1);
    api({ 'all:': { items: [first], total: 1, nextCursor: null } });
    const user = setup();
    renderHistory();

    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Удалить' }));
    const dialog = await screen.findByRole('dialog', { name: 'Удалить примерку?' });
    fetchMock.mockImplementation((url: unknown, init?: RequestInit) =>
      init?.method === 'DELETE'
        ? Promise.resolve(new Response(null, { status: 204 }))
        : json({ items: [], total: 0, nextCursor: null }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));

    expect(await screen.findByText('Здесь появятся ваши примерки')).toBeInTheDocument();
    const deleted = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'DELETE',
    );
    expect(deleted).toHaveLength(1);
    expect(new URL(String(deleted[0]?.[0])).pathname).toBe(`/api/fittings/${first.id}`);
  });
});

describe('FittingHistory card sheet on a phone', () => {
  it('opens a sheet with the same actions from the «⋯» and tracks it', async () => {
    stubPhone();
    api({ 'all:': { items: [fitting(1)], total: 1, nextCursor: null } });
    const user = setup();
    renderHistory();

    await user.click(await screen.findByRole('button', { name: 'Действия' }));

    const sheet = await screen.findByRole('dialog', { name: 'Рубашка 1 · белый' });
    expect(
      within(sheet)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(expect.arrayContaining(['Открыть', 'Скачать', 'Удалить']));
    expect(mocks.track).toHaveBeenCalledWith('Element Clicked', clicked('history.menu'));
  });

  it('«Открыть» in the sheet opens the fitting and tracks it from the menu', async () => {
    stubPhone();
    api({ 'all:': { items: [fitting(1)], total: 1, nextCursor: null } });
    const user = setup();
    const { onOpen } = renderHistory();

    await user.click(await screen.findByRole('button', { name: 'Действия' }));
    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByRole('button', { name: 'Открыть' }));

    expect(onOpen).toHaveBeenCalledOnce();
    expect(mocks.track).toHaveBeenCalledWith(
      'Element Clicked',
      clicked('history.open', { from: 'menu', status: 'completed', kind: 'single' }),
    );
  });

  it('has no «Удалить» in the sheet of a running fitting', async () => {
    stubPhone();
    api({
      'all:': {
        items: [fitting(1, { status: 'processing', stage: 'generating', resultUrl: null })],
        total: 1,
        nextCursor: null,
      },
    });
    const user = setup();
    renderHistory();

    await user.click(await screen.findByRole('button', { name: 'Действия' }));
    const sheet = await screen.findByRole('dialog');

    expect(within(sheet).queryByRole('button', { name: 'Удалить' })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: 'Скачать' })).not.toBeInTheDocument();
  });
});
