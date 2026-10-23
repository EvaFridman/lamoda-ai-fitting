import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionState } from '@/entities/session';
import { userPhotoKeys } from '@/entities/user-photo';

import { MAX_PHOTO_BYTES } from '../lib/upload-error';
import { UploadPhoto, type UploadPhotoProps } from './upload-photo';

const mocks = vi.hoisted(() => ({
  track: vi.fn(),
  captureException: vi.fn(),
  session: { status: 'pending' } as SessionState,
}));

vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }));

vi.mock('@/entities/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/session')>()),
  useSession: () => mocks.session,
}));

const ANNA = 'user-anna';
const BORIS = 'user-boris';
const keyOf = (id: string) => `fitting-photo-consent:${id}`;

function signInAs(id: string) {
  mocks.session = { status: 'signed-in', user: { id, email: `${id}@example.com`, name: id } };
}

vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  reset: vi.fn(),
  track: mocks.track,
}));

const fetchMock = vi.fn();

// Base UI turns pointer events off on the page while a modal is open; the styles that give them
// back to the dialog are not loaded in jsdom.
const setup = () => userEvent.setup({ pointerEventsCheck: 0 });

const PHOTO = {
  id: '3f0c1b0e-8d52-4a57-9d6c-0c9f6d1d4a11',
  url: 'https://s3.test/keep/users/u/photo.webp?X-Amz-Signature=abc',
  isDefault: true,
  transient: false,
  width: 768,
  height: 1024,
  createdAt: '2026-10-23T10:00:00.000Z',
};

const ok = () =>
  Promise.resolve(
    new Response(JSON.stringify(PHOTO), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

function failure(status: number, code: string, details: object[] = []) {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify({ error: { code, message: 'm', details } }), { status }),
    );
}

const refusedWith = (reason: string) =>
  failure(400, 'VALIDATION_FAILED', [
    { field: 'photo', code: 'PHOTO_REFUSED', message: `photo was refused: ${reason}` },
  ]);

function renderUpload(props: Partial<UploadPhotoProps> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const onUploaded = vi.fn();
  const { unmount } = render(
    <QueryClientProvider client={queryClient}>
      <UploadPhoto place="photos" onUploaded={onUploaded} {...props} />
    </QueryClientProvider>,
  );
  return { invalidate, onUploaded, unmount };
}

function fileInputs() {
  const inputs = [...document.querySelectorAll<HTMLInputElement>('input[type="file"]')];
  return {
    file: inputs.find((input) => !input.hasAttribute('capture')),
    camera: inputs.find((input) => input.hasAttribute('capture')),
    all: inputs,
  };
}

const picture = (name = 'me.jpg') => new File(['x'], name, { type: 'image/jpeg' });

function tracked(name: string) {
  return mocks.track.mock.calls.filter(([event]) => event === name);
}

