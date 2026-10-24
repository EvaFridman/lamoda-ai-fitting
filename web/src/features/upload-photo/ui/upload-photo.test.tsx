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

// The refusal's preview is an object URL of the chosen file; jsdom has none.
const createObjectURL = vi.fn<(file: File) => string>();
const revokeObjectURL = vi.fn<(url: string) => void>();

// A phone-wide window: the media query of the phone layout matches, nothing else does.
function stubPhone() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(width < 600px)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  window.localStorage.clear();
  signInAs(ANNA);
  createObjectURL.mockReturnValue('blob:preview-1');
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
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

  it('opens with the focus on the dialog itself, not on a checkbox', async () => {
    const user = setup();
    renderUpload();
    await user.click(screen.getByRole('button', { name: 'Добавить фото' }));

    const dialog = await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });
    await vi.waitFor(() => expect(dialog).toHaveFocus());
    expect(within(dialog).getByRole('checkbox', { name: 'На фото — я' })).not.toHaveFocus();
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

    it('shows the refused photo from an object URL, in a recorder-blocked frame, and revokes it on close', async () => {
      fetchMock.mockImplementation(refusedWith('dark'));
      const user = setup();
      renderUpload();
      const file = picture('refused.jpg');
      await user.upload(fileInputs().file!, file);

      const dialog = await screen.findByRole('dialog', { name: 'Фото слишком тёмное' });
      const image = within(dialog).getByRole('img', { name: 'Загруженное фото' });
      expect(createObjectURL).toHaveBeenCalledWith(file);
      expect(image).toHaveAttribute('src', 'blob:preview-1');
      expect(image.closest('.mp-block')).not.toBeNull();
      for (const element of dialog.querySelectorAll('*')) {
        for (const attribute of element.getAttributeNames()) {
          if (element === image && attribute === 'src') continue;
          expect(element.getAttribute(attribute)).not.toContain('blob:');
        }
      }
      expect(revokeObjectURL).not.toHaveBeenCalled();

      await user.keyboard('{Escape}');

      await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(revokeObjectURL).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
    });

    it('revokes the URL when the page is left with the refusal open', async () => {
      fetchMock.mockImplementation(refusedWith('not_full'));
      const user = setup();
      const { unmount } = renderUpload();
      await user.upload(fileInputs().file!, picture());
      await screen.findByRole('dialog', { name: 'Не видно фигуру целиком' });

      unmount();

      expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
    });

    it('swaps the preview for the next refused photo and revokes the old URL', async () => {
      fetchMock.mockImplementation(refusedWith('dark'));
      const user = setup();
      renderUpload();
      await user.upload(fileInputs().file!, picture('first.jpg'));
      const dialog = await screen.findByRole('dialog', { name: 'Фото слишком тёмное' });
      await vi.waitFor(() =>
        expect(within(dialog).getByRole('img', { name: 'Загруженное фото' })).toHaveAttribute(
          'src',
          'blob:preview-1',
        ),
      );
      createObjectURL.mockReturnValue('blob:preview-2');
      const second = picture('second.jpg');

      await user.upload(
        dialog.querySelector<HTMLInputElement>('input[type="file"]:not([capture])')!,
        second,
      );

      await vi.waitFor(() =>
        expect(
          within(screen.getByRole('dialog')).getByRole('img', { name: 'Загруженное фото' }),
        ).toHaveAttribute('src', 'blob:preview-2'),
      );
      expect(createObjectURL).toHaveBeenLastCalledWith(second);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
    });

    it('for a child hides the photo: «Фото скрыто», no image, no object URL', async () => {
      fetchMock.mockImplementation(refusedWith('child'));
      const user = setup();
      renderUpload();
      await user.upload(fileInputs().file!, picture());

      const dialog = await screen.findByRole('dialog', { name: 'Похоже, на фото ребёнок' });
      expect(within(dialog).getByText('Фото скрыто')).toBeInTheDocument();
      expect(within(dialog).queryByRole('img')).not.toBeInTheDocument();
      expect(createObjectURL).not.toHaveBeenCalled();
    });
  });
});

