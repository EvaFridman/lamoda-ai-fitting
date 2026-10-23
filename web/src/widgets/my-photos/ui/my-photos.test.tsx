import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MyPhotos } from './my-photos';

const mocks = vi.hoisted(() => ({ track: vi.fn(), captureException: vi.fn() }));

vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }));

vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  reset: vi.fn(),
  track: mocks.track,
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

function renderPhotos() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

    expect(
      screen.queryByRole('button', { name: 'Сделать фото 1 основным' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сделать фото 2 основным' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Сделать фото 3 основным' })).toBeEnabled();
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
    await user.click(await screen.findByRole('button', { name: 'Сделать фото 2 основным' }));

    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Сделать фото 1 основным' })).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('button', { name: 'Сделать фото 2 основным' }),
    ).not.toBeInTheDocument();
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
    await user.click(await screen.findByRole('button', { name: 'Сделать фото 2 основным' }));

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
    await user.click(await screen.findByRole('button', { name: 'Сделать фото 2 основным' }));

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
});
