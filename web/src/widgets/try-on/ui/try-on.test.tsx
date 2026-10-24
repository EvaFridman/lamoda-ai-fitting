import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isFittingShown, type Fitting } from '@/entities/fitting';
import type { SessionState } from '@/entities/session';

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

const USER = 'user-try-on';
const PRODUCT = '00000000-0000-4000-8000-0000000000a1';
const RED = '00000000-0000-4000-8000-0000000000c1';
const BLUE = '00000000-0000-4000-8000-0000000000c2';
const PHOTO_A = '00000000-0000-4000-8000-0000000000f1';
const PHOTO_B = '00000000-0000-4000-8000-0000000000f2';
const ONE_TIME = '00000000-0000-4000-8000-0000000000f3';
const RUNNING = '00000000-0000-4000-8000-0000000000e1';
const NEXT = '00000000-0000-4000-8000-0000000000e2';
const PARENT = '00000000-0000-4000-8000-0000000000e3';
const DATE = '2026-10-20T12:00:00.000Z';

const fetchMock = vi.fn();

interface Api {
  photos: unknown[];
  quota: { limit: number; used: number; left: number; renewsAt: string };
  fittings: Map<string, Fitting>;
  // What POST /fittings and POST /fittings/:id/regenerate answer.
  started: () => Response;
  upload: () => Response;
}

let api: Api;

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

function fitting(patch: Partial<Fitting> = {}): Fitting {
  return {
    id: RUNNING,
    kind: 'single',
    parentId: null,
    status: 'processing',
    stage: 'generating',
    failureCode: null,
    countsAgainstLimit: true,
    regenerationFree: true,
    model: 'gpt-image-2',
    items: [
      {
        productId: PRODUCT,
        name: 'Сарафан',
        brand: 'Brand',
        imageUrl: 'https://cdn.example/dress.jpg',
        price: 5000,
        finalPrice: 4500,
        attributeValueId: RED,
        colour: 'Красный',
      },
    ],
    photoId: PHOTO_A,
    resultUrl: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    estimatedSeconds: 20,
    ...patch,
  };
}

const product = {
  id: PRODUCT,
  article: 'A-1',
  name: 'Сарафан',
  brand: { id: PRODUCT, name: 'Brand' },
  category: { id: PRODUCT, name: 'Платья', slug: 'dresses' },
  image: { url: 'https://cdn.example/dress.jpg' },
  price: 5000,
  discount: 10,
  finalPrice: 4500,
  rating: null,
  createdAt: DATE,
  updatedAt: DATE,
  description: null,
  images: [],
  variations: [{ id: PRODUCT, size: 'M', stock: 3 }],
  attributes: [
    {
      attribute: { id: PRODUCT, name: 'Цвет' },
      values: [
        { id: RED, value: 'Красный', colorHex: '#FF0000' },
        { id: BLUE, value: 'Синий', colorHex: '#0000FF' },
      ],
    },
  ],
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

function failure(status: number, code: string) {
  return json(status, { error: { code, message: 'm', details: [] } });
}

function startedResponse(patch: Partial<Fitting> = {}) {
  return json(201, { ...fitting({ id: NEXT, ...patch }), repeated: false });
}

function route(url: string, init?: RequestInit): Response {
  const { pathname } = new URL(url);
  const method = init?.method ?? 'GET';
  if (pathname === '/api/me/photos' && method === 'GET') return json(200, api.photos);
  if (pathname === '/api/me/photos' && method === 'POST') return api.upload();
  if (pathname.startsWith('/api/me/photos/transient/')) return new Response(null, { status: 204 });
  if (pathname === '/api/me/fitting-quota') return json(200, api.quota);
  if (pathname === `/api/products/${PRODUCT}`) return json(200, product);
  if (pathname === '/api/fittings' && method === 'POST') return api.started();
  if (pathname === '/api/fittings') {
    return json(200, { items: [...api.fittings.values()], nextCursor: null, total: 0 });
  }
  const regenerate = /^\/api\/fittings\/([^/]+)\/regenerate$/.exec(pathname);
  if (regenerate && method === 'POST') return api.started();
  const one = /^\/api\/fittings\/([^/]+)$/.exec(pathname);
  const found = one?.[1] ? api.fittings.get(one[1]) : undefined;
  if (found) return json(200, found);
  return failure(404, 'NOT_FOUND');
}

function posts() {
  return fetchMock.mock.calls
    .map(([url, init]) => ({ path: new URL(String(url)).pathname, init: init as RequestInit }))
    .filter(({ init }) => init?.method === 'POST');
}

function deletes() {
  return fetchMock.mock.calls
    .map(([url, init]) => ({ path: new URL(String(url)).pathname, init: init as RequestInit }))
    .filter(({ init }) => init?.method === 'DELETE');
}

function bodyOf(index: number) {
  return JSON.parse(String(posts()[index]?.init.body));
}

function renderTryOn(props: { productId?: string; fittingId?: string } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = vi.fn();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <TryOn {...props} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose, ...view };
}

