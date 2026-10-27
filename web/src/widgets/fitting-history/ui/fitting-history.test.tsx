import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FittingHistory, REPEAT_TOAST } from './fitting-history';

const mocks = vi.hoisted(() => ({
  track: vi.fn(),
  captureException: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }));

vi.mock('@/shared/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/ui')>()),
  showToast: mocks.showToast,
}));

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

  it('offers the actions of board 9 for a result and tracks the «⋯»', async () => {
    api({ 'all:': { items: [fitting(1)], total: 1, nextCursor: null } });
    const user = setup();
    renderHistory();

    await openMenu(user);

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Открыть',
      'Примерить ещё раз',
      'Поделиться',
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

  // GET /fittings answers the list; GET /fittings/:id/image answers `image`.
  function apiWithImage(items: unknown[], image: () => Promise<Response>) {
    fetchMock.mockImplementation((url: unknown) =>
      new URL(String(url)).pathname.endsWith('/image')
        ? image()
        : json({ items, total: items.length, nextCursor: null }),
    );
  }

  const imageRequests = () =>
    fetchMock.mock.calls
      .map(([url]) => new URL(String(url)).pathname)
      .filter((path) => path.endsWith('/image'));

  describe('«Скачать» (AC14)', () => {
    beforeEach(() => {
      URL.createObjectURL = vi.fn(() => 'blob:history-1');
      URL.revokeObjectURL = vi.fn();
    });

    it('saves the file the api sends, opens no tab, thanks with a toast and tracks it', async () => {
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      const open = vi.spyOn(window, 'open').mockImplementation(() => null);
      const one = fitting(1);
      apiWithImage([one], () =>
        Promise.resolve(
          new Response(new Uint8Array([1]), {
            headers: {
              'Content-Disposition': 'attachment; filename="primerka-2026-10-23-1407.webp"',
            },
          }),
        ),
      );
      const user = setup();
      renderHistory();

      await openMenu(user);
      await user.click(screen.getByRole('menuitem', { name: 'Скачать' }));

      await vi.waitFor(() =>
        expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith({ title: 'Фото скачано' }),
      );
      expect(imageRequests()).toEqual([`/api/fittings/${one.id}/image`]);
      expect(click).toHaveBeenCalledOnce();
      const link = click.mock.contexts[0] as HTMLAnchorElement;
      expect(link.download).toBe('primerka-2026-10-23-1407.webp');
      expect(link.getAttribute('href')).toBe('blob:history-1');
      expect(link.hasAttribute('target')).toBe(false);
      expect(open).not.toHaveBeenCalled();
      expect(mocks.track).toHaveBeenCalledWith('Element Clicked', clicked('history.download'));
    });

    it('shows no success toast before the file is there', async () => {
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      let answer: (response: Response) => void = () => undefined;
      apiWithImage(
        [fitting(1)],
        () =>
          new Promise<Response>((resolve) => {
            answer = resolve;
          }),
      );
      const user = setup();
      renderHistory();

      await openMenu(user);
      await user.click(screen.getByRole('menuitem', { name: 'Скачать' }));
      await vi.waitFor(() => expect(imageRequests()).toHaveLength(1));
      expect(mocks.showToast).not.toHaveBeenCalled();

      answer(new Response(new Uint8Array([1])));
      await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalledOnce());
    });

    it('is disabled while the file loads: a second click requests and tracks nothing', async () => {
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      let answer: (response: Response) => void = () => undefined;
      apiWithImage(
        [fitting(1)],
        () =>
          new Promise<Response>((resolve) => {
            answer = resolve;
          }),
      );
      const user = setup();
      renderHistory();
      const downloads = () =>
        mocks.track.mock.calls.filter(
          ([event, props]) => event === 'Element Clicked' && props.element === 'history.download',
        );

      await openMenu(user);
      await user.click(screen.getByRole('menuitem', { name: 'Скачать' }));
      await vi.waitFor(() => expect(imageRequests()).toHaveLength(1));
      await openMenu(user);
      const item = screen.getByRole('menuitem', { name: 'Скачать' });
      await vi.waitFor(() => expect(item).toHaveAttribute('aria-disabled', 'true'));
      await user.click(item);

      expect(imageRequests()).toHaveLength(1);
      expect(downloads()).toHaveLength(1);

      answer(new Response(new Uint8Array([1])));
      await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalledOnce());
    });

    it('shows the error’s text in an error toast when the api refuses', async () => {
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      apiWithImage([fitting(1)], () => apiError(404, 'NOT_FOUND'));
      const user = setup();
      renderHistory();

      await openMenu(user);
      await user.click(screen.getByRole('menuitem', { name: 'Скачать' }));

      await vi.waitFor(() =>
        expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith({
          title: 'Не найдено: возможно, запись удалили',
          tone: 'error',
        }),
      );
      expect(click).not.toHaveBeenCalled();
    });
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
      'Примерить ещё раз',
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

type Post = () => Promise<Response>;

// GET /fittings answers the one page; POST /fittings answers `post`.
function apiWithStart(items: unknown[], post: Post) {
  fetchMock.mockImplementation((_url: unknown, init?: RequestInit) =>
    init?.method === 'POST' ? post() : json({ items, total: items.length, nextCursor: null }),
  );
}

function posts() {
  return fetchMock.mock.calls.filter(
    ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
  );
}

function postedBody(): unknown {
  return JSON.parse(String((posts()[0]?.[1] as RequestInit).body));
}

async function openCardMenu(user: ReturnType<typeof setup>, index = 0) {
  await screen.findAllByRole('button', { name: 'Действия' });
  const trigger = screen.getAllByRole('button', { name: 'Действия' })[index] as HTMLElement;
  await vi.waitFor(async () => {
    if (trigger.getAttribute('aria-expanded') !== 'true') await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
}

describe('FittingHistory «Примерить ещё раз» (AC17)', () => {
  const first = fitting(1, {
    items: [{ ...fitting(1).items[0], attributeValueId: uuid(301) }],
    promptText: ' Светлее ',
  });

  it('sends the same photo, items, colours and wishes', async () => {
    apiWithStart([first], () => json({ ...first, status: 'pending', repeated: false }, 201));
    const user = setup();
    renderHistory();

    await openCardMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Примерить ещё раз' }));

    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    expect(new URL(String(posts()[0]?.[0])).pathname).toBe('/api/fittings');
    expect(postedBody()).toEqual({
      photoId: uuid(200),
      kind: 'single',
      items: [{ productId: uuid(101), attributeValueId: uuid(301) }],
      promptText: 'Светлее',
    });
    expect(mocks.track).toHaveBeenCalledWith(
      'Element Clicked',
      clicked('history.repeat', { kind: 'single', status: 'completed' }),
    );
  });

  it('an earlier result says the limit was not spent, and its «Открыть» opens it', async () => {
    const earlier = { ...first, id: uuid(9), repeated: true };
    apiWithStart([first], () => json(earlier, 200));
    const user = setup();
    const { onOpen } = renderHistory();

    await openCardMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Примерить ещё раз' }));

    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalledOnce());
    expect(REPEAT_TOAST).toBe(
      'Такая примерка уже есть — открыли готовый результат. Лимит не потрачен.',
    );
    const toast = mocks.showToast.mock.calls[0]?.[0] as {
      title: string;
      actionLabel: string;
      onAction: () => void;
    };
    expect(toast).toMatchObject({ title: REPEAT_TOAST, actionLabel: 'Открыть' });
    expect(onOpen).not.toHaveBeenCalled();
    expect(mocks.track).toHaveBeenCalledWith(
      'Fitting Completed',
      expect.objectContaining({ repeated: true, duration: 0, counts_against_limit: false }),
    );

    toast.onAction();

    expect(onOpen).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: uuid(9) }));
    expect(mocks.track).toHaveBeenCalledWith(
      'Element Clicked',
      clicked('fitting-toast.open', { kind: 'single' }),
    );
  });

  it('a new start opens its wait at once, with no toast', async () => {
    const started = { ...first, id: uuid(8), status: 'pending', repeated: false };
    apiWithStart([first], () => json(started, 201));
    const user = setup();
    const { onOpen } = renderHistory();

    await openCardMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Примерить ещё раз' }));

    await vi.waitFor(() =>
      expect(onOpen).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: uuid(8) })),
    );
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it('sends one start for a double click while the first is in flight', async () => {
    apiWithStart([first], () => new Promise<Response>(() => undefined));
    const user = setup();
    renderHistory();

    await openCardMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Примерить ещё раз' }));
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    const again = screen.queryByRole('menuitem', { name: 'Примерить ещё раз' });
    if (again) await user.click(again);
    else {
      await openCardMenu(user);
      await user.click(screen.getByRole('menuitem', { name: 'Примерить ещё раз' }));
    }

    expect(posts()).toHaveLength(1);
  });

  it('opens nothing from the picture while the repeat runs, and opens it after the answer', async () => {
    let answer: (response: Response) => void = () => undefined;
    const earlier = { ...first, id: uuid(9), repeated: true };
    apiWithStart(
      [first],
      () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    );
    const user = setup();
    const { onOpen } = renderHistory();

    await openCardMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Примерить ещё раз' }));
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: 'Открыть примерку' }));
    expect(onOpen).not.toHaveBeenCalled();

    answer(await json(earlier, 200));
    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalledOnce());
    expect(onOpen).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Открыть примерку' }));
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: first.id }));
  });

  it('shows the api’s text in an error toast when the limit is reached', async () => {
    apiWithStart([first], () => apiError(409, 'LIMIT_REACHED'));
    const user = setup();
    const { onOpen } = renderHistory();

    await openCardMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Примерить ещё раз' }));

    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalledOnce());
    expect(mocks.showToast).toHaveBeenCalledWith({
      title: expect.stringContaining('лимит'),
      tone: 'error',
    });
    expect(onOpen).not.toHaveBeenCalled();
    expect(mocks.track).toHaveBeenCalledWith('Fitting Refused', {
      kind: 'single',
      reason: 'limit_reached',
    });
  });

  it('tries a failed entry on again with its status in the event', async () => {
    const failed = fitting(1, { status: 'failed', resultUrl: null });
    apiWithStart([failed], () => json({ ...failed, status: 'pending', repeated: false }, 201));
    const user = setup();
    renderHistory();

    await openCardMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Примерить ещё раз' }));

    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    expect(mocks.track).toHaveBeenCalledWith(
      'Element Clicked',
      clicked('history.repeat', { kind: 'single', status: 'failed' }),
    );
  });

  it('is disabled with «Фото удалено» once the photo is gone, and sends nothing', async () => {
    apiWithStart([fitting(1, { photoId: null })], () => json({}, 201));
    const user = setup();
    renderHistory();

    await openCardMenu(user);
    const item = screen.getByRole('menuitem', { name: /Примерить ещё раз/ });

    expect(item).toHaveTextContent('Фото удалено');
    expect(item).toHaveAttribute('aria-disabled', 'true');
    await user.click(item);
    expect(posts()).toHaveLength(0);
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it('sends nothing for «Поделиться»', async () => {
    apiWithStart([first], () => json({}, 201));
    const user = setup();
    renderHistory();

    await openCardMenu(user);
    const share = screen.getByRole('menuitem', { name: 'Поделиться' });
    expect(share).toHaveAttribute('aria-disabled', 'true');
    await user.click(share);

    expect(posts()).toHaveLength(0);
    expect(mocks.track).not.toHaveBeenCalledWith(
      'Element Clicked',
      expect.objectContaining({ element: expect.stringContaining('share') }),
    );
  });

  it('has no «Поделиться» for a failed entry', async () => {
    apiWithStart([fitting(1, { status: 'failed', resultUrl: null })], () => json({}, 201));
    const user = setup();
    renderHistory();

    await openCardMenu(user);

    expect(screen.queryByRole('menuitem', { name: 'Поделиться' })).not.toBeInTheDocument();
  });
});