describe('UploadPhoto on a phone', () => {
  beforeEach(stubPhone);

  it('opens the tips alone: «Понятно», no consents and no pickers', async () => {
    const user = setup();
    renderUpload();
    await user.click(screen.getByRole('button', { name: 'Добавить фото' }));

    const dialog = await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });
    expect(within(dialog).getAllByRole('figure')).toHaveLength(7);
    expect(within(dialog).getAllByRole('img', { name: 'Подойдёт' })).toHaveLength(2);
    expect(within(dialog).queryByRole('heading', { name: 'Коротко' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('list')).not.toBeInTheDocument();
    expect(dialog).not.toHaveTextContent('JPG, PNG или WebP до 20 МБ');
    expect(within(dialog).getByRole('button', { name: 'Понятно' })).toBeEnabled();
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Выбрать фото' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Сделать фото' })).not.toBeInTheDocument();
    expect(fileInputs().all).toHaveLength(0);
  });

  it('«Понятно» opens «Ваше фото» with its texts, and the consents gate the pickers', async () => {
    const user = setup();
    renderUpload();
    await user.click(screen.getByRole('button', { name: 'Добавить фото' }));
    await user.click(await screen.findByRole('button', { name: 'Понятно' }));

    const dialog = await screen.findByRole('dialog', { name: 'Ваше фото' });
    expect(screen.queryByRole('dialog', { name: 'Какое фото подойдёт' })).not.toBeInTheDocument();
    expect(dialog).toHaveTextContent('Загрузите фото в полный рост');
    expect(dialog).toHaveTextContent(
      'Мы сохраним его, чтобы в следующий раз примерка шла в два нажатия. Фото видите только вы.',
    );
    expect(dialog).toHaveTextContent('Фото не используются для обучения моделей');
    expect(
      within(dialog).getByRole('link', { name: 'политике по работе с персональными данными' }),
    ).toHaveAttribute('href', '/privacy');
    expect(within(dialog).queryByText('Подойдёт')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Выбрать фото' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Сделать фото' })).toBeDisabled();

    await user.click(within(dialog).getByRole('checkbox', { name: 'На фото — я' }));
    expect(within(dialog).getByRole('button', { name: 'Выбрать фото' })).toBeDisabled();
    await user.click(within(dialog).getByRole('checkbox', { name: /OpenAI/ }));

    expect(within(dialog).getByRole('button', { name: 'Выбрать фото' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Сделать фото' })).toBeEnabled();
    expect(window.localStorage.getItem(keyOf(ANNA))).toBeNull();
  });

  it('records the consent when a file is chosen and closes on success', async () => {
    // Its own user: a recorded consent outlives the test in the tab's memory.
    const id = 'user-phone';
    signInAs(id);
    fetchMock.mockImplementation(ok);
    const user = setup();
    const { onUploaded } = renderUpload();
    await user.click(screen.getByRole('button', { name: 'Добавить фото' }));
    await user.click(await screen.findByRole('button', { name: 'Понятно' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ваше фото' });
    await user.click(within(dialog).getByRole('checkbox', { name: 'На фото — я' }));
    await user.click(within(dialog).getByRole('checkbox', { name: /OpenAI/ }));
    await user.upload(
      dialog.querySelector<HTMLInputElement>('input[type="file"]:not([capture])')!,
      picture(),
    );

    await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledWith(PHOTO));
    expect(window.localStorage.getItem(keyOf(id))).toBe('1');
    expect(tracked('Photo Uploaded')).toEqual([
      ['Photo Uploaded', { saved: true, source: 'file', place: 'photos', first: true }],
    ]);
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closing the tips with Esc sends nothing and stores no consent', async () => {
    const user = setup();
    renderUpload();
    await user.click(screen.getByRole('button', { name: 'Добавить фото' }));
    await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });
    await user.keyboard('{Escape}');

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(keyOf(ANNA))).toBeNull();
  });

  it('with the consents given shows the two pickers at the screen width', () => {
    window.localStorage.setItem(keyOf(ANNA), '1');
    renderUpload();

    expect(screen.getByRole('button', { name: 'Добавить фото' })).toHaveClass('fullWidth');
    expect(screen.getByRole('button', { name: 'Сделать фото' })).toHaveClass('fullWidth');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('without the consents the «Добавить фото» button is the screen width too', () => {
    renderUpload();

    expect(screen.getByRole('button', { name: 'Добавить фото' })).toHaveClass('fullWidth');
  });
});

