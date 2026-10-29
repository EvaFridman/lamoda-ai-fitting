import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isFittingShown, type Fitting } from '@/entities/fitting';
import { useRoomStore } from '@/entities/fitting-room';
import type { SessionState } from '@/entities/session';
import { ToastProvider } from '@/shared/ui';

const mocks = vi.hoisted(() => ({
  track: vi.fn(),
  captureException: vi.fn(),
  session: { status: 'pending' } as SessionState,
  heicToJpeg: vi.fn(),
}));

vi.mock('@/features/upload-photo/lib/heic', () => ({ heicToJpeg: mocks.heicToJpeg }));

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
  quota: { limit: number; used: number; left: number; renewsAt: string; unseen: number };
  fittings: Map<string, Fitting>;
  // What POST /fittings and POST /fittings/:id/regenerate answer.
  started: () => Response;
  upload: () => Response;
  // The slot of the product's category in the fitting room; null: none.
  slot: string | null;
  // The items of the fitting room as GET answers it.
  room: unknown[];
  // The reads of the product and of the categories answer 503.
  productFails: boolean;
  categoriesFail: boolean;
  // The photo consents' version of GET /me (spec 0023 Y1): 1 given, null none.
  consent: number | null;
  // What GET /fittings/:id/image answers (spec 0023 Y8).
  image: () => Promise<Response>;
}

let api: Api;

function me() {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    phone: null,
    email: 'a@example.com',
    firstName: 'А',
    lastName: null,
    patronymic: null,
    dateOfBirth: null,
    gender: null,
    fittingProfileImageKey: null,
    fittingProfileImageUrl: null,
    photoConsentVersion: api.consent,
    createdAt: DATE,
    updatedAt: DATE,
  };
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

function fitting(patch: Partial<Fitting> = {}): Fitting {
  return {
    id: RUNNING,
    kind: 'single',
    parentId: null,
    status: 'processing',
    stage: 'generating',
    failureCode: null,
    failureCategory: null,
    failureStage: null,
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
        slot: 'top',
      },
    ],
    promptText: null,
    photoId: PHOTO_A,
    photoTransient: false,
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