// Base UI turns pointer events off on the page while a modal is open.
const setup = () => userEvent.setup({ pointerEventsCheck: 0 });
const start = () => screen.getByRole('button', { name: /Примерить$/ });

beforeEach(() => {
  vi.clearAllMocks();
  api = {
    photos: [photo(PHOTO_A), photo(PHOTO_B, { isDefault: true })],
    quota: { limit: 20, used: 3, left: 17, renewsAt: '2026-10-31T21:00:00.000Z' },
    fittings: new Map(),
    started: () => startedResponse(),
    upload: () => json(201, photo(ONE_TIME, { transient: true })),
  };
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string, init?: RequestInit) =>
    Promise.resolve(route(String(url), init)),
  );
  vi.stubGlobal('fetch', fetchMock);
  mocks.session = { status: 'signed-in', user: { id: USER, email: 'a@example.com', name: 'A' } };
  window.localStorage.setItem(`fitting-photo-consent:${USER}`, '1');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('TryOn picker', () => {
  it('opens as «Онлайн-примерка» with the default photo chosen and the item shown', async () => {
    renderTryOn({ productId: PRODUCT });

    expect(await screen.findByRole('dialog', { name: 'Онлайн-примерка' })).toBeInTheDocument();
    const chosen = await screen.findByRole('img', { name: 'Ваше фото' });
    expect(chosen).toHaveAttribute('src', expect.stringContaining(PHOTO_B));
    expect(await screen.findByRole('button', { name: 'Фото 2, по умолчанию' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Фото 1' })).toHaveAttribute('aria-pressed', 'false');
    expect(await screen.findByText('Сарафан')).toBeInTheDocument();
    expect(await screen.findByText('Осталось 17 примерок в этом месяце')).toBeInTheDocument();
    expect(start()).toBeEnabled();
  });

  it('chooses another photo from the strip', async () => {
    const user = setup();
    renderTryOn({ productId: PRODUCT });

    await user.click(await screen.findByRole('button', { name: 'Фото 1' }));

    expect(screen.getByRole('img', { name: 'Ваше фото' })).toHaveAttribute(
      'src',
      expect.stringContaining(PHOTO_A),
    );
    expect(screen.getByRole('button', { name: 'Фото 1' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps «Примерить» off while there is no photo', async () => {
    api.photos = [];
    renderTryOn({ productId: PRODUCT });

    await screen.findByText('Осталось 17 примерок в этом месяце');
    expect(start()).toBeDisabled();
  });

  it('starts the try-on of the default photo and the first colour, then shows the wait (AC5, AC10)', async () => {
    const user = setup();
    renderTryOn({ productId: PRODUCT });
    await screen.findByRole('img', { name: 'Ваше фото' });
    await vi.waitFor(() => expect(start()).toBeEnabled());

    await user.click(start());

    expect(await screen.findByText('Примеряем…')).toBeInTheDocument();
    expect(posts()).toHaveLength(1);
    expect(posts()[0]?.path).toBe('/api/fittings');
    expect(bodyOf(0)).toEqual({
      photoId: PHOTO_B,
      kind: 'single',
      items: [{ productId: PRODUCT, attributeValueId: RED }],
    });
    expect(screen.getByText(/Осталось около \d+ секунд/)).toBeInTheDocument();
    expect(mocks.track).toHaveBeenCalledWith(
      'Fitting Started',
      expect.objectContaining({ source: 'picker', kind: 'single' }),
    );
  });

  it('starts one fitting for a double click (AC12)', async () => {
    api.started = () => startedResponse();
    const user = setup();
    renderTryOn({ productId: PRODUCT });
    await vi.waitFor(() => expect(start()).toBeEnabled());

    await user.dblClick(start());

    await screen.findByText('Примеряем…');
    expect(posts()).toHaveLength(1);
  });

  it('shows the limit card when the api refuses at the limit (AC19)', async () => {
    api.started = () => failure(409, 'LIMIT_REACHED');
    const user = setup();
    renderTryOn({ productId: PRODUCT });
    await vi.waitFor(() => expect(start()).toBeEnabled());

    await user.click(start());

    expect(
      await screen.findByRole('heading', { name: 'Примерки на этот месяц закончились' }),
    ).toBeInTheDocument();
    expect(screen.getByText('1 ноября')).toBeInTheDocument();
    expect(mocks.track).toHaveBeenCalledWith('Fitting Refused', {
      kind: 'single',
      reason: 'limit_reached',
    });
  });

  it('shows the limit card at once when none are left, without a start', async () => {
    api.quota = { ...api.quota, used: 20, left: 0 };
    renderTryOn({ productId: PRODUCT });

    expect(
      await screen.findByRole('heading', { name: 'Примерки на этот месяц закончились' }),
    ).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it('shows another failure of the start under the picker and lets it be tried again', async () => {
    api.started = () => failure(503, 'SERVICE_UNAVAILABLE');
    const user = setup();
    renderTryOn({ productId: PRODUCT });
    await vi.waitFor(() => expect(start()).toBeEnabled());

    await user.click(start());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Сервис временно недоступен, попробуйте позже',
    );
    expect(start()).toBeEnabled();
  });
});

describe('TryOn one-time photo', () => {
  async function uploadOneTime(user: ReturnType<typeof setup>) {
    await user.click(await screen.findByRole('switch', { name: /Сохранить фото/ }));
    const input = document.querySelector<HTMLInputElement>('input[type="file"]:not([capture])');
    await user.upload(input!, new File(['x'], 'me.jpg', { type: 'image/jpeg' }));
    await vi.waitFor(() =>
      expect(posts().some(({ path }) => path === '/api/me/photos')).toBe(true),
    );
  }

  it('uploads with save=false (AC6) and chooses the new photo', async () => {
    const user = setup();
    renderTryOn({ productId: PRODUCT });

    await uploadOneTime(user);

    const upload = posts().find(({ path }) => path === '/api/me/photos');
    expect((upload?.init.body as FormData).get('save')).toBe('false');
    await vi.waitFor(() =>
      expect(screen.getByRole('img', { name: 'Ваше фото' })).toHaveAttribute(
        'src',
        expect.stringContaining(ONE_TIME),
      ),
    );
  });

  it('deletes the one-time photo when the window closes', async () => {
    const user = setup();
    const { unmount } = renderTryOn({ productId: PRODUCT });
    await uploadOneTime(user);
    await vi.waitFor(() =>
      expect(screen.getByRole('img', { name: 'Ваше фото' })).toHaveAttribute(
        'src',
        expect.stringContaining(ONE_TIME),
      ),
    );
    expect(deletes()).toHaveLength(0);

    unmount();

    await vi.waitFor(() => expect(deletes()).toHaveLength(1));
    expect(deletes()[0]?.path).toBe(`/api/me/photos/transient/${ONE_TIME}`);
  });

  it('deletes nothing when no one-time photo was uploaded', () => {
    const { unmount } = renderTryOn({ productId: PRODUCT });

    unmount();

    expect(deletes()).toHaveLength(0);
  });

  it('does not report a 404 of the deletion', async () => {
    const user = setup();
    const { unmount } = renderTryOn({ productId: PRODUCT });
    await uploadOneTime(user);
    await vi.waitFor(() =>
      expect(screen.getByRole('img', { name: 'Ваше фото' })).toHaveAttribute(
        'src',
        expect.stringContaining(ONE_TIME),
      ),
    );
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      Promise.resolve(
        init?.method === 'DELETE' ? failure(404, 'NOT_FOUND') : route(String(url), init),
      ),
    );

    unmount();

    await vi.waitFor(() => expect(deletes()).toHaveLength(1));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.captureException).not.toHaveBeenCalled();
  });
});

describe('TryOn with a fitting', () => {
  it('opens a running fitting on the wait and marks it shown, so no toast follows (AC10)', async () => {
    api.fittings.set(RUNNING, fitting());
    const { unmount } = renderTryOn({ fittingId: RUNNING });

    expect(await screen.findByText('Примеряем…')).toBeInTheDocument();
    expect(isFittingShown(RUNNING)).toBe(true);

    unmount();
    expect(isFittingShown(RUNNING)).toBe(false);
  });

  it('closes the window from the wait while the fitting goes on', async () => {
    api.fittings.set(RUNNING, fitting());
    const user = setup();
    const { onClose } = renderTryOn({ fittingId: RUNNING });

    await user.click(await screen.findByRole('button', { name: 'Закрыть и продолжить покупки' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', async () => {
    api.fittings.set(RUNNING, fitting());
    const user = setup();
    const { onClose } = renderTryOn({ fittingId: RUNNING });
    await screen.findByText('Примеряем…');

    await user.keyboard('{Escape}');

    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows the result when the polled fitting completes, and sends its end once', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.fittings.set(RUNNING, fitting());
    renderTryOn({ fittingId: RUNNING });
    await screen.findByText('Примеряем…');

    api.fittings.set(
      RUNNING,
      fitting({
        status: 'completed',
        stage: 'done',
        resultUrl: 'https://s3.test/keep/users/u/result.webp?X-Amz-Signature=abc',
        finishedAt: new Date().toISOString(),
        estimatedSeconds: null,
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });

    expect(await screen.findByText('Сгенерировано ИИ')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Сгенерированное изображение: вы в вещи «Сарафан»' }),
    ).toHaveAttribute('src', expect.stringContaining('result.webp'));
    expect(screen.queryByText('Примеряем…')).not.toBeInTheDocument();
    const completed = mocks.track.mock.calls.filter(([event]) => event === 'Fitting Completed');
    expect(completed).toHaveLength(1);
  });

  it('shows a completed fitting as a result with the colours and the regeneration (AC5, AC7, AC8)', async () => {
    api.fittings.set(
      RUNNING,
      fitting({
        status: 'completed',
        stage: 'done',
        resultUrl: 'https://s3.test/keep/users/u/result.webp?X-Amz-Signature=abc',
        finishedAt: DATE,
      }),
    );
    renderTryOn({ fittingId: RUNNING });

    expect(await screen.findByText('Сгенерировано ИИ')).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Примерить другой цвет' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Хотите что-то поменять в образе?' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Примерить на другом фото' })).toBeInTheDocument();
    expect(screen.getByText('Осталось 17')).toBeInTheDocument();
  });

  it('tries another colour over the old result, which stays with a loader (board 7.2, AC7)', async () => {
    api.fittings.set(
      RUNNING,
      fitting({
        status: 'completed',
        stage: 'done',
        resultUrl: 'https://s3.test/keep/users/u/result.webp?X-Amz-Signature=abc',
        finishedAt: DATE,
      }),
    );
    api.started = () =>
      startedResponse({
        items: [{ ...fitting().items[0]!, attributeValueId: BLUE, colour: 'Синий' }],
      });
    const user = setup();
    renderTryOn({ fittingId: RUNNING });
    await screen.findByText('Сгенерировано ИИ');

    await user.click(await screen.findByRole('button', { name: 'Синий' }));

    expect(posts()).toHaveLength(1);
    expect(bodyOf(0)).toEqual({
      photoId: PHOTO_A,
      kind: 'single',
      items: [{ productId: PRODUCT, attributeValueId: BLUE }],
    });
    expect(await screen.findByText(/Примеряем Синий…/)).toBeInTheDocument();
    expect(screen.getByText('Пока идёт примерка, другие цвета недоступны')).toBeInTheDocument();
    expect(screen.queryByText('Сгенерировано ИИ')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Примерить на другом фото' })).toBeDisabled();
  });

  it('shows the error card of a failed fitting and retries it with the same photo and colour (AC11)', async () => {
    api.fittings.set(
      RUNNING,
      fitting({
        status: 'failed',
        stage: 'done',
        failureCode: 'model_timeout',
        countsAgainstLimit: false,
      }),
    );
    const user = setup();
    renderTryOn({ fittingId: RUNNING });

    expect(
      await screen.findByRole('heading', { name: 'Не получилось примерить' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Примерка не списана · осталось 17')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await screen.findByText('Примеряем…')).toBeInTheDocument();
    expect(posts()[0]?.path).toBe('/api/fittings');
    expect(bodyOf(0)).toEqual({
      photoId: PHOTO_A,
      kind: 'single',
      items: [{ productId: PRODUCT, attributeValueId: RED }],
    });
    expect(mocks.track).toHaveBeenCalledWith(
      'Fitting Started',
      expect.objectContaining({ source: 'retry' }),
    );
  });

  it('does not say a failed fitting that stays spent was not spent', async () => {
    api.fittings.set(
      RUNNING,
      fitting({
        status: 'failed',
        stage: 'done',
        failureCode: 'model_timeout',
        countsAgainstLimit: true,
      }),
    );
    renderTryOn({ fittingId: RUNNING });

    await screen.findByRole('heading', { name: 'Не получилось примерить' });
    expect(screen.queryByText(/Примерка не списана/)).not.toBeInTheDocument();
  });

  it('retries a failed regeneration by regenerating its parent again', async () => {
    api.fittings.set(
      RUNNING,
      fitting({ status: 'failed', stage: 'done', failureCode: 'provider_error', parentId: PARENT }),
    );
    const user = setup();
    renderTryOn({ fittingId: RUNNING });

    await user.click(await screen.findByRole('button', { name: 'Попробовать ещё раз' }));

    await screen.findByText('Примеряем…');
    expect(posts()[0]?.path).toBe(`/api/fittings/${PARENT}/regenerate`);
    expect(bodyOf(0)).toEqual({ reasons: ['other'] });
    expect(mocks.track).toHaveBeenCalledWith(
      'Fitting Started',
      expect.objectContaining({ source: 'retry' }),
    );
  });

  it('shows the limit card when the retry meets the limit', async () => {
    api.fittings.set(
      RUNNING,
      fitting({ status: 'failed', stage: 'done', failureCode: 'model_timeout' }),
    );
    api.started = () => failure(409, 'LIMIT_REACHED');
    const user = setup();
    renderTryOn({ fittingId: RUNNING });

    await user.click(await screen.findByRole('button', { name: 'Попробовать ещё раз' }));

    expect(
      await screen.findByRole('heading', { name: 'Примерки на этот месяц закончились' }),
    ).toBeInTheDocument();
  });

  it('shows the text of a failed retry on the error card', async () => {
    api.fittings.set(
      RUNNING,
      fitting({ status: 'failed', stage: 'done', failureCode: 'model_timeout' }),
    );
    api.started = () => failure(503, 'SERVICE_UNAVAILABLE');
    const user = setup();
    renderTryOn({ fittingId: RUNNING });

    await user.click(await screen.findByRole('button', { name: 'Попробовать ещё раз' }));

    expect(
      await screen.findByText('Сервис временно недоступен, попробуйте позже'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Не получилось примерить' })).toBeInTheDocument();
  });

  it('shows the moderation card with «Другое фото», which goes back to the picker (AC11)', async () => {
    api.fittings.set(
      RUNNING,
      fitting({ status: 'failed', stage: 'done', failureCode: 'moderation' }),
    );
    const user = setup();
    renderTryOn({ fittingId: RUNNING });

    expect(await screen.findByText('Результат скрыт')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Другое фото' }));

    expect(
      await screen.findByText('Изображение приблизительное: модель ещё учится'),
    ).toBeInTheDocument();
  });

  it('goes back to the picker from «Примерить на другом фото»', async () => {
    api.fittings.set(
      RUNNING,
      fitting({
        status: 'completed',
        stage: 'done',
        resultUrl: 'https://s3.test/keep/users/u/result.webp?X-Amz-Signature=abc',
        finishedAt: DATE,
      }),
    );
    const user = setup();
    renderTryOn({ fittingId: RUNNING });

    await user.click(await screen.findByRole('button', { name: 'Примерить на другом фото' }));

    expect(
      await screen.findByText('Изображение приблизительное: модель ещё учится'),
    ).toBeInTheDocument();
  });

  it('shows the text of a fitting that cannot be read, with a way back to the picker', async () => {
    renderTryOn({ fittingId: NEXT });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не найдено: возможно, запись удалили',
    );
    expect(screen.getByRole('button', { name: 'Выбрать фото' })).toBeDisabled();
  });

  const COMPLETED = {
    status: 'completed' as const,
    stage: 'done' as const,
    resultUrl: 'https://s3.test/keep/users/u/result.webp?X-Amz-Signature=abc',
    finishedAt: DATE,
  };

  it('keeps the colour of the shown result in the picker it goes back to', async () => {
    api.fittings.set(
      RUNNING,
      fitting({
        ...COMPLETED,
        items: [{ ...fitting().items[0]!, attributeValueId: BLUE, colour: 'Синий' }],
      }),
    );
    const user = setup();
    renderTryOn({ fittingId: RUNNING });
    await screen.findByRole('heading', { name: 'Примерить другой цвет' });
    await user.click(screen.getByRole('button', { name: 'Примерить на другом фото' }));
    await vi.waitFor(() => expect(start()).toBeEnabled());

    await user.click(start());

    await screen.findByText('Примеряем…');
    expect(bodyOf(0).items).toEqual([{ productId: PRODUCT, attributeValueId: BLUE }]);
  });

  it('shows a regeneration as the plain wait, not over the old result', async () => {
    api.fittings.set(RUNNING, fitting(COMPLETED));
    api.started = () => startedResponse({ parentId: RUNNING });
    const user = setup();
    renderTryOn({ fittingId: RUNNING });

    await user.click(
      await screen.findByRole('button', { name: 'Хотите что-то поменять в образе?' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Лицо' }));
    await user.click(screen.getByRole('button', { name: /Перегенерировать/ }));

    expect(await screen.findByText('Примеряем…')).toBeInTheDocument();
    expect(posts()[0]?.path).toBe(`/api/fittings/${RUNNING}/regenerate`);
    expect(bodyOf(0)).toEqual({ reasons: ['face'] });
    expect(screen.queryByText(/Примеряем Красный/)).not.toBeInTheDocument();
  });
});

describe('TryOn focus', () => {
  // Lets the window's own timer (set from a mutation or a focus change) run.
  async function settle() {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }

  it('keeps the focus inside the window when the focused button goes with a screen change', async () => {
    api.fittings.set(
      RUNNING,
      fitting({ status: 'failed', stage: 'done', failureCode: 'model_timeout' }),
    );
    const user = setup();
    renderTryOn({ fittingId: RUNNING });
    const retry = await screen.findByRole('button', { name: 'Попробовать ещё раз' });
    await user.click(retry);

    await screen.findByText('Примеряем…');
    expect(retry).not.toBeInTheDocument();

    await vi.waitFor(() => {
      expect(document.activeElement).not.toBe(document.body);
      expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
    });
  });

  it('keeps the focus inside the window when the regeneration sheet closes into the wait', async () => {
    api.fittings.set(RUNNING, fitting(COMPLETED_RESULT));
    api.started = () => startedResponse({ parentId: RUNNING });
    const user = setup();
    renderTryOn({ fittingId: RUNNING });
    await user.click(
      await screen.findByRole('button', { name: 'Хотите что-то поменять в образе?' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Лицо' }));
    await user.click(screen.getByRole('button', { name: /Перегенерировать/ }));

    await screen.findByText('Примеряем…');

    await vi.waitFor(() => {
      expect(document.activeElement).not.toBe(document.body);
      expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
    });
  });

  const outerPopup = () => screen.getByRole('dialog', { name: 'Онлайн-примерка', hidden: true });

  it('gives a focus lost to the page body back to the try-on window itself', async () => {
    renderTryOn({ productId: PRODUCT });
    const other = await screen.findByRole('button', { name: 'Фото 1' });
    other.focus();

    other.blur();
    expect(document.body).toHaveFocus();
    await settle();

    expect(outerPopup()).toHaveFocus();
  });

  it('does not pull the focus to the try-on window while the first-upload tips are open over it', async () => {
    window.localStorage.clear();
    const user = setup();
    renderTryOn({ productId: PRODUCT });
    await user.click((await screen.findAllByRole('button', { name: 'Загрузить фото' }))[1]!);
    const tips = await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });
    expect(outerPopup()).toHaveAttribute('data-nested-dialog-open');

    (document.activeElement as HTMLElement).blur();
    expect(document.body).toHaveFocus();
    await settle();

    expect(outerPopup()).not.toHaveFocus();
    expect(tips).toBeInTheDocument();
  });

  it('does not pull the focus to the try-on window while «Что поменять?» is open over it', async () => {
    api.fittings.set(RUNNING, fitting(COMPLETED_RESULT));
    const user = setup();
    renderTryOn({ fittingId: RUNNING });
    await user.click(
      await screen.findByRole('button', { name: 'Хотите что-то поменять в образе?' }),
    );
    await screen.findByRole('button', { name: 'Лицо' });
    await vi.waitFor(() => expect(outerPopup()).toHaveAttribute('data-nested-dialog-open'));

    (document.activeElement as HTMLElement).blur();
    expect(document.body).toHaveFocus();
    await settle();

    expect(outerPopup()).not.toHaveFocus();
  });

  it('does not take the focus from another control when the page changes', async () => {
    renderTryOn({ productId: PRODUCT });
    const other = await screen.findByRole('button', { name: 'Фото 1' });
    other.focus();
    expect(other).toHaveFocus();

    document.body.append(document.createElement('div'));
    await settle();

    expect(other).toHaveFocus();
  });
});

const COMPLETED_RESULT = {
  status: 'completed' as const,
  stage: 'done' as const,
  resultUrl: 'https://s3.test/keep/users/u/result.webp?X-Amz-Signature=abc',
  finishedAt: DATE,
};

describe('TryOn picker details', () => {
  it('deletes every one-time photo uploaded in the window, not only the last', async () => {
    let count = 0;
    api.upload = () => {
      count += 1;
      return json(201, photo(`00000000-0000-4000-8000-00000000010${count}`, { transient: true }));
    };
    const user = setup();
    const { unmount } = renderTryOn({ productId: PRODUCT });
    await user.click(await screen.findByRole('switch', { name: /Сохранить фото/ }));
    for (const name of ['one.jpg', 'two.jpg']) {
      const input = document.querySelector<HTMLInputElement>('input[type="file"]:not([capture])');
      await user.upload(input!, new File(['x'], name, { type: 'image/jpeg' }));
      await vi.waitFor(() => expect(posts()).toHaveLength(count));
    }
    await vi.waitFor(() => expect(count).toBe(2));
    await vi.waitFor(() =>
      expect(screen.getByRole('img', { name: 'Ваше фото' })).toHaveAttribute(
        'src',
        expect.stringContaining('000000000102'),
      ),
    );

    unmount();

    await vi.waitFor(() => expect(deletes()).toHaveLength(2));
    expect(
      deletes()
        .map(({ path }) => path)
        .sort(),
    ).toEqual([
      '/api/me/photos/transient/00000000-0000-4000-8000-000000000101',
      '/api/me/photos/transient/00000000-0000-4000-8000-000000000102',
    ]);
  });

  it('shows a product that cannot be read with «Повторить», which reads it again', async () => {
    let productReads = 0;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (new URL(String(url)).pathname === `/api/products/${PRODUCT}`) {
        productReads += 1;
        return Promise.resolve(failure(503, 'SERVICE_UNAVAILABLE'));
      }
      return Promise.resolve(route(String(url), init));
    });
    const user = setup();
    renderTryOn({ productId: PRODUCT });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Сервис временно недоступен, попробуйте позже',
    );
    expect(screen.queryByRole('button', { name: /Примерить$/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Повторить' }));

    await vi.waitFor(() => expect(productReads).toBe(2));
  });
});