describe('UploadPhoto in the try-on', () => {
  beforeEach(() => {
    window.localStorage.setItem(keyOf(ANNA), '1');
  });

  it('uploads a one-time photo with save=false and tracks it as not saved in the try-on', async () => {
    fetchMock.mockImplementation(ok);
    const user = setup();
    const { onUploaded } = renderUpload({ place: 'try-on', save: false });
    await user.upload(fileInputs().file!, picture());

    await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledWith(PHOTO));
    expect((requestOf().init.body as FormData).get('save')).toBe('false');
    expect(tracked('Photo Uploaded')).toEqual([
      ['Photo Uploaded', { saved: false, source: 'file', place: 'try-on', first: false }],
    ]);
  });

  it('tracks a refusal with the try-on as its place and shows the note under its text', async () => {
    fetchMock.mockImplementation(refusedWith('dark'));
    const user = setup();
    renderUpload({ place: 'try-on', refusalNote: <p>Примерка не списана · осталось 7</p> });
    await user.upload(fileInputs().file!, picture());

    const dialog = await screen.findByRole('dialog', { name: 'Фото слишком тёмное' });
    expect(within(dialog).getByText('Примерка не списана · осталось 7')).toBeInTheDocument();
    expect(tracked('Photo Refused')[0]).toEqual([
      'Photo Refused',
      { reason: 'dark', source: 'file', place: 'try-on', first: false },
    ]);
  });

  it('tells the file on its way, then null once it is stored', async () => {
    let answer: (response: Response) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    );
    const onPendingChange = vi.fn();
    const user = setup();
    renderUpload({ place: 'try-on', onPendingChange });
    const file = picture('pending.jpg');
    await user.upload(fileInputs().file!, file);

    await vi.waitFor(() => expect(onPendingChange).toHaveBeenLastCalledWith(file));
    answer(await ok());
    await vi.waitFor(() => expect(onPendingChange).toHaveBeenLastCalledWith(null));
  });

  it('tells null again when the upload is refused', async () => {
    let answer: (response: Response) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    );
    const onPendingChange = vi.fn();
    const user = setup();
    renderUpload({ place: 'try-on', onPendingChange });
    const file = picture();
    await user.upload(fileInputs().file!, file);
    await vi.waitFor(() => expect(onPendingChange).toHaveBeenLastCalledWith(file));
    answer(await refusedWith('dark')());

    await screen.findByRole('dialog', { name: 'Фото слишком тёмное' });
    expect(onPendingChange).toHaveBeenCalledWith(file);
    expect(onPendingChange).toHaveBeenLastCalledWith(null);
  });

  describe('as the strip', () => {
    it('shows the thumbs before the «Новое» tile and the two buttons under them', () => {
      renderUpload({
        place: 'try-on',
        appearance: 'strip',
        thumbs: <span>Мини-фото</span>,
      });

      expect(screen.getByText('Мини-фото')).toBeInTheDocument();
      expect(screen.getByText('Новое')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Сделать фото' })).toBeEnabled();
      expect(screen.getAllByRole('button', { name: 'Загрузить фото' })).toHaveLength(2);
    });

    it('uploads the file of its tile', async () => {
      fetchMock.mockImplementation(ok);
      const user = setup();
      const { onUploaded } = renderUpload({ place: 'try-on', appearance: 'strip', save: false });
      await user.upload(fileInputs().file!, picture());

      await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledWith(PHOTO));
      expect((requestOf().init.body as FormData).get('save')).toBe('false');
    });

    it('before the consents opens the tips from its tile and sends no request', async () => {
      window.localStorage.clear();
      const user = setup();
      renderUpload({ place: 'try-on', appearance: 'strip' });
      expect(fileInputs().all).toHaveLength(0);

      await user.click(screen.getAllByRole('button', { name: 'Загрузить фото' })[0]!);

      expect(
        await screen.findByRole('dialog', { name: 'Какое фото подойдёт' }),
      ).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('is off when disabled', () => {
      renderUpload({ place: 'try-on', appearance: 'strip', disabled: true });

      for (const button of screen.getAllByRole('button', { name: 'Загрузить фото' })) {
        expect(button).toBeDisabled();
      }
    });

    it('on a phone has the tiles «Загрузить» and «Снять» only', () => {
      stubPhone();
      renderUpload({ place: 'try-on', appearance: 'strip' });

      expect(screen.getByText('Загрузить')).toBeInTheDocument();
      expect(screen.getByText('Снять')).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Загрузить фото' })).toHaveLength(1);
      expect(screen.getAllByRole('button', { name: 'Сделать фото' })).toHaveLength(1);
    });
  });
});