function route(url: string, init?: RequestInit): Response | Promise<Response> {
  const { pathname } = new URL(url);
  const method = init?.method ?? 'GET';
  if (/^\/api\/fittings\/[^/]+\/image$/.test(pathname)) return api.image();
  if (pathname === '/api/me' && method === 'GET') return json(200, me());
  if (pathname === '/api/me/photos' && method === 'GET') return json(200, api.photos);
  if (pathname === '/api/me/photos' && method === 'POST') return api.upload();
  if (pathname.startsWith('/api/me/photos/transient/')) return new Response(null, { status: 204 });
  if (pathname === '/api/me/fitting-quota') return json(200, api.quota);
  if (pathname === `/api/products/${PRODUCT}`) {
    return api.productFails ? failure(503, 'SERVICE_UNAVAILABLE') : json(200, product);
  }
  if (pathname === '/api/categories') {
    if (api.categoriesFail) return failure(503, 'SERVICE_UNAVAILABLE');
    return json(200, {
      items: [
        {
          ...product.category,
          isActive: true,
          description: null,
          sortOrder: 0,
          slot: api.slot,
          createdAt: DATE,
          updatedAt: DATE,
        },
      ],
      total: 1,
      limit: 100,
      offset: 0,
    });
  }
  if (pathname === '/api/me/fitting-room' && method === 'GET') {
    return json(200, { items: api.room, count: api.room.length, sum: 0 });
  }
  if (pathname.startsWith('/api/me/fitting-room/') && method === 'PUT') {
    const item = { slot: 'top', product, attributeValueId: RED, colour: 'Красный' };
    return json(200, { room: { items: [item], count: 1, sum: 4500 }, replaced: null });
  }
  if (pathname.startsWith('/api/me/fitting-room/') && method === 'DELETE') {
    return new Response(null, { status: 204 });
  }
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

function renderTryOn(props: { productId?: string; fittingId?: string; withToasts?: boolean } = {}) {
  const { withToasts, ...tryOnProps } = props;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = vi.fn();
  const tryOn = <TryOn {...tryOnProps} onClose={onClose} />;
  const view = render(
    <QueryClientProvider client={queryClient}>
      {withToasts ? <ToastProvider>{tryOn}</ToastProvider> : tryOn}
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
    quota: { limit: 20, used: 3, left: 17, renewsAt: '2026-10-31T21:00:00.000Z', unseen: 0 },
    fittings: new Map(),
    started: () => startedResponse(),
    upload: () => json(201, photo(ONE_TIME, { transient: true })),
    slot: 'top',
    room: [],
    productFails: false,
    categoriesFail: false,
    consent: 1,
    image: () => Promise.resolve(new Response(new Uint8Array([1, 2]))),
  };
  useRoomStore.setState({ open: false });
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

describe('TryOn picker', () => {
  it('opens as «Онлайн-примерка» with the default photo chosen and the item shown', async () => {
    renderTryOn({ productId: PRODUCT });

    expect(await screen.findByRole('dialog', { name: 'Онлайн-примерка' })).toBeInTheDocument();
    const chosen = await screen.findByRole('img', { name: 'Ваше фото' });
    expect(chosen).toHaveAttribute('src', expect.stringContaining(PHOTO_B));
    expect(screen.getByText('Ваше фото, видите только вы')).toBeInTheDocument();
    expect(await screen.findByText('Сарафан')).toBeInTheDocument();
    expect(await screen.findByText('Осталось 17 примерок в этом месяце')).toBeInTheDocument();
    expect(start()).toBeEnabled();
  });

  it('has no subtitle about an approximate picture and no caption under the switch (AC10)', async () => {
    api.photos = [];
    renderTryOn({ productId: PRODUCT });
    await screen.findByText('Осталось 17 примерок в этом месяце');

    expect(screen.queryByText(/Изображение приблизительное/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Об изображении' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Ваши фото/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Управлять/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('switch')).toHaveLength(1);
  });

  describe('one photo at a time while a HEIC is prepared (spec 0024 Z15)', () => {
    const heic = () => new File(['h'], 'IMG_1.heic', { type: 'image/heic' });
    const jpeg = () => new File(['j'], 'IMG_1.jpg', { type: 'image/jpeg' });
    const frameImage = () => document.querySelector<HTMLImageElement>('img[alt="Ваше фото"]')!;
    const photoPosts = () => posts().filter(({ path }) => path === '/api/me/photos');

    function pasteImage(target: EventTarget = document.body) {
      const event = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', {
        value: {
          items: [
            {
              kind: 'file',
              type: 'image/png',
              getAsFile: () => new File(['p'], 'p.png', { type: 'image/png' }),
            },
          ],
        },
      });
      target.dispatchEvent(event);
      return event;
    }

    function pendingConversion() {
      let finish: (file: File) => void = () => undefined;
      mocks.heicToJpeg.mockReturnValue(
        new Promise<File>((resolve) => {
          finish = resolve;
        }),
      );
      return (file: File) => finish(file);
    }

    it('keeps the frame, the paste and the save switch off while «Заменить фото» prepares one', async () => {
      const finish = pendingConversion();
      const user = setup();
      renderTryOn({ productId: PRODUCT });
      await screen.findByRole('img', { name: 'Ваше фото' });
      await vi.waitFor(() => expect(start()).toBeEnabled());
      await user.click(await screen.findByRole('button', { name: 'Заменить фото' }));
      const dialog = await screen.findByRole('dialog', { name: 'Заменить фото' });
      // The window's picker exists once /me says the consents are given.
      await vi.waitFor(() =>
        expect(dialog.querySelector('input[type="file"]')).toBeInTheDocument(),
      );

      fireEvent.change(dialog.querySelector('input[type="file"]')!, {
        target: { files: [heic()] },
      });

      await vi.waitFor(() => expect(mocks.heicToJpeg).toHaveBeenCalledTimes(1));
      expect(screen.getByRole('dialog', { name: 'Заменить фото' })).toBeInTheDocument();
      const off = within(dialog).getByRole('switch', { name: /Сохранить фото/ });
      await vi.waitFor(() =>
        expect(
          off.hasAttribute('data-disabled') || off.getAttribute('aria-disabled') === 'true',
        ).toBe(true),
      );
      fireEvent.drop(frameImage(), {
        dataTransfer: {
          files: [new File(['x'], 'again.jpg', { type: 'image/jpeg' })],
          types: ['Files'],
        },
      });
      pasteImage();
      expect(photoPosts()).toHaveLength(0);
      expect(mocks.heicToJpeg).toHaveBeenCalledTimes(1);
      // The saved photos in the window are off meanwhile: a click chooses nothing.
      const thumb = within(dialog).getByRole('button', { name: 'Фото 1' });
      expect(thumb).toBeDisabled();
      await user.click(thumb);
      expect(frameImage()).toHaveAttribute('src', expect.stringContaining(PHOTO_B));

      finish(jpeg());

      await vi.waitFor(() => expect(photoPosts()).toHaveLength(1));
      expect((photoPosts()[0]?.init.body as FormData).get('photo')).toEqual(
        expect.objectContaining({ name: 'IMG_1.jpg' }),
      );
      await vi.waitFor(() =>
        expect(frameImage()).toHaveAttribute('src', expect.stringContaining(ONE_TIME)),
      );
    });

    it("takes no paste made inside «Заменить фото»'s window", async () => {
      const user = setup();
      renderTryOn({ productId: PRODUCT });
      await screen.findByRole('img', { name: 'Ваше фото' });
      await vi.waitFor(() => expect(start()).toBeEnabled());
      await user.click(await screen.findByRole('button', { name: 'Заменить фото' }));
      const dialog = await screen.findByRole('dialog', { name: 'Заменить фото' });
      await vi.waitFor(() =>
        expect(dialog.querySelector('input[type="file"]')).toBeInTheDocument(),
      );

      const event = pasteImage(dialog);

      expect(event.defaultPrevented).toBe(false);
      expect(photoPosts()).toHaveLength(0);
      expect(mocks.heicToJpeg).not.toHaveBeenCalled();
    });

    it('still takes a paste made in the try-on window itself', async () => {
      renderTryOn({ productId: PRODUCT });
      const dialog = await screen.findByRole('dialog', { name: 'Онлайн-примерка' });
      await screen.findByRole('img', { name: 'Ваше фото' });
      await vi.waitFor(() => expect(start()).toBeEnabled());

      // A paste is ignored until /me is read: paste again until the upload starts.
      await vi.waitFor(() => {
        if (photoPosts().length === 0) pasteImage(dialog);
        expect(photoPosts()).toHaveLength(1);
      });
    });

    it('keeps «Заменить фото» and «Примерить» off while the frame prepares one', async () => {
      const finish = pendingConversion();
      renderTryOn({ productId: PRODUCT });
      const image = await screen.findByRole('img', { name: 'Ваше фото' });
      await vi.waitFor(() => expect(start()).toBeEnabled());
      // A drop is ignored until /me is read: drop again until the conversion starts.
      await vi.waitFor(() => {
        if (mocks.heicToJpeg.mock.calls.length === 0) {
          fireEvent.drop(image, {
            dataTransfer: { files: [heic()], types: ['Files'] },
          });
        }
        expect(mocks.heicToJpeg).toHaveBeenCalledTimes(1);
      });

      await vi.waitFor(() => expect(start()).toBeDisabled());
      expect(screen.getByRole('button', { name: 'Заменить фото' })).toBeDisabled();
      expect(photoPosts()).toHaveLength(0);

      finish(jpeg());

      await vi.waitFor(() => expect(photoPosts()).toHaveLength(1));
    });

    it('turns «Примерить» on again after a failed conversion', async () => {
      mocks.heicToJpeg.mockRejectedValue(new Error('bad heic'));
      renderTryOn({ productId: PRODUCT });
      const image = await screen.findByRole('img', { name: 'Ваше фото' });
      await vi.waitFor(() => expect(start()).toBeEnabled());
      await vi.waitFor(() => {
        if (mocks.heicToJpeg.mock.calls.length === 0) {
          fireEvent.drop(image, { dataTransfer: { files: [heic()], types: ['Files'] } });
        }
        expect(mocks.heicToJpeg).toHaveBeenCalledTimes(1);
      });

      expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось прочитать HEIC');
      await vi.waitFor(() => expect(start()).toBeEnabled());
      expect(screen.getByRole('button', { name: 'Заменить фото' })).toBeEnabled();
      expect(photoPosts()).toHaveLength(0);
    });
  });

  describe('«Заменить фото» (AC9)', () => {
    async function openReplace(user: ReturnType<typeof setup>) {
      await user.click(await screen.findByRole('button', { name: 'Заменить фото' }));
      return screen.findByRole('dialog', { name: 'Заменить фото' });
    }

    it('is the only control under a chosen photo: no drop zone buttons, no strip', async () => {
      renderTryOn({ productId: PRODUCT });
      await screen.findByRole('img', { name: 'Ваше фото' });

      expect(screen.getByRole('button', { name: 'Заменить фото' })).toBeEnabled();
      expect(screen.queryByRole('button', { name: 'Загрузить фото' })).not.toBeInTheDocument();
      expect(screen.queryByRole('switch')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Фото \d/ })).not.toBeInTheDocument();
    });

    it('lists the saved photos but the chosen one, with the switch and no link to «Мои фото» (AC16)', async () => {
      const user = setup();
      renderTryOn({ productId: PRODUCT });

      const dialog = await openReplace(user);

      expect(within(dialog).getByRole('button', { name: 'Фото 1' })).not.toHaveAttribute(
        'aria-pressed',
      );
      expect(
        within(dialog).queryByRole('button', { name: 'Фото 2, по умолчанию' }),
      ).not.toBeInTheDocument();
      expect(within(dialog).getByRole('switch', { name: /Сохранить фото/ })).toBeChecked();
      expect(within(dialog).getByRole('button', { name: 'Загрузить фото' })).toBeEnabled();
      expect(within(dialog).queryByRole('link')).not.toBeInTheDocument();
      expect(screen.queryByText('Перейти в «Мои фото»')).not.toBeInTheDocument();
    });

    it('swaps the list after choosing another photo: the old one appears, the new one goes (AC16)', async () => {
      const user = setup();
      renderTryOn({ productId: PRODUCT });
      let dialog = await openReplace(user);
      await user.click(within(dialog).getByRole('button', { name: 'Фото 1' }));
      await vi.waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Заменить фото' })).toBeNull(),
      );

      dialog = await openReplace(user);

      expect(
        within(dialog).getByRole('button', { name: 'Фото 2, по умолчанию' }),
      ).toBeInTheDocument();
      expect(within(dialog).queryByRole('button', { name: 'Фото 1' })).not.toBeInTheDocument();
    });

    it('shows only the pickers and the switch when the one saved photo is the chosen one (AC16)', async () => {
      api.photos = [photo(PHOTO_B, { isDefault: true })];
      const user = setup();
      renderTryOn({ productId: PRODUCT });

      const dialog = await openReplace(user);

      expect(within(dialog).queryByRole('button', { name: /^Фото \d/ })).not.toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Загрузить фото' })).toBeEnabled();
      expect(within(dialog).getByRole('switch', { name: /Сохранить фото/ })).toBeInTheDocument();
    });

    it('offers the camera in the window only on a touch device', async () => {
      const user = setup();
      const first = renderTryOn({ productId: PRODUCT });
      let dialog = await openReplace(user);
      expect(
        within(dialog).queryByRole('button', { name: 'Сделать фото' }),
      ).not.toBeInTheDocument();
      first.unmount();

      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query === '(pointer: coarse)',
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }));
      renderTryOn({ productId: PRODUCT });
      dialog = await openReplace(user);
      expect(within(dialog).getByRole('button', { name: 'Сделать фото' })).toBeEnabled();
    });

    it('clears the text of a refused drop on the frame when another photo is chosen', async () => {
      const user = setup();
      renderTryOn({ productId: PRODUCT });
      const image = await screen.findByRole('img', { name: 'Ваше фото' });
      // A drop is ignored until /me is read: drop again until the zone answers.
      await vi.waitFor(() => {
        fireEvent.drop(image, {
          dataTransfer: {
            files: [new File(['x'], 'doc.pdf', { type: 'application/pdf' })],
            types: ['Files'],
          },
        });
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Нужно изображение JPG, PNG, WebP или HEIC',
        );
      });

      const dialog = await openReplace(user);
      await user.click(within(dialog).getByRole('button', { name: 'Фото 1' }));

      await vi.waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
      expect(posts()).toHaveLength(0);
    });

    it('chooses another saved photo, closes the window and tracks the choice', async () => {
      const user = setup();
      renderTryOn({ productId: PRODUCT });
      const dialog = await openReplace(user);

      await user.click(within(dialog).getByRole('button', { name: 'Фото 1' }));

      await vi.waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Заменить фото' })).toBeNull(),
      );
      expect(screen.getByRole('img', { name: 'Ваше фото' })).toHaveAttribute(
        'src',
        expect.stringContaining(PHOTO_A),
      );
      expect(mocks.track).toHaveBeenCalledWith(
        'Element Clicked',
        expect.objectContaining({ element: 'try-on.photo', is_default: false }),
      );
      expect(mocks.track).toHaveBeenCalledWith(
        'Element Clicked',
        expect.objectContaining({ element: 'try-on.replace-photo' }),
      );
    });
  });

  describe('the drop zone with no photo (AC8)', () => {
    const line = () => screen.findByText('Загрузите своё фото');
    // The whole-card button is a pointer's target only, out of the accessibility tree (Z47).
    // (aria-hidden takes its name out of the tree, so it is found by class.)
    const area = () => {
      const found = document.querySelector<HTMLButtonElement>('button.dropArea');
      if (!found) throw new Error('no drop area');
      return found;
    };

    it('shows the card, «Выбрать файл» and the save switch, and no «Заменить фото»', async () => {
      api.photos = [];
      renderTryOn({ productId: PRODUCT });

      expect(await line()).toBeInTheDocument();
      expect(area()).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Загрузить фото' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Выбрать файл' })).toBeInTheDocument();
      expect(screen.getByRole('switch', { name: /Сохранить фото/ })).toBeChecked();
      expect(screen.queryByRole('button', { name: 'Сделать фото' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Заменить фото' })).not.toBeInTheDocument();
    });

    it('adds «Сделать фото» on a touch device', async () => {
      api.photos = [];
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query === '(pointer: coarse)',
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }));
      renderTryOn({ productId: PRODUCT });
      await line();

      // Off until /me says whether the consents were given.
      await vi.waitFor(() =>
        expect(screen.getByRole('button', { name: 'Сделать фото' })).toBeEnabled(),
      );
    });

    it('uploads a dropped photo (saved, no consent sent again) and chooses it', async () => {
      api.photos = [];
      renderTryOn({ productId: PRODUCT });
      const target = await line();
      await vi.waitFor(() => expect(area()).toBeEnabled());

      fireEvent.drop(target, {
        dataTransfer: {
          files: [new File(['x'], 'me.jpg', { type: 'image/jpeg' })],
          types: ['Files'],
        },
      });

      await vi.waitFor(() =>
        expect(posts().some(({ path }) => path === '/api/me/photos')).toBe(true),
      );
      const body = posts().find(({ path }) => path === '/api/me/photos')?.init.body as FormData;
      expect(body.get('save')).toBe('true');
      expect(body.has('consent')).toBe(false);
      await vi.waitFor(() =>
        expect(screen.getByRole('img', { name: 'Ваше фото' })).toHaveAttribute(
          'src',
          expect.stringContaining(ONE_TIME),
        ),
      );
      expect(mocks.track).toHaveBeenCalledWith(
        'Photo Uploaded',
        expect.objectContaining({ source: 'drop', place: 'try-on' }),
      );
    });

    it('refuses a dropped file of another type with its text and sends nothing', async () => {
      api.photos = [];
      renderTryOn({ productId: PRODUCT });
      const target = await line();
      await vi.waitFor(() => expect(area()).toBeEnabled());

      fireEvent.drop(target, {
        dataTransfer: {
          files: [new File(['x'], 'doc.pdf', { type: 'application/pdf' })],
          types: ['Files'],
        },
      });

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Нужно изображение JPG, PNG, WebP или HEIC',
      );
      expect(posts()).toHaveLength(0);
    });

    it('takes a drop on the chosen photo too', async () => {
      renderTryOn({ productId: PRODUCT });
      const image = await screen.findByRole('img', { name: 'Ваше фото' });
      await vi.waitFor(() => expect(start()).toBeEnabled());

      // A drop is ignored until /me is read: drop again until the upload starts.
      await vi.waitFor(() => {
        fireEvent.drop(image, {
          dataTransfer: {
            files: [new File(['x'], 'again.jpg', { type: 'image/jpeg' })],
            types: ['Files'],
          },
        });
        expect(posts().some(({ path }) => path === '/api/me/photos')).toBe(true);
      });
    });

    it('lists a one-time photo after the saved ones only while it is not the chosen one (AC16)', async () => {
      const user = setup();
      renderTryOn({ productId: PRODUCT });
      const image = await screen.findByRole('img', { name: 'Ваше фото' });
      await vi.waitFor(() => {
        fireEvent.drop(image, {
          dataTransfer: {
            files: [new File(['x'], 'once.jpg', { type: 'image/jpeg' })],
            types: ['Files'],
          },
        });
        expect(screen.getByRole('img', { name: 'Ваше фото' })).toHaveAttribute(
          'src',
          expect.stringContaining(ONE_TIME),
        );
      });

      const openReplace = async () => {
        await user.click(await screen.findByRole('button', { name: 'Заменить фото' }));
        return screen.findByRole('dialog', { name: 'Заменить фото' });
      };
      let dialog = await openReplace();
      expect(within(dialog).queryByRole('button', { name: 'Фото 3' })).not.toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Фото 1' }));
      await vi.waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Заменить фото' })).toBeNull(),
      );

      dialog = await openReplace();
      expect(within(dialog).getByRole('button', { name: 'Фото 3' })).toBeInTheDocument();
      expect(within(dialog).queryByRole('button', { name: 'Фото 1' })).not.toBeInTheDocument();
    });

    it('asks a user with no stored consents for them first, then uploads with consent=1 (AC19)', async () => {
      api.photos = [];
      api.consent = null;
      const user = setup();
      renderTryOn({ productId: PRODUCT });
      const target = await line();
      await vi.waitFor(() => expect(area()).toBeEnabled());

      fireEvent.drop(target, {
        dataTransfer: {
          files: [new File(['x'], 'me.jpg', { type: 'image/jpeg' })],
          types: ['Files'],
        },
      });

      const tips = await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });
      expect(posts()).toHaveLength(0);
      await user.click(within(tips).getByRole('checkbox', { name: 'На фото — я' }));
      await user.click(within(tips).getByRole('checkbox', { name: /OpenAI/ }));
      // The second box uploads the waiting file by itself.

      await vi.waitFor(() =>
        expect(posts().some(({ path }) => path === '/api/me/photos')).toBe(true),
      );
      const body = posts().find(({ path }) => path === '/api/me/photos')?.init.body as FormData;
      expect(body.get('consent')).toBe('1');
    });
  });

  describe('the item card (AC11)', () => {
    it('has «В корзину» and a heart stub tracked as try-on.favourite of kind single', async () => {
      const user = setup();
      renderTryOn({ productId: PRODUCT });

      expect(await screen.findByRole('button', { name: 'В корзину' })).toBeEnabled();
      await user.click(screen.getByRole('button', { name: 'В избранное' }));

      expect(mocks.track).toHaveBeenCalledWith(
        'Element Clicked',
        expect.objectContaining({ element: 'try-on.favourite', kind: 'single' }),
      );
    });
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

  it('closes the window and opens the fitting room from the limit card (A90.12)', async () => {
    api.quota = { ...api.quota, used: 20, left: 0 };
    api.room = [{ slot: 'top', product, attributeValueId: RED, colour: 'Красный' }];
    const user = setup();
    const { onClose } = renderTryOn({ productId: PRODUCT });
    await screen.findByRole('heading', { name: 'Примерки на этот месяц закончились' });
    expect(useRoomStore.getState().open).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Перейти в примерочную' }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(useRoomStore.getState().open).toBe(true);
    expect(mocks.track).toHaveBeenCalledWith(
      'Element Clicked',
      expect.objectContaining({ element: 'room.open', source: 'limit' }),
    );
  });

  it('shows another failure of the start under the picker and lets it be tried again', async () => {
    // A bare 500 is not sent again, so the text shows at once (a 503 is, once, after 1.5 s).
    api.started = () => failure(500, 'INTERNAL_ERROR');
    const user = setup();
    renderTryOn({ productId: PRODUCT });
    await vi.waitFor(() => expect(start()).toBeEnabled());

    await user.click(start());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ошибка на сервере, попробуйте позже',
    );
    expect(start()).toBeEnabled();
  });
});