function requestOf(index = 0) {
  const [url, init] = fetchMock.mock.calls[index] as [unknown, RequestInit];
  return { path: new URL(String(url)).pathname, init };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  window.localStorage.clear();
  signInAs(ANNA);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('UploadPhoto before the consents', () => {
  it('shows only «Добавить фото» and no file input until it is clicked', () => {
    renderUpload();
    expect(screen.getByRole('button', { name: 'Добавить фото' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Сделать фото' })).not.toBeInTheDocument();
    expect(fileInputs().all).toHaveLength(0);
  });

  it('opens the tips and the two consents, and keeps both pickers off until both are checked', async () => {
    const user = setup();
    renderUpload();
    await user.click(screen.getByRole('button', { name: 'Добавить фото' }));

    const dialog = await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });
    expect(dialog).toHaveTextContent('Подойдёт');
    expect(dialog).toHaveTextContent('Не подойдёт');
    expect(dialog).toHaveTextContent('JPG, PNG или WebP до 20 МБ');
    expect(within(dialog).getByRole('checkbox', { name: /OpenAI/ })).not.toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Выбрать фото' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Сделать фото' })).toBeDisabled();
    expect(within(dialog).getByText('Отметьте оба пункта, чтобы продолжить')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('checkbox', { name: 'На фото — я' }));
    expect(within(dialog).getByRole('button', { name: 'Выбрать фото' })).toBeDisabled();
    expect(within(dialog).getByText('Отметьте оба пункта, чтобы продолжить')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('checkbox', { name: /OpenAI/ }));
    expect(within(dialog).getByRole('button', { name: 'Выбрать фото' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Сделать фото' })).toBeEnabled();
    expect(
      within(dialog).queryByText('Отметьте оба пункта, чтобы продолжить'),
    ).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(keyOf(ANNA))).toBeNull();
  });

  it('keeps the pickers off when only the processing consent is checked', async () => {
    const user = setup();
    renderUpload();
    await user.click(screen.getByRole('button', { name: 'Добавить фото' }));
    await user.click(await screen.findByRole('checkbox', { name: /OpenAI/ }));

    expect(screen.getByRole('button', { name: 'Выбрать фото' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Сделать фото' })).toBeDisabled();
  });

  it('links the privacy policy in a new tab', async () => {
    const user = setup();
    renderUpload();
    await user.click(screen.getByRole('button', { name: 'Добавить фото' }));
    const link = await screen.findByRole('link', {
      name: 'политике по работе с персональными данными',
    });
    expect(link).toHaveAttribute('href', '/privacy');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('closes the tips with nothing sent and no consent stored', async () => {
    const user = setup();
    renderUpload();
    await user.click(screen.getByRole('button', { name: 'Добавить фото' }));
    await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });
    await user.keyboard('{Escape}');

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(keyOf(ANNA))).toBeNull();
  });

  it('is off when the saved photos are at their limit', () => {
    renderUpload({ disabled: true });
    expect(screen.getByRole('button', { name: 'Добавить фото' })).toBeDisabled();
  });
});

describe('UploadPhoto consent per user', () => {
  it("shows another user the consent screen and leaves the first user's consent as it was", async () => {
    window.localStorage.setItem(keyOf(ANNA), '1');
    signInAs(BORIS);
    const user = setup();
    renderUpload();

    expect(screen.queryByRole('button', { name: 'Сделать фото' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Добавить фото' }));
    const dialog = await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });
    expect(within(dialog).getByRole('checkbox', { name: 'На фото — я' })).not.toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Выбрать фото' })).toBeDisabled();
    expect(window.localStorage.getItem(keyOf(ANNA))).toBe('1');
    expect(window.localStorage.getItem(keyOf(BORIS))).toBeNull();
  });

  it('writes only the signed-in user key when a file is chosen', async () => {
    const id = 'user-writer';
    signInAs(id);
    fetchMock.mockImplementation(ok);
    const user = setup();
    renderUpload();
    await user.click(screen.getByRole('button', { name: 'Добавить фото' }));
    const dialog = await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });
    await user.click(within(dialog).getByRole('checkbox', { name: 'На фото — я' }));
    await user.click(within(dialog).getByRole('checkbox', { name: /OpenAI/ }));
    await user.upload(
      dialog.querySelector<HTMLInputElement>('input[type="file"]:not([capture])')!,
      picture(),
    );

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(window.localStorage.getItem(keyOf(id))).toBe('1');
    expect(window.localStorage).toHaveLength(1);
  });

  it.each([['pending'], ['signed-out']])(
    'counts as not consented and writes nothing when the session is %s',
    async (status) => {
      window.localStorage.setItem(keyOf(ANNA), '1');
      mocks.session = { status } as SessionState;
      const user = setup();
      renderUpload();

      expect(screen.queryByRole('button', { name: 'Сделать фото' })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Добавить фото' }));
      const dialog = await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });
      expect(within(dialog).getByRole('checkbox', { name: 'На фото — я' })).toBeInTheDocument();
      expect(window.localStorage).toHaveLength(1);
    },
  );

  it('keeps the consent in the tab for that user only when the storage throws', async () => {
    const id = 'user-no-storage';
    signInAs(id);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    fetchMock.mockImplementation(ok);
    const user = setup();
    const first = renderUpload();
    await user.click(screen.getByRole('button', { name: 'Добавить фото' }));
    const dialog = await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });
    await user.click(within(dialog).getByRole('checkbox', { name: 'На фото — я' }));
    await user.click(within(dialog).getByRole('checkbox', { name: /OpenAI/ }));
    await user.upload(
      dialog.querySelector<HTMLInputElement>('input[type="file"]:not([capture])')!,
      picture(),
    );
    await vi.waitFor(() => expect(first.onUploaded).toHaveBeenCalledTimes(1));
    first.unmount();
    expect(window.localStorage.getItem(keyOf(id))).toBeNull();

    const again = renderUpload();
    expect(screen.getByRole('button', { name: 'Сделать фото' })).toBeEnabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    again.unmount();

    signInAs(BORIS);
    renderUpload();
    expect(screen.queryByRole('button', { name: 'Сделать фото' })).not.toBeInTheDocument();
  });

  it("follows another tab's consent of the signed-in user", async () => {
    signInAs('user-other-tab');
    renderUpload();
    expect(screen.queryByRole('button', { name: 'Сделать фото' })).not.toBeInTheDocument();

    act(() => {
      window.localStorage.setItem(keyOf('user-other-tab'), '1');
      window.dispatchEvent(new StorageEvent('storage', { key: keyOf('user-other-tab') }));
    });
    expect(screen.getByRole('button', { name: 'Сделать фото' })).toBeEnabled();
  });
});