describe('FittingHistory sheet on a phone: repeat and compare', () => {
  const NOTICE = /с теми же фото, вещами и цветами откроет готовый результат и не потратит лимит/;

  async function openSheet(user: ReturnType<typeof setup>) {
    await user.click(
      (await screen.findAllByRole('button', { name: 'Действия' }))[0] as HTMLElement,
    );
    return await screen.findByRole('dialog');
  }

  it('offers «Сравнить с другой» for a result with the note that a repeat spends nothing', async () => {
    stubPhone();
    apiWithStart([fitting(1), fitting(2)], () => json({}, 201));
    renderHistory();
    const sheet = await openSheet(setup());

    expect(within(sheet).getByRole('button', { name: 'Сравнить с другой' })).toBeInTheDocument();
    expect(within(sheet).getByText(NOTICE)).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Поделиться' })).toBeDisabled();
  });

  it('does not offer «Сравнить с другой» when the tab has one result only', async () => {
    stubPhone();
    apiWithStart([fitting(1), fitting(2, { status: 'failed', resultUrl: null })], () =>
      json({}, 201),
    );
    renderHistory();
    const sheet = await openSheet(setup());

    expect(
      within(sheet).queryByRole('button', { name: 'Сравнить с другой' }),
    ).not.toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Примерить ещё раз' })).toBeEnabled();
  });

  it('has neither the compare nor the note for a failed entry', async () => {
    stubPhone();
    apiWithStart([fitting(1, { status: 'failed', resultUrl: null })], () => json({}, 201));
    renderHistory();
    const sheet = await openSheet(setup());

    expect(within(sheet).getByRole('button', { name: 'Примерить ещё раз' })).toBeEnabled();
    expect(
      within(sheet).queryByRole('button', { name: 'Сравнить с другой' }),
    ).not.toBeInTheDocument();
    expect(within(sheet).queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it('has no note when the photo is gone, and the repeat is disabled with its hint', async () => {
    stubPhone();
    apiWithStart([fitting(1, { photoId: null })], () => json({}, 201));
    renderHistory();
    const sheet = await openSheet(setup());

    const repeat = within(sheet).getByRole('button', { name: /Примерить ещё раз/ });
    expect(repeat).toBeDisabled();
    expect(repeat).toHaveTextContent('Фото удалено');
    expect(within(sheet).queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it('has only «Открыть» for a running entry', async () => {
    stubPhone();
    apiWithStart([fitting(1, { status: 'processing', resultUrl: null })], () => json({}, 201));
    renderHistory();
    const sheet = await openSheet(setup());

    expect(
      within(sheet)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(expect.arrayContaining(['Открыть']));
    expect(within(sheet).queryByRole('button', { name: /Примерить ещё раз/ })).toBeNull();
    expect(within(sheet).queryByRole('button', { name: 'Сравнить с другой' })).toBeNull();
  });

  it('«Сравнить с другой» starts the selection with that entry chosen and tracks it', async () => {
    stubPhone();
    apiWithStart([fitting(1), fitting(2)], () => json({}, 201));
    renderHistory();
    const sheet = await openSheet(setup());

    await setup().click(within(sheet).getByRole('button', { name: 'Сравнить с другой' }));

    expect(await screen.findByText('Выбрано 1 из 2')).toBeInTheDocument();
    const boxes = screen.getAllByRole('checkbox', { name: 'Выбрать для сравнения' });
    expect(boxes.map((box) => box.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    expect(mocks.track).toHaveBeenCalledWith(
      'Element Clicked',
      clicked('history.compare', { from: 'sheet' }),
    );
  });
});

describe('FittingHistory compare selection (AC18)', () => {
  const results = () => [fitting(1), fitting(2), fitting(3)];

  it('offers «Сравнить» only with two results in the tab', async () => {
    apiWithStart([fitting(1), fitting(2, { status: 'failed', resultUrl: null })], () =>
      json({}, 201),
    );
    renderHistory();
    await screen.findByText('Рубашка 1 · белый');

    expect(screen.queryByRole('button', { name: 'Сравнить' })).not.toBeInTheDocument();
  });

  it('does not count a running or failed entry as a result to compare', async () => {
    apiWithStart(
      [
        fitting(1),
        fitting(2, { status: 'processing', resultUrl: null }),
        fitting(3, { status: 'failed', resultUrl: null }),
      ],
      () => json({}, 201),
    );
    renderHistory();
    await screen.findByText('Рубашка 1 · белый');

    expect(screen.queryByRole('button', { name: 'Сравнить' })).not.toBeInTheDocument();
  });

  it('shows the button with two results, tracks it and shows a box per result only', async () => {
    apiWithStart([fitting(1), fitting(2), fitting(3, { status: 'failed', resultUrl: null })], () =>
      json({}, 201),
    );
    renderHistory();
    await setup().click(await screen.findByRole('button', { name: 'Сравнить' }));

    expect(mocks.track).toHaveBeenCalledWith(
      'Element Clicked',
      clicked('history.compare', { from: 'button' }),
    );
    expect(screen.getByText('Выбрано 0 из 2')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox', { name: 'Выбрать для сравнения' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Сравнить' })).toBeDisabled();
  });

  it('the picture chooses instead of opening, and two chosen make the link', async () => {
    apiWithStart(results(), () => json({}, 201));
    const user = setup();
    const { onOpen } = renderHistory();
    await user.click(await screen.findByRole('button', { name: 'Сравнить' }));

    const pictures = screen.getAllByRole('button', { name: 'Выбрать для сравнения' });
    expect(pictures).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Открыть примерку' })).not.toBeInTheDocument();
    await user.click(pictures[0] as HTMLElement);
    expect(pictures[0]).toHaveAccessibleName('Снять выбор для сравнения');
    await user.click(pictures[2] as HTMLElement);

    expect(onOpen).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalledWith(
      'Element Clicked',
      expect.objectContaining({ element: 'history.open' }),
    );
    expect(screen.getByText('Выбрано 2 из 2')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Сравнить' });
    expect(link).toHaveAttribute('href', `/customer/fittings/compare?a=${uuid(1)}&b=${uuid(3)}`);
    expect(link).toHaveClass('mp-block');
  });

  it('dims the box of a third entry and lets a chosen one go', async () => {
    apiWithStart(results(), () => json({}, 201));
    const user = setup();
    renderHistory();
    await user.click(await screen.findByRole('button', { name: 'Сравнить' }));
    const boxes = () => screen.getAllByRole('checkbox', { name: 'Выбрать для сравнения' });

    await user.click(boxes()[0] as HTMLElement);
    await user.click(boxes()[1] as HTMLElement);

    expect(boxes()[2]).toBeDisabled();
    await user.click(boxes()[0] as HTMLElement);
    expect(screen.getByText('Выбрано 1 из 2')).toBeInTheDocument();
    expect(boxes()[2]).toBeEnabled();
  });

  it('«Отмена» leaves the mode, and the pictures open again', async () => {
    apiWithStart(results(), () => json({}, 201));
    const user = setup();
    const { onOpen } = renderHistory();
    await user.click(await screen.findByRole('button', { name: 'Сравнить' }));
    await user.click(
      screen.getAllByRole('checkbox', { name: 'Выбрать для сравнения' })[0] as HTMLElement,
    );

    await user.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сравнить' })).toBeEnabled();
    await user.click(screen.getAllByRole('button', { name: 'Открыть примерку' })[0] as HTMLElement);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('another tab ends the selection mode', async () => {
    fetchMock.mockImplementation((url: unknown) => {
      const kind = new URL(String(url)).searchParams.get('kind');
      const items = kind === 'single' ? [fitting(4), fitting(5)] : results();
      return json({ items, total: items.length, nextCursor: null });
    });
    const user = setup();
    renderHistory();
    await user.click(await screen.findByRole('button', { name: 'Сравнить' }));
    await user.click(
      screen.getAllByRole('checkbox', { name: 'Выбрать для сравнения' })[0] as HTMLElement,
    );
    expect(screen.getByText('Выбрано 1 из 2')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Одна вещь' }));
    await screen.findByText('Рубашка 4 · белый');

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/Выбрано/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сравнить' })).toBeEnabled();
  });

  it('keeps the count and the link right when a chosen entry is deleted', async () => {
    let gone = false;
    fetchMock.mockImplementation((_url: unknown, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        gone = true;
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      const items = gone ? [fitting(1), fitting(3)] : results();
      return json({ items, total: items.length, nextCursor: null });
    });
    const user = setup();
    renderHistory();
    await user.click(await screen.findByRole('button', { name: 'Сравнить' }));
    const boxes = () => screen.getAllByRole('checkbox', { name: 'Выбрать для сравнения' });
    await user.click(boxes()[0] as HTMLElement);
    await user.click(boxes()[1] as HTMLElement);
    expect(screen.getByText('Выбрано 2 из 2')).toBeInTheDocument();

    const triggers = screen.getAllByRole('button', { name: 'Действия' });
    await vi.waitFor(async () => {
      const trigger = triggers[1] as HTMLElement;
      if (trigger.getAttribute('aria-expanded') !== 'true') await user.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });
    await user.click(screen.getByRole('menuitem', { name: 'Удалить' }));
    const dialog = await screen.findByRole('dialog', { name: 'Удалить примерку?' });
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));

    expect(await screen.findByText('Выбрано 1 из 2')).toBeInTheDocument();
    expect(screen.queryByText('Рубашка 2 · белый')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сравнить' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'Сравнить' })).not.toBeInTheDocument();
    expect(document.querySelector(`a[href*="${uuid(2)}"]`)).toBeNull();
  });

  it('a running entry’s picture still opens it in the selection mode', async () => {
    apiWithStart(
      [fitting(1), fitting(2), fitting(3, { status: 'processing', resultUrl: null })],
      () => json({}, 201),
    );
    const user = setup();
    const { onOpen } = renderHistory();
    await user.click(await screen.findByRole('button', { name: 'Сравнить' }));

    const pictures = screen.getAllByRole('button', { name: 'Открыть примерку' });
    expect(pictures).toHaveLength(1);
    await user.click(pictures[0] as HTMLElement);

    expect(onOpen).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: uuid(3) }));
  });
});