describe('TryOn one-time photo', () => {
  // Through «Заменить фото»: its window holds the save switch and the file picker.
  async function uploadOneTime(user: ReturnType<typeof setup>) {
    await user.click(await screen.findByRole('button', { name: 'Заменить фото' }));
    const dialog = await screen.findByRole('dialog', { name: 'Заменить фото' });
    await user.click(within(dialog).getByRole('switch', { name: /Сохранить фото/ }));
    const input = dialog.querySelector<HTMLInputElement>('input[type="file"]:not([capture])');
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
    expect((upload?.init.body as FormData).has('consent')).toBe(false);
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

    // The success screen comes first (AC13), the result after 1.5 s.
    expect(await screen.findByRole('status')).toHaveTextContent('Готово!');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
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
    expect(screen.getByText('Осталось 17 примерок в этом месяце')).toBeInTheDocument();
  });

  it('keeps the approximate-picture caption out of the body: it is the hint of «Об изображении» (spec 0024 AC13)', async () => {
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
    await screen.findByText('Сгенерировано ИИ');

    expect(screen.queryByText(/Изображение приблизительное/)).not.toBeInTheDocument();
    await user.hover(screen.getByRole('button', { name: 'Об изображении' }));
    expect(await screen.findByText(/Изображение приблизительное/)).toHaveTextContent(
      'Изображение приблизительное, могут быть неточности в посадке, длине и цвете.',
    );
  });

  describe('«К образу» of the result (A90.11, AC13, AC16)', () => {
    function completed() {
      api.fittings.set(
        RUNNING,
        fitting({
          status: 'completed',
          stage: 'done',
          resultUrl: 'https://s3.test/keep/users/u/result.webp?X-Amz-Signature=abc',
          finishedAt: DATE,
        }),
      );
    }

    function puts() {
      return fetchMock.mock.calls
        .map(([url, init]) => ({ path: new URL(String(url)).pathname, init: init as RequestInit }))
        .filter(({ init }) => init?.method === 'PUT');
    }

    it('puts the item in its colour into the fitting room and turns to «В образе»', async () => {
      completed();
      const user = setup();
      renderTryOn({ fittingId: RUNNING });
      await screen.findByText('Сгенерировано ИИ');
      // A placeholder stands in while the categories load: look the tile up again once enabled.
      await vi.waitFor(() =>
        expect(screen.getByRole('button', { name: 'К образу' })).toBeEnabled(),
      );

      await user.click(screen.getByRole('button', { name: 'К образу' }));

      await vi.waitFor(() => expect(puts()).toHaveLength(1));
      expect(await screen.findByRole('button', { name: 'В образе' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(puts()[0]?.path).toBe('/api/me/fitting-room/top');
      expect(JSON.parse(String(puts()[0]?.init.body))).toEqual({
        productId: PRODUCT,
        attributeValueId: RED,
      });
    });

    // The tile waits (aria-disabled) while the session and the room load.
    async function readyTile(name: 'К образу' | 'В образе') {
      await screen.findByText('Сгенерировано ИИ');
      await vi.waitFor(() => {
        const tile = screen.getByRole('button', { name });
        expect(tile).toBeEnabled();
        expect(tile).not.toHaveAttribute('aria-disabled');
      });
      return screen.getByRole('button', { name });
    }

    const sentOf = (event: 'Element Clicked' | 'Element Hovered') =>
      mocks.track.mock.calls
        .filter(([name, props]) => name === event && props.element === 'result.to-look')
        .map(([, props]) => props);

    it('sends result.to-look with the slot, add and signed_in on a click (A94.1)', async () => {
      completed();
      const user = setup();
      renderTryOn({ fittingId: RUNNING });
      const tile = await readyTile('К образу');

      await user.click(tile);
      await screen.findByRole('button', { name: 'В образе' });

      expect(sentOf('Element Clicked')).toEqual([
        expect.objectContaining({
          element: 'result.to-look',
          slot: 'top',
          action: 'add',
          signed_in: true,
        }),
      ]);
    });

    it('says replace when the slot holds another product', async () => {
      completed();
      api.room = [
        {
          slot: 'top',
          product: { ...product, id: '00000000-0000-4000-8000-0000000000a2' },
          attributeValueId: RED,
          colour: 'Красный',
        },
      ];
      const user = setup();
      renderTryOn({ fittingId: RUNNING });
      const tile = await readyTile('К образу');

      await user.click(tile);

      await vi.waitFor(() =>
        expect(sentOf('Element Clicked')).toEqual([
          expect.objectContaining({ slot: 'top', action: 'replace', signed_in: true }),
        ]),
      );
    });

    it('says remove from «В образе», which takes the item out', async () => {
      completed();
      api.room = [{ slot: 'top', product, attributeValueId: RED, colour: 'Красный' }];
      const user = setup();
      renderTryOn({ fittingId: RUNNING });
      const tile = await readyTile('В образе');

      await user.click(tile);

      await vi.waitFor(() =>
        expect(sentOf('Element Clicked')).toEqual([
          expect.objectContaining({ slot: 'top', action: 'remove', signed_in: true }),
        ]),
      );
    });

    it('sends a hover of 500 ms with the same properties', async () => {
      completed();
      api.room = [
        {
          slot: 'top',
          product: { ...product, id: '00000000-0000-4000-8000-0000000000a3' },
          attributeValueId: RED,
          colour: 'Красный',
        },
      ];
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({
        pointerEventsCheck: 0,
        advanceTimers: vi.advanceTimersByTime,
      });
      renderTryOn({ fittingId: RUNNING });
      const tile = await readyTile('К образу');

      await user.hover(tile);
      expect(sentOf('Element Hovered')).toEqual([]);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(sentOf('Element Hovered')).toEqual([
        expect.objectContaining({ slot: 'top', action: 'replace', signed_in: true }),
      ]);
      expect(sentOf('Element Clicked')).toEqual([]);
    });

    it('sends no hover and no second click while its write runs', async () => {
      completed();
      let finish: () => void = () => undefined;
      fetchMock.mockImplementation((url: string, init?: RequestInit) =>
        init?.method === 'PUT'
          ? new Promise<Response>((resolve) => {
              finish = () => resolve(route(String(url), init));
            })
          : Promise.resolve(route(String(url), init)),
      );
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({
        pointerEventsCheck: 0,
        advanceTimers: vi.advanceTimersByTime,
      });
      renderTryOn({ fittingId: RUNNING });
      const tile = await readyTile('К образу');
      await user.click(tile);
      await vi.waitFor(() => expect(tile).toHaveAttribute('aria-disabled', 'true'));
      // The pointer's arrival for the click started a hover before the write: its leave ends it.
      await user.unhover(tile);

      await user.click(tile);
      await user.unhover(tile);
      await user.hover(tile);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600);
      });

      expect(sentOf('Element Clicked')).toHaveLength(1);
      expect(sentOf('Element Hovered')).toEqual([]);
      await act(async () => {
        finish();
      });
    });

    it('has no tile for a product whose category has no slot', async () => {
      api.slot = null;
      completed();
      renderTryOn({ fittingId: RUNNING });
      await screen.findByText('Сгенерировано ИИ');
      await vi.waitFor(() =>
        expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/categories'))).toBe(
          true,
        ),
      );

      await vi.waitFor(() =>
        expect(screen.queryByRole('button', { name: 'К образу' })).not.toBeInTheDocument(),
      );
    });

    it('has no tile, not a disabled one, when the categories cannot be read', async () => {
      api.categoriesFail = true;
      completed();
      renderTryOn({ fittingId: RUNNING });
      await screen.findByText('Сгенерировано ИИ');

      await vi.waitFor(() =>
        expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/categories'))).toBe(
          true,
        ),
      );
      await vi.waitFor(() =>
        expect(screen.queryByRole('button', { name: 'К образу' })).not.toBeInTheDocument(),
      );
    });

    it('has no tile, not a disabled one, when the product cannot be read', async () => {
      api.productFails = true;
      completed();
      renderTryOn({ fittingId: RUNNING });
      await screen.findByText('Сгенерировано ИИ');

      await vi.waitFor(() =>
        expect(screen.queryByRole('button', { name: 'К образу' })).not.toBeInTheDocument(),
      );
    });

    it('stays the same focusable, aria-disabled button while its write runs', async () => {
      completed();
      let finish: () => void = () => undefined;
      const answer = (url: string, init?: RequestInit) =>
        init?.method === 'PUT'
          ? new Promise<Response>((resolve) => {
              finish = () => resolve(route(url, init));
            })
          : Promise.resolve(route(url, init));
      fetchMock.mockImplementation((url: string, init?: RequestInit) => answer(String(url), init));
      const user = setup();
      renderTryOn({ fittingId: RUNNING });
      await screen.findByText('Сгенерировано ИИ');
      await vi.waitFor(() =>
        expect(screen.getByRole('button', { name: 'К образу' })).toBeEnabled(),
      );
      const tile = screen.getByRole('button', { name: 'К образу' });
      tile.focus();

      await user.click(tile);
      await vi.waitFor(() => expect(tile).toHaveAttribute('aria-disabled', 'true'));
      await user.click(tile);

      expect(puts()).toHaveLength(1);
      expect(tile).toHaveFocus();
      await act(async () => {
        finish();
      });
      expect(await screen.findByRole('button', { name: 'В образе' })).toBe(tile);
      expect(tile).not.toHaveAttribute('aria-disabled');
    });
  });

  it('sends result.add-to-cart of kind single from the result’s cart (A94.3)', async () => {
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

    await user.click(await screen.findByRole('button', { name: 'В корзину' }));

    expect(mocks.track).toHaveBeenCalledWith(
      'Element Clicked',
      expect.objectContaining({ element: 'result.add-to-cart', kind: 'single' }),
    );
  });

  describe('the single result’s item card (spec 0024 Z40)', () => {
    async function openResult() {
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
      renderTryOn({ fittingId: RUNNING, withToasts: true });
      await screen.findByText('Сгенерировано ИИ');
      return user;
    }

    it('shows the stub toast when the card’s cart is clicked', async () => {
      const user = await openResult();

      await user.click(await screen.findByRole('button', { name: 'В корзину' }));

      expect(await screen.findByText('В прототипе нет корзины и избранного')).toBeInTheDocument();
    });

    it('has the heart «В избранное», which shows the same toast', async () => {
      const user = await openResult();

      await user.click(await screen.findByRole('button', { name: 'В избранное' }));

      expect(await screen.findByText('В прототипе нет корзины и избранного')).toBeInTheDocument();
    });

    it('has no button named «Добавить в корзину» under the card', async () => {
      await openResult();

      expect(await screen.findByRole('button', { name: 'В корзину' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Добавить в корзину' })).not.toBeInTheDocument();
    });
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
    expect(screen.getByRole('button', { name: 'Об изображении' })).toBeInTheDocument();

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
    expect(screen.queryByRole('button', { name: 'Об изображении' })).not.toBeInTheDocument();
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
    expect(
      await screen.findByText('Примерка не списана · осталось 17 в этом месяце'),
    ).toBeInTheDocument();

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
    expect(bodyOf(0)).toEqual({});
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
    // A bare 500 is not sent again, so the text shows at once (a 503 is, once, after 1.5 s).
    api.started = () => failure(500, 'INTERNAL_ERROR');
    const user = setup();
    renderTryOn({ fittingId: RUNNING });

    await user.click(await screen.findByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await screen.findByText('Ошибка на сервере, попробуйте позже')).toBeInTheDocument();
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
      await screen.findByRole('button', { name: 'Выбрать из сохранённых' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Заменить фото' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Об изображении' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Сохранено в/)).not.toBeInTheDocument();
    expect(screen.getByText('Загрузите своё фото')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Ваше фото' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Примерить' })).toBeDisabled();
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
      await screen.findByRole('button', { name: 'Выбрать из сохранённых' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Об изображении' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Сохранено в/)).not.toBeInTheDocument();
  });

  it('shows the empty zone with nothing chosen, then enables «Примерить» once a photo is chosen (AC17)', async () => {
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

    expect(await screen.findByText('Загрузите своё фото')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Ваше фото' })).not.toBeInTheDocument();
    expect(start()).toBeDisabled();

    expect(screen.queryByRole('button', { name: 'Заменить фото' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Выбрать из сохранённых' }));
    const dialog = await screen.findByRole('dialog', { name: 'Выбрать из сохранённых' });
    expect(within(dialog).getByRole('button', { name: 'Фото 1' })).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Фото 2, по умолчанию' }),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Фото 1' }));

    await vi.waitFor(() => expect(start()).toBeEnabled());
    expect(screen.getByRole('img', { name: 'Ваше фото' })).toHaveAttribute(
      'src',
      expect.stringContaining(PHOTO_A),
    );
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
    await user.click(await screen.findByRole('button', { name: 'Выбрать из сохранённых' }));
    const dialog = await screen.findByRole('dialog', { name: 'Выбрать из сохранённых' });
    await user.click(within(dialog).getByRole('button', { name: 'Фото 1' }));
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
    await user.click(await screen.findByRole('button', { name: /Перегенерировать/ }));

    expect(await screen.findByText('Примеряем…')).toBeInTheDocument();
    expect(posts()[0]?.path).toBe(`/api/fittings/${RUNNING}/regenerate`);
    expect(bodyOf(0)).toEqual({});
    expect(screen.queryByText(/Примеряем Красный/)).not.toBeInTheDocument();
  });
});

describe('TryOn success screen (AC13)', () => {
  const RESULT_URL = 'https://s3.test/keep/users/u/result.webp?X-Amz-Signature=abc';
  const done = (patch: Partial<Fitting> = {}) =>
    fitting({
      status: 'completed',
      stage: 'done',
      resultUrl: RESULT_URL,
      finishedAt: DATE,
      estimatedSeconds: null,
      ...patch,
    });
  const timerUser = () =>
    userEvent.setup({ pointerEventsCheck: 0, advanceTimers: vi.advanceTimersByTime });

  async function advance(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  const note = () =>
    screen.getByText(
      (_, element) =>
        element?.tagName === 'P' && element.textContent === 'Сохранено в «Мои примерки»',
    );

  it('shows «Готово!» and the saved line for 1.5 s, then the result with its link to the history', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // An id of its own: the end of a fitting is sent once per id and module.
    const own = '00000000-0000-4000-8000-0000000000e9';
    api.fittings.set(own, fitting({ id: own }));
    renderTryOn({ fittingId: own });
    await screen.findByText('Примеряем…');

    api.fittings.set(own, done({ id: own }));
    await advance(3100);

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Готово!');
    expect(status).toHaveTextContent('Сохранили в «Мои примерки»');
    expect(screen.queryByText('Примеряем…')).not.toBeInTheDocument();
    expect(screen.queryByText('Сгенерировано ИИ')).not.toBeInTheDocument();
    expect(screen.queryByText('Скачать')).not.toBeInTheDocument();

    await advance(1500);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(await screen.findByText('Сгенерировано ИИ')).toBeInTheDocument();
    expect(within(note()).getByRole('link', { name: '«Мои примерки»' })).toHaveAttribute(
      'href',
      '/customer/fittings',
    );
    expect(mocks.track.mock.calls.filter(([event]) => event === 'Fitting Completed')).toHaveLength(
      1,
    );
  });

  it('shows the result at once, with no success screen, for a fitting opened completed', async () => {
    api.fittings.set(RUNNING, done());
    renderTryOn({ fittingId: RUNNING });

    expect(await screen.findByText('Сгенерировано ИИ')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(note()).toBeInTheDocument();
    expect(screen.queryByText(/сохранён в истории/)).not.toBeInTheDocument();
  });

  it('shows the result at once for a repeated start that answers an earlier result', async () => {
    api.started = () => json(200, { ...done({ id: NEXT }), repeated: true });
    api.fittings.set(NEXT, done({ id: NEXT }));
    const user = setup();
    renderTryOn({ productId: PRODUCT });
    await vi.waitFor(() => expect(start()).toBeEnabled());

    await user.click(start());

    expect(await screen.findByText('Сгенерировано ИИ')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows it after a start from the picker once the new fitting completes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.fittings.set(NEXT, fitting({ id: NEXT }));
    const user = timerUser();
    renderTryOn({ productId: PRODUCT });
    await vi.waitFor(() => expect(start()).toBeEnabled());
    await user.click(start());
    await screen.findByText('Примеряем…');

    api.fittings.set(NEXT, done({ id: NEXT }));
    await advance(3100);

    expect(await screen.findByRole('status')).toHaveTextContent('Готово!');
    await advance(1500);
    expect(await screen.findByText('Сгенерировано ИИ')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows it for a colour that ran over a result, then the new result', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const blue = [{ ...fitting().items[0]!, attributeValueId: BLUE, colour: 'Синий' }];
    api.fittings.set(RUNNING, done());
    api.fittings.set(NEXT, fitting({ id: NEXT, items: blue }));
    api.started = () => startedResponse({ items: blue });
    const user = timerUser();
    renderTryOn({ fittingId: RUNNING });
    await screen.findByText('Сгенерировано ИИ');

    await user.click(await screen.findByRole('button', { name: 'Синий' }));
    expect(await screen.findByText(/Примеряем Синий…/)).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    api.fittings.set(
      NEXT,
      done({ id: NEXT, items: blue, resultUrl: 'https://s3.test/keep/users/u/blue.webp?X=1' }),
    );
    await advance(3100);

    expect(await screen.findByRole('status')).toHaveTextContent('Готово!');
    expect(screen.queryByText(/Примеряем Синий/)).not.toBeInTheDocument();
    await advance(1500);

    expect(await screen.findByText('Сгенерировано ИИ')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Сгенерированное изображение: вы в вещи «Сарафан»' }),
    ).toHaveAttribute('src', expect.stringContaining('blue.webp'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows no success screen for a failed fitting', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.fittings.set(RUNNING, fitting());
    renderTryOn({ fittingId: RUNNING });
    await screen.findByText('Примеряем…');

    api.fittings.set(
      RUNNING,
      fitting({ status: 'failed', stage: 'done', failureCode: 'model_timeout' }),
    );
    await advance(3100);

    expect(await screen.findByRole('heading', { name: 'Не получилось примерить' })).toBeVisible();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('sends result.history from the result’s link', async () => {
    api.fittings.set(RUNNING, done());
    const user = setup();
    renderTryOn({ fittingId: RUNNING });
    await screen.findByText('Сгенерировано ИИ');
    const link = within(note()).getByRole('link', { name: '«Мои примерки»' });
    link.addEventListener('click', (event) => event.preventDefault());

    await user.click(link);

    expect(mocks.track).toHaveBeenCalledWith(
      'Element Clicked',
      expect.objectContaining({ element: 'result.history' }),
    );
  });
});

describe('TryOn result «Скачать» (AC14)', () => {
  const done = () =>
    fitting({
      status: 'completed',
      stage: 'done',
      resultUrl: 'https://s3.test/keep/users/u/result.webp?X-Amz-Signature=abc',
      finishedAt: DATE,
    });
  const imageCalls = () =>
    fetchMock.mock.calls.filter(([url]) => String(url).endsWith(`/api/fittings/${RUNNING}/image`));
  const clicks = () =>
    mocks.track.mock.calls.filter(
      ([event, props]) => event === 'Element Clicked' && props.element === 'result.download',
    );

  let anchorClick: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:result-1');
    URL.revokeObjectURL = vi.fn();
    anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saves the api’s file with no new tab and sends result.download once', async () => {
    api.fittings.set(RUNNING, done());
    api.image = () =>
      Promise.resolve(
        new Response(new Uint8Array([1]), {
          headers: {
            'Content-Disposition': 'attachment; filename="primerka-2026-10-20-1500.webp"',
          },
        }),
      );
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const user = setup();
    renderTryOn({ fittingId: RUNNING });
    await screen.findByText('Сгенерировано ИИ');

    await user.click(screen.getByRole('button', { name: 'Скачать' }));

    await vi.waitFor(() => expect(anchorClick).toHaveBeenCalledOnce());
    const link = anchorClick.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toBe('primerka-2026-10-20-1500.webp');
    expect(link.hasAttribute('target')).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(imageCalls()).toHaveLength(1);
    expect(clicks()).toHaveLength(1);
  });

  it('is aria-disabled while the file loads: a second click sends and asks for nothing', async () => {
    api.fittings.set(RUNNING, done());
    let answer: (response: Response) => void = () => undefined;
    api.image = () =>
      new Promise<Response>((resolve) => {
        answer = resolve;
      });
    const user = setup();
    renderTryOn({ fittingId: RUNNING });
    await screen.findByText('Сгенерировано ИИ');
    const tile = screen.getByRole('button', { name: 'Скачать' });

    await user.click(tile);
    await vi.waitFor(() => expect(tile).toHaveAttribute('aria-disabled', 'true'));
    await user.click(tile);

    expect(imageCalls()).toHaveLength(1);
    expect(clicks()).toHaveLength(1);
    expect(tile).toBeEnabled();

    await act(async () => {
      answer(new Response(new Uint8Array([1])));
    });
    await vi.waitFor(() => expect(tile).not.toHaveAttribute('aria-disabled'));
    expect(anchorClick).toHaveBeenCalledOnce();
  });

  it('saves nothing and gives the tile back when the api refuses', async () => {
    api.fittings.set(RUNNING, done());
    api.image = () => Promise.resolve(failure(503, 'SERVICE_UNAVAILABLE'));
    const user = setup();
    renderTryOn({ fittingId: RUNNING });
    await screen.findByText('Сгенерировано ИИ');
    const tile = screen.getByRole('button', { name: 'Скачать' });

    await user.click(tile);

    await vi.waitFor(() => expect(imageCalls()).toHaveLength(1));
    await vi.waitFor(() => expect(tile).not.toHaveAttribute('aria-disabled'));
    expect(anchorClick).not.toHaveBeenCalled();
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
    await user.click(await screen.findByRole('button', { name: /Перегенерировать/ }));

    await screen.findByText('Примеряем…');

    await vi.waitFor(() => {
      expect(document.activeElement).not.toBe(document.body);
      expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
    });
  });

  const outerPopup = () => screen.getByRole('dialog', { name: 'Онлайн-примерка', hidden: true });

  it('gives a focus lost to the page body back to the try-on window itself', async () => {
    renderTryOn({ productId: PRODUCT });
    const other = await screen.findByRole('button', { name: 'Заменить фото' });
    // The reads that follow the first render (the user's data, the quota) change the page too.
    await settle();
    other.focus();

    other.blur();
    expect(document.body).toHaveFocus();
    await settle();

    expect(outerPopup()).toHaveFocus();
  });

  it('does not pull the focus to the try-on window while the first-upload tips are open over it', async () => {
    api.photos = [];
    api.consent = null;
    const user = setup();
    renderTryOn({ productId: PRODUCT });
    const opener = await screen.findByRole('button', { name: 'Выбрать файл' });
    await vi.waitFor(() => expect(opener).toBeEnabled());
    await user.click(opener);
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
    await screen.findByRole('dialog', { name: 'Что поменять?' });
    await vi.waitFor(() => expect(outerPopup()).toHaveAttribute('data-nested-dialog-open'));

    (document.activeElement as HTMLElement).blur();
    expect(document.body).toHaveFocus();
    await settle();

    expect(outerPopup()).not.toHaveFocus();
  });

  it('does not take the focus from another control when the page changes', async () => {
    renderTryOn({ productId: PRODUCT });
    const other = await screen.findByRole('button', { name: 'Заменить фото' });
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
    for (const name of ['one.jpg', 'two.jpg']) {
      await user.click(await screen.findByRole('button', { name: 'Заменить фото' }));
      const dialog = await screen.findByRole('dialog', { name: 'Заменить фото' });
      // The switch is on at first; the first window turns it off for both uploads.
      if (name === 'one.jpg') {
        await user.click(within(dialog).getByRole('switch', { name: /Сохранить фото/ }));
      }
      const input = dialog.querySelector<HTMLInputElement>('input[type="file"]:not([capture])');
      await user.upload(input!, new File(['x'], name, { type: 'image/jpeg' }));
      await vi.waitFor(() => expect(posts()).toHaveLength(count));
      await vi.waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Заменить фото' })).toBeNull(),
      );
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

describe('TryOn optimistic start (AC19)', () => {
  const RESULT_URL = 'https://s3.test/keep/users/u/result.webp?X-Amz-Signature=abc';
  const done = (patch: Partial<Fitting> = {}) =>
    fitting({
      status: 'completed',
      stage: 'done',
      resultUrl: RESULT_URL,
      finishedAt: DATE,
      estimatedSeconds: null,
      ...patch,
    });

  // POST /fittings... waits for the test to answer it; everything else answers as usual.
  function holdStarts() {
    const waiting: ((response: Response) => void)[] = [];
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === 'POST' && new URL(String(url)).pathname.startsWith('/api/fittings')
        ? new Promise<Response>((resolve) => waiting.push(resolve))
        : Promise.resolve(route(String(url), init)),
    );
    return {
      sent: () => waiting.length,
      answer: async (response: Response, index = waiting.length - 1) => {
        await act(async () => {
          waiting[index]?.(response);
        });
      },
    };
  }

  const percent = () => Number(screen.getByText(/^\d+%$/).textContent?.replace('%', ''));
  const picker = () => screen.queryByRole('button', { name: /Примерить$/ });

  async function openPicker() {
    const user = setup();
    renderTryOn({ productId: PRODUCT });
    await screen.findByRole('img', { name: 'Ваше фото' });
    await vi.waitFor(() => expect(start()).toBeEnabled());
    return user;
  }

  it('shows the wait before the api answers, in place of the picker', async () => {
    const held = holdStarts();
    const user = await openPicker();

    await user.click(start());

    expect(await screen.findByText('Примеряем…')).toBeVisible();
    await vi.waitFor(() => expect(held.sent()).toBe(1));
    expect(picker()).not.toBeInTheDocument();
    // The picker stays mounted, hidden, under the wait: the wait's copy is the last.
    expect(screen.getAllByText('Сарафан').at(-1)).toBeVisible();
    expect(screen.getByText(/Осталось около 25 секунд/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Закрыть и продолжить покупки' })).toBeEnabled();
  });

  it('goes on without a restart when the api answers the running fitting', async () => {
    // Only the clock and the wait's one-second interval are fake: the rest runs on real timers,
    // so no wait depends on the fake clock moving by itself, and a loaded machine only slows it.
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    const held = holdStarts();
    api.fittings.set(NEXT, fitting({ id: NEXT, estimatedSeconds: 20 }));
    const user = setup();
    renderTryOn({ productId: PRODUCT });
    await screen.findByRole('img', { name: 'Ваше фото' });
    await vi.waitFor(() => expect(start()).toBeEnabled());
    await user.click(start());
    await screen.findByText('Примеряем…');
    await vi.waitFor(() => expect(held.sent()).toBe(1));
    // The clock moves 10 s and the wait's second tick shows it.
    vi.setSystemTime(Date.now() + 10_000);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const before = percent();
    expect(before).toBeGreaterThanOrEqual(38);
    const closeButton = screen.getByRole('button', { name: 'Закрыть и продолжить покупки' });

    await held.answer(startedResponse({ estimatedSeconds: 20 }));
    // The answer's fitting is read and shown (its status is `processing`).
    await vi.waitFor(() => expect(isFittingShown(NEXT)).toBe(true));
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // The share is kept across the new estimate: no drop, and no restart near zero.
    expect(screen.getByText('Примеряем…')).toBeInTheDocument();
    expect(percent()).toBeGreaterThanOrEqual(before);
    expect(percent()).toBeLessThan(before + 15);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    // The wait is the same element before and after the answer: it does not remount.
    expect(screen.getByRole('button', { name: 'Закрыть и продолжить покупки' })).toBe(closeButton);
  });

  it('jumps forward to a running fitting’s own creation time when it began earlier, never back', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    const held = holdStarts();
    const earlier = new Date(Date.now() - 30_000).toISOString();
    api.fittings.set(NEXT, fitting({ id: NEXT, estimatedSeconds: 20, createdAt: earlier }));
    const user = setup();
    renderTryOn({ productId: PRODUCT });
    await screen.findByRole('img', { name: 'Ваше фото' });
    await vi.waitFor(() => expect(start()).toBeEnabled());
    await user.click(start());
    await screen.findByText('Примеряем…');
    await vi.waitFor(() => expect(held.sent()).toBe(1));
    const before = percent();

    // The api answers the fitting that already ran for 30 s of a 20 s estimate (A32).
    await held.answer(startedResponse({ estimatedSeconds: 20, createdAt: earlier }));
    await vi.waitFor(() => expect(isFittingShown(NEXT)).toBe(true));
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(percent()).toBeGreaterThanOrEqual(before);
    expect(percent()).toBe(95);
    expect(screen.getByText('Почти готово')).toBeInTheDocument();
  });

  it('still reaches the start’s answer when the quota read shows no tries left meanwhile', async () => {
    const held = holdStarts();
    api.fittings.set(NEXT, fitting({ id: NEXT }));
    const user = await openPicker();
    await user.click(start());
    await screen.findByText('Примеряем…');
    await vi.waitFor(() => expect(held.sent()).toBe(1));

    // The quota is read again meanwhile (a returning tab) and says none are left.
    api.quota = { ...api.quota, used: 20, left: 0 };
    await act(async () => {
      window.dispatchEvent(new Event('visibilitychange'));
    });
    await vi.waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/me/fitting-quota'))
          .length,
      ).toBeGreaterThan(1),
    );
    await held.answer(startedResponse());

    await vi.waitFor(() => expect(isFittingShown(NEXT)).toBe(true));
    expect(screen.getByText('Примеряем…')).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Примерки на этот месяц закончились' }),
    ).toBeNull();
  });

  it('does not leave the focus on the hidden «Примерить» once the wait shows', async () => {
    const held = holdStarts();
    const user = await openPicker();
    start().focus();

    await user.click(start());
    await screen.findByText('Примеряем…');
    await vi.waitFor(() => expect(held.sent()).toBe(1));

    await vi.waitFor(() => {
      expect(document.activeElement).not.toBe(document.body);
      expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
      expect(document.activeElement?.closest('[hidden]')).toBeNull();
    });
  });

  it('brings the picker back with the notice when the api refuses, and nothing of the wait stays', async () => {
    const held = holdStarts();
    const user = await openPicker();
    await user.click(start());
    await screen.findByText('Примеряем…');
    await vi.waitFor(() => expect(held.sent()).toBe(1));

    await held.answer(failure(500, 'INTERNAL_ERROR'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ошибка на сервере, попробуйте позже',
    );
    expect(screen.queryByText('Примеряем…')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Закрыть и продолжить покупки' })).toBeNull();
    expect(start()).toBeEnabled();
    expect(screen.getByRole('img', { name: 'Ваше фото' })).toHaveAttribute(
      'src',
      expect.stringContaining(PHOTO_B),
    );
  });

  it('shows the wait again at the next click after a refusal, with a fresh start', async () => {
    const held = holdStarts();
    const user = await openPicker();
    await user.click(start());
    await vi.waitFor(() => expect(held.sent()).toBe(1));
    await held.answer(failure(500, 'INTERNAL_ERROR'));
    await screen.findByRole('alert');

    await user.click(start());

    expect(await screen.findByText('Примеряем…')).toBeVisible();
    await vi.waitFor(() => expect(held.sent()).toBe(2));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('brings the limit card when the api refuses at the limit, and nothing of the wait stays', async () => {
    const held = holdStarts();
    const user = await openPicker();
    await user.click(start());
    await screen.findByText('Примеряем…');
    await vi.waitFor(() => expect(held.sent()).toBe(1));

    await held.answer(failure(409, 'LIMIT_REACHED'));

    expect(
      await screen.findByRole('heading', { name: 'Примерки на этот месяц закончились' }),
    ).toBeVisible();
    expect(screen.queryByText('Примеряем…')).not.toBeInTheDocument();
  });

  it('keeps the wait of a repeated start that answers a finished result, then shows the result', async () => {
    const held = holdStarts();
    api.fittings.set(NEXT, done({ id: NEXT }));
    const user = await openPicker();
    await user.click(start());
    await screen.findByText('Примеряем…');
    await vi.waitFor(() => expect(held.sent()).toBe(1));

    await held.answer(json(200, { ...done({ id: NEXT }), repeated: true }));

    expect(await screen.findByText('Сгенерировано ИИ')).toBeVisible();
    expect(screen.queryByText('Примеряем…')).not.toBeInTheDocument();
  });

  describe('a regeneration', () => {
    async function regenerateFromResult() {
      api.fittings.set(RUNNING, done());
      const held = holdStarts();
      const user = setup();
      renderTryOn({ fittingId: RUNNING });
      await user.click(
        await screen.findByRole('button', { name: 'Хотите что-то поменять в образе?' }),
      );
      await user.click(await screen.findByRole('button', { name: /Перегенерировать/ }));
      await vi.waitFor(() => expect(held.sent()).toBe(1));
      return { held, user };
    }

    it('shows the plain wait at once, with the sheet closed and the result kept out of sight', async () => {
      await regenerateFromResult();

      expect(await screen.findByText('Примеряем…')).toBeVisible();
      await vi.waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Что поменять?' })).not.toBeInTheDocument(),
      );
      expect(screen.getByText('Сгенерировано ИИ')).not.toBeVisible();
    });

    it('opens the sheet again with the reason when the comment is refused, and the wait goes', async () => {
      const { held } = await regenerateFromResult();
      await screen.findByText('Примеряем…');

      await held.answer(failure(400, 'PROMPT_REFUSED'));

      const sheet = await screen.findByRole('dialog', { name: 'Что поменять?' });
      expect(await within(sheet).findByRole('alert')).toHaveTextContent(
        'Текст не подходит для примерки',
      );
      expect(screen.queryByText('Примеряем…')).not.toBeInTheDocument();
      expect(screen.getByText('Сгенерировано ИИ')).toBeVisible();
    });

    it('opens the sheet again with the text of any other failure', async () => {
      const { held } = await regenerateFromResult();
      await screen.findByText('Примеряем…');

      await held.answer(failure(500, 'INTERNAL_ERROR'));

      const sheet = await screen.findByRole('dialog', { name: 'Что поменять?' });
      expect(await within(sheet).findByRole('alert')).toHaveTextContent(
        'Ошибка на сервере, попробуйте позже',
      );
      expect(screen.queryByText('Примеряем…')).not.toBeInTheDocument();
    });

    it('shows the limit card at the limit, with the sheet closed and no wait', async () => {
      const { held } = await regenerateFromResult();
      await screen.findByText('Примеряем…');

      await held.answer(failure(409, 'LIMIT_REACHED'));

      expect(
        await screen.findByRole('heading', { name: 'Примерки на этот месяц закончились' }),
      ).toBeVisible();
      expect(screen.queryByText('Примеряем…')).not.toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: 'Что поменять?' })).not.toBeInTheDocument();
    });

    it('goes on with the running fitting when the api answers', async () => {
      const { held } = await regenerateFromResult();
      api.fittings.set(NEXT, fitting({ id: NEXT, parentId: RUNNING }));

      await held.answer(startedResponse({ parentId: RUNNING }));

      await vi.waitFor(() => expect(isFittingShown(NEXT)).toBe(true));
      expect(screen.getByText('Примеряем…')).toBeVisible();
      expect(screen.queryByRole('dialog', { name: 'Что поменять?' })).not.toBeInTheDocument();
    });
  });

  describe('another colour over a result', () => {
    async function pickBlue() {
      api.fittings.set(RUNNING, done());
      const held = holdStarts();
      const user = setup();
      renderTryOn({ fittingId: RUNNING });
      await screen.findByText('Сгенерировано ИИ');
      await user.click(await screen.findByRole('button', { name: 'Синий' }));
      await vi.waitFor(() => expect(held.sent()).toBe(1));
      return held;
    }

    it('shows the progress over the picture before the api answers', async () => {
      await pickBlue();

      expect(await screen.findByText(/Примеряем Синий…/)).toBeInTheDocument();
      expect(screen.getByText('Пока идёт примерка, другие цвета недоступны')).toBeInTheDocument();
      expect(screen.queryByText('Примеряем…')).not.toBeInTheDocument();
    });

    it('takes the progress away and says why when the api refuses', async () => {
      const held = await pickBlue();
      await screen.findByText(/Примеряем Синий…/);

      await held.answer(failure(500, 'INTERNAL_ERROR'));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Ошибка на сервере, попробуйте позже',
      );
      expect(screen.queryByText(/Примеряем Синий/)).not.toBeInTheDocument();
      expect(screen.getByText('Сгенерировано ИИ')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Синий' })).toBeEnabled();
    });

    it('takes the progress away and shows the limit card at the limit', async () => {
      const held = await pickBlue();
      await screen.findByText(/Примеряем Синий…/);

      await held.answer(failure(409, 'LIMIT_REACHED'));

      expect(
        await screen.findByRole('heading', { name: 'Примерки на этот месяц закончились' }),
      ).toBeVisible();
      expect(screen.queryByText(/Примеряем Синий/)).not.toBeInTheDocument();
    });
  });

  describe('the one-time photo of a start on its way', () => {
    async function uploadOneTime(user: ReturnType<typeof setup>, name: string, turnOff: boolean) {
      await user.click(await screen.findByRole('button', { name: 'Заменить фото' }));
      const dialog = await screen.findByRole('dialog', { name: 'Заменить фото' });
      if (turnOff) await user.click(within(dialog).getByRole('switch', { name: /Сохранить фото/ }));
      const input = dialog.querySelector<HTMLInputElement>('input[type="file"]:not([capture])');
      await user.upload(input!, new File(['x'], name, { type: 'image/jpeg' }));
      await vi.waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Заменить фото' })).toBeNull(),
      );
    }

    it('is not deleted when the window closes before the api answers; the others are', async () => {
      let count = 0;
      api.upload = () => {
        count += 1;
        return json(201, photo(`00000000-0000-4000-8000-00000000020${count}`, { transient: true }));
      };
      const held = holdStarts();
      const user = setup();
      const { unmount } = renderTryOn({ productId: PRODUCT });
      await uploadOneTime(user, 'one.jpg', true);
      await uploadOneTime(user, 'two.jpg', false);
      await vi.waitFor(() =>
        expect(screen.getByRole('img', { name: 'Ваше фото' })).toHaveAttribute(
          'src',
          expect.stringContaining('000000000202'),
        ),
      );
      await vi.waitFor(() => expect(start()).toBeEnabled());
      await user.click(start());
      await vi.waitFor(() => expect(held.sent()).toBe(1));

      unmount();

      await vi.waitFor(() => expect(deletes()).toHaveLength(1));
      await act(async () => {
        await Promise.resolve();
      });
      expect(deletes().map(({ path }) => path)).toEqual([
        '/api/me/photos/transient/00000000-0000-4000-8000-000000000201',
      ]);
    });

    it('is deleted with the window when the start was refused', async () => {
      const held = holdStarts();
      const user = setup();
      const { unmount } = renderTryOn({ productId: PRODUCT });
      await uploadOneTime(user, 'one.jpg', true);
      await vi.waitFor(() => expect(start()).toBeEnabled());
      await user.click(start());
      await vi.waitFor(() => expect(held.sent()).toBe(1));
      await held.answer(failure(500, 'INTERNAL_ERROR'));
      await screen.findByRole('alert');

      unmount();

      await vi.waitFor(() => expect(deletes()).toHaveLength(1));
      expect(deletes()[0]?.path).toBe(`/api/me/photos/transient/${ONE_TIME}`);
    });
  });
});

describe('TryOn owner', () => {
  const signedIn = (id: string): SessionState => ({
    status: 'signed-in',
    user: { id, email: `${id}@example.com`, name: null },
  });

  function renderOwned() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onClose = vi.fn();
    // A new element each time: the same one would bail out and not read the session again.
    const tree = () => (
      <QueryClientProvider client={queryClient}>
        <TryOn productId={PRODUCT} onClose={onClose} />
      </QueryClientProvider>
    );
    const view = render(tree());
    return { onClose, again: () => view.rerender(tree()) };
  }

  it('shows nothing and closes once when another user signs in', async () => {
    mocks.session = signedIn('u1');
    const { onClose, again } = renderOwned();
    expect(await screen.findByRole('dialog', { name: 'Онлайн-примерка' })).toBeInTheDocument();

    mocks.session = signedIn('u2');
    again();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows nothing and closes when the session ends', async () => {
    mocks.session = signedIn('u1');
    const { onClose, again } = renderOwned();
    await screen.findByRole('dialog', { name: 'Онлайн-примерка' });

    mocks.session = { status: 'signed-out', failed: false };
    again();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open when the session read failed', async () => {
    mocks.session = signedIn('u1');
    const { onClose, again } = renderOwned();
    await screen.findByRole('dialog', { name: 'Онлайн-примерка' });

    mocks.session = { status: 'signed-out', failed: true };
    again();

    expect(screen.getByRole('dialog', { name: 'Онлайн-примерка' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('opened while the session loads, takes the first user as its owner', async () => {
    mocks.session = { status: 'pending' };
    const { onClose, again } = renderOwned();

    mocks.session = signedIn('u1');
    again();
    expect(await screen.findByRole('dialog', { name: 'Онлайн-примерка' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    mocks.session = signedIn('u2');
    again();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