describe('UploadPhoto with the consents given', () => {
  beforeEach(() => {
    window.localStorage.setItem(keyOf(ANNA), '1');
  });

  it('shows the two pickers at once, no modal, with the accepted types and the front camera', () => {
    renderUpload();
    expect(screen.getByRole('button', { name: 'Добавить фото' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Сделать фото' })).toBeEnabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const { file, camera } = fileInputs();
    expect(file).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
    expect(camera).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
    expect(camera).toHaveAttribute('capture', 'user');
    expect(file).not.toHaveAttribute('capture');
  });

  it('uploads the chosen file as a saved photo, refreshes the list and tells the page', async () => {
    fetchMock.mockImplementation(ok);
    const user = setup();
    const { invalidate, onUploaded } = renderUpload();
    await user.upload(fileInputs().file!, picture('me.jpg'));

    await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledWith(PHOTO));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { path, init } = requestOf();
    expect(path).toBe('/api/me/photos');
    expect(init.method).toBe('POST');
    const body = init.body as FormData;
    expect((body.get('photo') as File).name).toBe('me.jpg');
    expect(body.get('save')).toBe('true');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: userPhotoKeys.all });
    expect(tracked('Photo Uploaded')).toEqual([
      ['Photo Uploaded', { saved: true, source: 'file', place: 'photos', first: false }],
    ]);
    expect(tracked('Photo Refused')).toHaveLength(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('tracks the camera as the source', async () => {
    fetchMock.mockImplementation(ok);
    const user = setup();
    renderUpload();
    await user.upload(fileInputs().camera!, picture('shot.jpg'));

    await vi.waitFor(() => expect(tracked('Photo Uploaded')).toHaveLength(1));
    expect(tracked('Photo Uploaded')[0]).toEqual([
      'Photo Uploaded',
      { saved: true, source: 'camera', place: 'photos', first: false },
    ]);
  });

  it('sends the clicks of the two tracked buttons', async () => {
    const user = setup();
    renderUpload();
    await user.click(screen.getByRole('button', { name: 'Добавить фото' }));
    await user.click(screen.getByRole('button', { name: 'Сделать фото' }));

    const elements = tracked('Element Clicked').map(
      ([, props]) => (props as { element: string }).element,
    );
    expect(elements).toEqual(['photos.upload', 'photos.camera']);
  });

  it('refuses a file over the limit with no request', async () => {
    const user = setup();
    renderUpload();
    const big = picture('big.jpg');
    Object.defineProperty(big, 'size', { value: MAX_PHOTO_BYTES + 1 });
    await user.upload(fileInputs().file!, big);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Файл слишком большой: нужно фото до 20 МБ',
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(tracked('Photo Uploaded')).toHaveLength(0);
    expect(tracked('Photo Refused')).toHaveLength(0);
  });

  it('accepts a file of exactly the limit', async () => {
    fetchMock.mockImplementation(ok);
    const user = setup();
    renderUpload();
    const edge = picture('edge.jpg');
    Object.defineProperty(edge, 'size', { value: MAX_PHOTO_BYTES });
    await user.upload(fileInputs().file!, edge);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it('shows the text of IS_IMAGE as an alert and tracks nothing', async () => {
    fetchMock.mockImplementation(
      failure(400, 'VALIDATION_FAILED', [{ field: 'photo', code: 'IS_IMAGE', message: 'm' }]),
    );
    const user = setup();
    renderUpload();
    await user.upload(fileInputs().file!, picture());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Нужно изображение JPG, PNG или WebP',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(tracked('Photo Refused')).toHaveLength(0);
    expect(tracked('Photo Uploaded')).toHaveLength(0);
  });

  it('shows the text of a sixth photo (409 LIMIT_REACHED)', async () => {
    fetchMock.mockImplementation(failure(409, 'LIMIT_REACHED'));
    const user = setup();
    renderUpload();
    await user.upload(fileInputs().file!, picture());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Достигнут лимит, больше добавить нельзя',
    );
  });

  it('does not repeat a request that failed with a 503, and reports it', async () => {
    fetchMock.mockImplementation(failure(503, 'SERVICE_UNAVAILABLE'));
    const user = setup();
    renderUpload();
    await user.upload(fileInputs().file!, picture());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Сервис временно недоступен, попробуйте позже',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.captureException).toHaveBeenCalled();
  });

  it('shows a network failure and lets the next try clear it', async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')));
    fetchMock.mockImplementation(ok);
    const user = setup();
    const { onUploaded } = renderUpload();
    await user.upload(fileInputs().file!, picture());
    expect(await screen.findByRole('alert')).toHaveTextContent('Нет связи с сервером');

    await user.upload(fileInputs().file!, picture());
    await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('turns the picker off while the photo is on its way', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    const user = setup();
    renderUpload();
    await user.upload(fileInputs().file!, picture());

    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Сделать фото' })).toBeDisabled(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends one request when a second file arrives while the first is on its way', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    const user = setup();
    renderUpload();
    await user.upload(fileInputs().file!, picture('first.jpg'));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.change(fileInputs().file!, { target: { files: [picture('second.jpg')] } });
    fireEvent.change(fileInputs().camera!, { target: { files: [picture('third.jpg')] } });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(((requestOf().init.body as FormData).get('photo') as File).name).toBe('first.jpg');
  });

  it('still invalidates the list and tracks the upload when the page was left meanwhile', async () => {
    let answer: (response: Response) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    );
    const user = setup();
    const { invalidate, onUploaded, unmount } = renderUpload();
    await user.upload(fileInputs().file!, picture());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    unmount();
    expect(invalidate).not.toHaveBeenCalled();
    answer(await ok());

    await vi.waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: userPhotoKeys.all }),
    );
    expect(tracked('Photo Uploaded')).toEqual([
      ['Photo Uploaded', { saved: true, source: 'file', place: 'photos', first: false }],
    ]);
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('tracks a refusal that arrives after the page was left', async () => {
    let answer: (response: Response) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    );
    const user = setup();
    const { invalidate, unmount } = renderUpload();
    await user.upload(fileInputs().camera!, picture());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    unmount();
    answer(await refusedWith('dark')());

    await vi.waitFor(() => expect(tracked('Photo Refused')).toHaveLength(1));
    expect(tracked('Photo Refused')[0]).toEqual([
      'Photo Refused',
      { reason: 'dark', source: 'camera', place: 'photos', first: false },
    ]);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('shows the text of a 429 and lets the next successful upload clear it', async () => {
    fetchMock.mockImplementationOnce(failure(429, 'TOO_MANY_REQUESTS'));
    fetchMock.mockImplementation(ok);
    const user = setup();
    const { onUploaded } = renderUpload();
    await user.upload(fileInputs().file!, picture());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Слишком много запросов, подождите немного',
    );

    await user.upload(fileInputs().file!, picture());
    await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  describe('a refusal of the check', () => {
    it('for a child shows one button to load another photo, no camera and no tips', async () => {
      fetchMock.mockImplementation(refusedWith('child'));
      const user = setup();
      renderUpload();
      await user.upload(fileInputs().file!, picture());

      const dialog = await screen.findByRole('dialog', { name: 'Похоже, на фото ребёнок' });
      expect(dialog).toHaveTextContent('Фото не сохранено.');
      expect(dialog).toHaveTextContent('Примерка работает только для взрослых');
      expect(within(dialog).getByRole('button', { name: 'Загрузить своё фото' })).toBeEnabled();
      expect(
        within(dialog).queryByRole('button', { name: 'Сделать фото' }),
      ).not.toBeInTheDocument();
      expect(
        within(dialog).queryByRole('button', { name: 'Какое фото подойдёт' }),
      ).not.toBeInTheDocument();
      expect(tracked('Photo Refused')).toEqual([
        ['Photo Refused', { reason: 'child', source: 'file', place: 'photos', first: false }],
      ]);
      expect(tracked('Photo Uploaded')).toHaveLength(0);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it.each([
      ['dark', 'Фото слишком тёмное'],
      ['not_full', 'Не видно фигуру целиком'],
      ['many_people', 'На фото несколько человек'],
      ['no_person', 'Не нашли человека на фото'],
      ['moderation', 'Фото не подходит для примерки'],
    ])('for %s shows «%s» with another photo, the camera and the tips', async (reason, title) => {
      fetchMock.mockImplementation(refusedWith(reason));
      const user = setup();
      renderUpload();
      await user.upload(fileInputs().camera!, picture());

      const dialog = await screen.findByRole('dialog', { name: title });
      expect(dialog).toHaveTextContent('Фото не сохранено.');
      expect(within(dialog).getByRole('button', { name: 'Выбрать другое фото' })).toBeEnabled();
      expect(within(dialog).getByRole('button', { name: 'Сделать фото' })).toBeEnabled();
      expect(
        within(dialog).getByRole('button', { name: 'Какое фото подойдёт' }),
      ).toBeInTheDocument();
      expect(tracked('Photo Refused')).toEqual([
        ['Photo Refused', { reason, source: 'camera', place: 'photos', first: false }],
      ]);
    });

    it('for an unknown reason shows the general text and tracks other', async () => {
      fetchMock.mockImplementation(refusedWith('something_new'));
      const user = setup();
      renderUpload();
      await user.upload(fileInputs().file!, picture());

      const dialog = await screen.findByRole('dialog', { name: 'Фото не подходит для примерки' });
      expect(dialog).toHaveTextContent('Загрузите другое фото, где вы видны в полный рост.');
      expect(tracked('Photo Refused')[0]).toEqual([
        'Photo Refused',
        { reason: 'other', source: 'file', place: 'photos', first: false },
      ]);
    });

    it('switches to the tips from the refusal and back to the pickers there', async () => {
      fetchMock.mockImplementation(refusedWith('dark'));
      const user = setup();
      renderUpload();
      await user.upload(fileInputs().file!, picture());
      await user.click(await screen.findByRole('button', { name: 'Какое фото подойдёт' }));

      const dialog = await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });
      expect(dialog).toHaveTextContent('Подойдёт');
      expect(within(dialog).getByRole('button', { name: 'Выбрать фото' })).toBeEnabled();
      expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('lets another photo be sent from the refusal, which closes it on success', async () => {
      fetchMock.mockImplementationOnce(refusedWith('dark'));
      fetchMock.mockImplementation(ok);
      const user = setup();
      const { onUploaded } = renderUpload();
      await user.upload(fileInputs().file!, picture('first.jpg'));
      const dialog = await screen.findByRole('dialog', { name: 'Фото слишком тёмное' });

      const inDialog = dialog.querySelector<HTMLInputElement>('input[type="file"]:not([capture])');
      await user.upload(inDialog!, picture('second.jpg'));

      await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
      await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