describe('UploadPhoto as the card', () => {
  it('before the consents is a button named «Добавить фото», described by its hint, that opens the tips', async () => {
    const user = setup();
    renderUpload({ appearance: 'card' });

    const card = screen.getByRole('button', { name: 'Добавить фото' });
    expect(card).toHaveAccessibleDescription('в полный рост, один человек');
    expect(fileInputs().all).toHaveLength(0);

    await user.click(card);

    const dialog = await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });
    expect(within(dialog).getByRole('checkbox', { name: 'На фото — я' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Выбрать фото' })).toBeDisabled();
    expect(
      tracked('Element Clicked').map(([, props]) => (props as { element: string }).element),
    ).toEqual(['photos.upload']);
  });

  it('after the consents opens the file picker at once, with one input and no camera', async () => {
    window.localStorage.setItem(keyOf(ANNA), '1');
    const user = setup();
    renderUpload({ appearance: 'card' });

    expect(screen.queryByRole('button', { name: 'Сделать фото' })).not.toBeInTheDocument();
    const { all, file } = fileInputs();
    expect(all).toHaveLength(1);
    expect(file).not.toHaveAttribute('capture');
    expect(file).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
    const open = vi.spyOn(file!, 'click');

    const card = screen.getByRole('button', { name: 'Добавить фото' });
    expect(card).toHaveAccessibleDescription('в полный рост, один человек');
    await user.click(card);

    expect(open).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      tracked('Element Clicked').map(([, props]) => (props as { element: string }).element),
    ).toEqual(['photos.upload']);
  });

  it('after the consents uploads the chosen file and is busy meanwhile', async () => {
    window.localStorage.setItem(keyOf(ANNA), '1');
    let answer: (response: Response) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    );
    const user = setup();
    const { onUploaded } = renderUpload({ appearance: 'card' });
    await user.upload(fileInputs().file!, picture('card.jpg'));

    const card = screen.getByRole('button', { name: 'Добавить фото' });
    await vi.waitFor(() => expect(card).toBeDisabled());
    expect(card).toHaveAttribute('aria-busy', 'true');
    expect(within(card).getByRole('progressbar', { name: 'Загрузка' })).toBeInTheDocument();
    expect(((requestOf().init.body as FormData).get('photo') as File).name).toBe('card.jpg');

    answer(await ok());

    await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledWith(PHOTO));
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(tracked('Photo Uploaded')).toEqual([
      ['Photo Uploaded', { saved: true, source: 'file', place: 'photos', first: false }],
    ]);
  });

  it.each([
    ['before the consents', false],
    ['after the consents', true],
  ])('is off when disabled, %s', async (_when, consented) => {
    if (consented) window.localStorage.setItem(keyOf(ANNA), '1');
    const user = setup();
    renderUpload({ appearance: 'card', disabled: true });

    const card = screen.getByRole('button', { name: 'Добавить фото' });
    expect(card).toBeDisabled();
    await user.click(card);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(tracked('Element Clicked')).toHaveLength(0);
    if (consented) expect(fileInputs().file).toBeDisabled();
  });
});
