import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { userKeys, type User } from '@/entities/user';

import { MyPhotos } from './my-photos';

const mocks = vi.hoisted(() => ({ track: vi.fn(), captureException: vi.fn() }));

vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }));

vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  reset: vi.fn(),
  track: mocks.track,
}));

// Better Auth's session atom stops a second after its last listener leaves, on a timer that could
// outlive this file's jsdom ("window is not defined"); the session these tests saw is a failed read.
vi.mock('@/entities/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/session')>()),
  useSession: () => ({ status: 'signed-out', failed: true }),
}));

const fetchMock = vi.fn();

// Base UI turns pointer events off on the page while a modal is open; the styles that give them
// back to the dialog are not loaded in jsdom.
const setup = () => userEvent.setup({ pointerEventsCheck: 0 });

const SIGNED = 'https://s3.test/keep/users/u';

function photo(n: number, isDefault = false) {
  return {
    id: `00000000-0000-4000-8000-00000000000${n}`,
    url: `${SIGNED}/p${n}.webp?X-Amz-Signature=sig${n}`,
    isDefault,
    transient: false,
    width: 768,
    height: 1024,
    createdAt: '2026-10-23T10:00:00.000Z',
  };
}

const makeDefaultOf = (n: number) => ({ name: `Сделать основным фото ${n}` });

const photos = (count: number) =>
  Array.from({ length: count }, (_, index) => photo(index + 1, index === 0));

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

const apiError = (status: number, code: string) =>
  json({ error: { code, message: 'm', details: [] } }, status);

// Answers GET /me/photos with `list` and every write with `write`.
function api(list: () => unknown, write: () => Promise<Response> = () => json(photo(2, true))) {
  fetchMock.mockImplementation((_url: unknown, init?: RequestInit) =>
    (init?.method ?? 'GET') === 'GET' ? json(list()) : write(),
  );
}

function calls(method: string) {
  return fetchMock.mock.calls
    .map(([url, init]) => ({
      method: (init as RequestInit | undefined)?.method ?? 'GET',
      path: new URL(String(url)).pathname,
      init: init as RequestInit | undefined,
    }))
    .filter((call) => call.method === method);
}

const USER: User = {
  id: '00000000-0000-4000-8000-000000000001',
  phone: null,
  email: 'anna@example.com',
  firstName: 'Анна',
  lastName: null,
  patronymic: null,
  dateOfBirth: null,
  gender: null,
  fittingProfileImageKey: null,
  fittingProfileImageUrl: null,
  photoConsentVersion: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
};

// The user's consents come from `GET /me` (spec 0023 Y1): seeded here, so the upload knows at once
// whether to show the tips. The photos' list stays fresh-less as before.
function renderPhotos(photoConsentVersion: number | null = null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(userKeys.me, { ...USER, photoConsentVersion });
  queryClient.setQueryDefaults(userKeys.me, { staleTime: Infinity });
  return render(
    <QueryClientProvider client={queryClient}>
      <MyPhotos />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('MyPhotos loading and failure', () => {
  it('shows skeletons while the list loads', () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    const { container } = renderPhotos();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Добавить фото' })).not.toBeInTheDocument();
  });

  it('shows the error with «Повторить», which reads the list again', async () => {
    fetchMock.mockImplementationOnce(() => apiError(503, 'SERVICE_UNAVAILABLE'));
    fetchMock.mockImplementation(() => json(photos(2)));
    const user = setup();
    renderPhotos();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Сервис временно недоступен, попробуйте позже',
    );
    await user.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(await screen.findByText(/2 из 5/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('MyPhotos list', () => {
  it('shows the empty state with the upload', async () => {
    api(() => []);
    renderPhotos();

    expect(await screen.findByText('Здесь появятся ваши фото')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Добавить фото' })).toBeEnabled();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows the count and each photo by its place, the photo link only as a src', async () => {
    api(() => photos(3));
    const { container } = renderPhotos();

    expect(await screen.findByText(/^3 из 5 · видите только вы/)).toBeInTheDocument();
    const images = screen.getAllByRole('img');
    expect(images.map((image) => image.getAttribute('alt'))).toEqual([
      'Фото 1',
      'Фото 2',
      'Фото 3',
    ]);
    expect(images.map((image) => image.getAttribute('src'))).toEqual([
      `${SIGNED}/p1.webp?X-Amz-Signature=sig1`,
      `${SIGNED}/p2.webp?X-Amz-Signature=sig2`,
      `${SIGNED}/p3.webp?X-Amz-Signature=sig3`,
    ]);
    for (const element of container.querySelectorAll('*')) {
      for (const attribute of element.getAttributeNames()) {
        if (element.tagName === 'IMG' && attribute === 'src') continue;
        expect(element.getAttribute(attribute)).not.toContain('X-Amz-Signature');
        expect(element.getAttribute(attribute)).not.toContain('s3.test');
      }
    }
    for (const figure of screen.getAllByRole('figure')) expect(figure).toHaveClass('mp-block');
    expect(screen.getAllByText('По умолчанию')).toHaveLength(1);
  });

  it('offers «Сделать основным» on every photo but the default one', async () => {
    api(() => photos(3));
    renderPhotos();
    await screen.findByText(/3 из 5/);

    expect(screen.queryByRole('radio', makeDefaultOf(1))).not.toBeInTheDocument();
    expect(screen.getByRole('radio', makeDefaultOf(2))).toBeEnabled();
    expect(screen.getByRole('radio', makeDefaultOf(3))).toBeEnabled();
    expect(screen.getAllByRole('button', { name: /^Удалить фото/ })).toHaveLength(3);
  });

  it('keeps the upload on with four photos and says nothing about the limit', async () => {
    api(() => photos(4));
    renderPhotos();
    await screen.findByText(/4 из 5/);

    expect(screen.getByRole('button', { name: 'Добавить фото' })).toBeEnabled();
    expect(screen.queryByText(/Можно сохранить до 5 фото/)).not.toBeInTheDocument();
  });

  it('turns the upload off at five photos and says why', async () => {
    api(() => photos(5));
    renderPhotos();
    await screen.findByText(/5 из 5/);

    expect(screen.getByRole('button', { name: 'Добавить фото' })).toBeDisabled();
    expect(screen.getByText(/Можно сохранить до 5 фото/)).toBeInTheDocument();
  });
});

describe('MyPhotos default photo', () => {
  it('sends the PATCH, tracks the click and reads the list again', async () => {
    let list = photos(3);
    api(
      () => list,
      () => {
        list = [photo(1), photo(2, true), photo(3)];
        return json(photo(2, true));
      },
    );
    const user = setup();
    renderPhotos();
    await user.click(await screen.findByRole('radio', makeDefaultOf(2)));

    await vi.waitFor(() => expect(screen.getByRole('radio', makeDefaultOf(1))).toBeInTheDocument());
    expect(screen.queryByRole('radio', makeDefaultOf(2))).not.toBeInTheDocument();
    const [patch] = calls('PATCH');
    expect(patch?.path).toBe(`/api/me/photos/${photo(2).id}`);
    expect(JSON.parse(String(patch?.init?.body))).toEqual({ isDefault: true });
    expect(calls('GET')).toHaveLength(2);
    expect(
      mocks.track.mock.calls.filter(
        ([name, props]) =>
          name === 'Element Clicked' &&
          (props as { element: string }).element === 'photos.set-default',
      ),
    ).toHaveLength(1);
  });

  it('reads the list again and shows nothing when the photo is already gone (404)', async () => {
    api(
      () => photos(3),
      () => apiError(404, 'NOT_FOUND'),
    );
    const user = setup();
    renderPhotos();
    await user.click(await screen.findByRole('radio', makeDefaultOf(2)));

    await vi.waitFor(() => expect(calls('GET')).toHaveLength(2));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(calls('PATCH')).toHaveLength(1);
  });

  it('shows another failure, once, without repeating the request', async () => {
    api(
      () => photos(3),
      () => apiError(503, 'SERVICE_UNAVAILABLE'),
    );
    const user = setup();
    renderPhotos();
    await user.click(await screen.findByRole('radio', makeDefaultOf(2)));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Сервис временно недоступен, попробуйте позже',
    );
    expect(calls('PATCH')).toHaveLength(1);
    expect(mocks.captureException).toHaveBeenCalled();
  });
});

describe('MyPhotos deletion', () => {
  async function openDeletion(index: number) {
    const user = setup();
    renderPhotos();
    await user.click(await screen.findByRole('button', { name: `Удалить фото ${index}` }));
    const dialog = await screen.findByRole('dialog', { name: 'Удалить фото?' });
    return { user, dialog };
  }

  it('asks first, says what goes and what stays, and opens on «Отмена»', async () => {
    api(() => photos(3));
    const { dialog } = await openDeletion(2);

    expect(dialog).toHaveTextContent(
      'Фото и его копии удалятся. Результаты примерок в истории останутся.',
    );
    await vi.waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Отмена' })).toHaveFocus(),
    );
    expect(calls('DELETE')).toHaveLength(0);
  });

  it('«Отмена» closes the modal and sends nothing', async () => {
    api(() => photos(3));
    const { user, dialog } = await openDeletion(2);
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls('DELETE')).toHaveLength(0);
    expect(calls('GET')).toHaveLength(1);
  });

  it('«Удалить» sends the DELETE of that photo, closes the modal and reads the list again', async () => {
    let list = photos(3);
    api(
      () => list,
      () => {
        list = [photo(1, true), photo(3)];
        return Promise.resolve(new Response(null, { status: 204 }));
      },
    );
    const { user, dialog } = await openDeletion(2);
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText(/^2 из 5/)).toBeInTheDocument();
    expect(calls('DELETE')).toHaveLength(1);
    expect(calls('DELETE')[0]?.path).toBe(`/api/me/photos/${photo(2).id}`);
    expect(calls('GET')).toHaveLength(2);
    expect(screen.getAllByRole('img')).toHaveLength(2);
    expect(
      mocks.track.mock.calls.filter(
        ([name, props]) =>
          name === 'Element Clicked' && (props as { element: string }).element === 'photos.delete',
      ),
    ).toHaveLength(1);
  });

  it('a photo already gone (404) closes the modal and reads the list again, with no error', async () => {
    api(
      () => photos(3),
      () => apiError(404, 'NOT_FOUND'),
    );
    const { user, dialog } = await openDeletion(2);
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await vi.waitFor(() => expect(calls('GET')).toHaveLength(2));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('another failure keeps the modal open with its text, sends once and can be cleared by closing', async () => {
    api(
      () => photos(3),
      () => apiError(503, 'SERVICE_UNAVAILABLE'),
    );
    const { user, dialog } = await openDeletion(2);
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Сервис временно недоступен, попробуйте позже',
    );
    expect(screen.getByRole('dialog', { name: 'Удалить фото?' })).toBeInTheDocument();
    expect(calls('DELETE')).toHaveLength(1);
    expect(calls('GET')).toHaveLength(1);
    expect(mocks.captureException).toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Удалить фото 3' }));
    expect(
      within(await screen.findByRole('dialog', { name: 'Удалить фото?' })).queryByRole('alert'),
    ).not.toBeInTheDocument();
  });

  it('cannot be closed while the deletion is on its way', async () => {
    api(
      () => photos(3),
      () => new Promise<Response>(() => undefined),
    );
    const { user, dialog } = await openDeletion(2);
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));

    await vi.waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Отмена' })).toBeDisabled(),
    );
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Удалить фото?' })).toBeInTheDocument();
    expect(calls('DELETE')).toHaveLength(1);
  });

  it("shows another photo's thumbnail when the confirmation opens again after «Отмена»", async () => {
    api(() => photos(3));
    const { user, dialog } = await openDeletion(2);
    expect(within(dialog).getByRole('img', { name: 'Фото 2' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Удалить фото 3' }));

    const again = await screen.findByRole('dialog', { name: 'Удалить фото?' });
    expect(within(again).getByRole('img', { name: 'Фото 3' })).toHaveAttribute(
      'src',
      `${SIGNED}/p3.webp?X-Amz-Signature=sig3`,
    );
    expect(within(again).queryByRole('img', { name: 'Фото 2' })).not.toBeInTheDocument();
  });

  it('shows the chosen photo in the confirmation, without the default badge', async () => {
    api(() => photos(3));
    const { dialog } = await openDeletion(1);

    const image = within(dialog).getByRole('img', { name: 'Фото 1' });
    expect(image).toHaveAttribute('src', `${SIGNED}/p1.webp?X-Amz-Signature=sig1`);
    expect(within(dialog).getAllByRole('img')).toHaveLength(1);
    expect(dialog).not.toHaveTextContent('По умолчанию');
    expect(image.closest('figure')).toHaveClass('mp-block');
  });
});

describe('MyPhotos on a wide screen', () => {
  it('puts the dashed «Добавить фото» card in the last cell of the grid, after the photos', async () => {
    api(() => photos(3));
    renderPhotos();
    await screen.findByText(/3 из 5/);

    const cells = within(screen.getAllByRole('list')[0]!).getAllByRole('listitem');
    expect(cells).toHaveLength(4);
    expect(within(cells[3]!).getByRole('button', { name: 'Добавить фото' })).toBeEnabled();
    for (const cell of cells.slice(0, 3)) {
      expect(within(cell).queryByRole('button', { name: 'Добавить фото' })).not.toBeInTheDocument();
    }
  });

  it('asks a user with no stored consents for them before the first upload (AC19)', async () => {
    api(() => photos(2));
    const user = setup();
    renderPhotos(null);

    await user.click(await screen.findByRole('button', { name: 'Добавить фото' }));

    const dialog = await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });
    expect(within(dialog).getByRole('checkbox', { name: 'На фото — я' })).not.toBeChecked();
  });

  it('opens no tips for a user whose /me holds the consents (version 1)', async () => {
    api(() => photos(2));
    const user = setup();
    renderPhotos(1);

    await user.click(await screen.findByRole('button', { name: 'Добавить фото' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).not.toBeNull();
  });

  it('keeps the card last and off at five photos', async () => {
    api(() => photos(5));
    renderPhotos();
    await screen.findByText(/5 из 5/);

    const cells = within(screen.getAllByRole('list')[0]!).getAllByRole('listitem');
    expect(cells).toHaveLength(6);
    expect(within(cells[5]!).getByRole('button', { name: 'Добавить фото' })).toBeDisabled();
  });

  it('says the photos are not used for training in the summary, with no separate lock line', async () => {
    api(() => photos(2));
    renderPhotos();

    expect(
      await screen.findByText('2 из 5 · видите только вы · не используются для обучения моделей'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/не видны другим людям/)).not.toBeInTheDocument();
  });

  it('gives the default photo no «Сделать основным» radio, and every other one its own', async () => {
    api(() => photos(3));
    renderPhotos();
    await screen.findByText(/3 из 5/);

    expect(screen.queryByRole('radiogroup', { name: 'Фото 1' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('radiogroup')).toHaveLength(2);
  });

  it('puts the limit note after the list at five photos', async () => {
    api(() => photos(5));
    renderPhotos();
    const note = await screen.findByText(/Можно сохранить до 5 фото/);

    const list = screen.getAllByRole('list')[0]!;
    expect(list).not.toContainElement(note);
    expect(list.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('MyPhotos on a phone', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(width < 600px)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });

  it('lists the photos as rows with text buttons, a lock line and the upload below', async () => {
    api(() => photos(3));
    renderPhotos();

    expect(await screen.findByText('3 из 5 · видите только вы')).toBeInTheDocument();
    expect(
      screen.getByText('Фото не используются для обучения моделей и не видны другим людям.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сделать основным фото 2' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Сделать основным фото 3' })).toBeEnabled();
    expect(screen.getAllByRole('button', { name: /^Удалить фото/ })).toHaveLength(3);
    expect(screen.getAllByText('По умолчанию')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Добавить фото' })).toBeEnabled();
  });

  it('holds the lock line, the limit note and the upload in the last item of the one list', async () => {
    api(() => photos(5));
    renderPhotos();
    await screen.findByText(/5 из 5/);

    const items = within(screen.getAllByRole('list')[0]!).getAllByRole('listitem');
    expect(items).toHaveLength(6);
    const last = items[5]!;
    expect(last).toHaveTextContent(
      'Фото не используются для обучения моделей и не видны другим людям.',
    );
    expect(last).toHaveTextContent('Можно сохранить до 5 фото');
    expect(within(last).getByRole('button', { name: 'Добавить фото' })).toBeDisabled();
  });

  it('«Сделать основным» sends the PATCH of that photo', async () => {
    api(() => photos(3));
    const user = setup();
    renderPhotos();
    await user.click(await screen.findByRole('button', { name: 'Сделать основным фото 3' }));

    await vi.waitFor(() => expect(calls('PATCH')).toHaveLength(1));
    expect(calls('PATCH')[0]?.path).toBe(`/api/me/photos/${photo(3).id}`);
  });

  it('turns the upload off at five photos', async () => {
    api(() => photos(5));
    renderPhotos();
    await screen.findByText(/5 из 5/);

    expect(screen.getByRole('button', { name: 'Добавить фото' })).toBeDisabled();
    expect(screen.getByText(/Можно сохранить до 5 фото/)).toBeInTheDocument();
  });

  it('confirms a deletion in a sheet with the thumbnail, opening on «Отмена» after «Удалить»', async () => {
    api(
      () => photos(3),
      () => Promise.resolve(new Response(null, { status: 204 })),
    );
    const user = setup();
    renderPhotos();
    await user.click(await screen.findByRole('button', { name: 'Удалить фото 2' }));

    const dialog = await screen.findByRole('dialog', { name: 'Удалить фото?' });
    expect(dialog).toHaveTextContent(
      'Фото и его копии удалятся. Результаты примерок в истории останутся.',
    );
    expect(within(dialog).getByRole('img', { name: 'Фото 2' })).toHaveAttribute(
      'src',
      `${SIGNED}/p2.webp?X-Amz-Signature=sig2`,
    );
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Удалить', 'Отмена']);
    await vi.waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Отмена' })).toHaveFocus(),
    );
    expect(calls('DELETE')).toHaveLength(0);

    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));

    await vi.waitFor(() => expect(calls('DELETE')).toHaveLength(1));
    expect(calls('DELETE')[0]?.path).toBe(`/api/me/photos/${photo(2).id}`);
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('«Отмена» closes the sheet and sends nothing', async () => {
    api(() => photos(3));
    const user = setup();
    renderPhotos();
    await user.click(await screen.findByRole('button', { name: 'Удалить фото 2' }));
    const dialog = await screen.findByRole('dialog', { name: 'Удалить фото?' });

    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls('DELETE')).toHaveLength(0);
  });
});

describe('MyPhotos across the phone break', () => {
  it('keeps the upload and its open tips (not remounted) when the window crosses 600px', async () => {
    const listeners = new Set<() => void>();
    let phone = false;
    vi.stubGlobal('matchMedia', (query: string) => ({
      get matches() {
        return query === '(width < 600px)' && phone;
      },
      media: query,
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    }));
    const cross = (next: boolean) =>
      act(() => {
        phone = next;
        for (const listener of listeners) listener();
      });
    api(() => photos(2));
    const user = setup();
    renderPhotos();
    await user.click(await screen.findByRole('button', { name: 'Добавить фото' }));
    const wide = await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });
    await user.click(within(wide).getByRole('checkbox', { name: 'На фото — я' }));

    cross(true);

    expect(await screen.findByRole('dialog', { name: 'Какое фото подойдёт' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Понятно' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Понятно' }));
    // The checkbox ticked on the wide screen is still ticked: the upload kept its state.
    const choose = await screen.findByRole('dialog', { name: 'Ваше фото' });
    expect(within(choose).getByRole('checkbox', { name: 'На фото — я' })).toBeChecked();

    cross(false);

    expect(await screen.findByRole('dialog', { name: 'Какое фото подойдёт' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'На фото — я' })).toBeChecked();
  });
});
