import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { userKeys, type User } from '@/entities/user';
import { userPhotoKeys } from '@/entities/user-photo';
import { detailText } from '@/shared/api';
import { COARSE_POINTER_QUERY, MOUSE_QUERY, PHONE_QUERY } from '@/shared/config';

import { MAX_PHOTO_BYTES, TOO_BIG_TEXT, WRONG_TYPE_TEXT } from '../lib/upload-error';
import { UploadPhoto, type UploadPhotoProps } from './upload-photo';

const mocks = vi.hoisted(() => ({
  track: vi.fn(),
  captureException: vi.fn(),
  heicToJpeg: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }));

vi.mock('../lib/heic', () => ({ heicToJpeg: mocks.heicToJpeg }));

vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  reset: vi.fn(),
  track: mocks.track,
}));

const fetchMock = vi.fn();

// Base UI turns pointer events off on the page while a modal is open; the styles that give them
// back to the dialog are not loaded in jsdom.
const setup = () => userEvent.setup({ pointerEventsCheck: 0 });

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

const CONSENT_REQUIRED = { field: 'consent', code: 'CONSENT_REQUIRED', message: 'required' };

// What `POST /me/photos` answers: the next of `once`, else `answer`.
let answer: () => Promise<Response>;
let once: Array<() => Promise<Response>>;
// What `GET /me` answers when a test does not seed it.
let meMode: 'loading' | 'failed';

type Me = 'loading' | 'failed' | { version: number | null };

function renderUpload(props: Partial<UploadPhotoProps> = {}, me: Me = { version: null }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  if (typeof me === 'string') meMode = me;
  else queryClient.setQueryData(userKeys.me, { ...USER, photoConsentVersion: me.version });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const onUploaded = vi.fn();
  const ui = (next: Partial<UploadPhotoProps>) => (
    <QueryClientProvider client={queryClient}>
      <UploadPhoto place="photos" onUploaded={onUploaded} {...next} />
    </QueryClientProvider>
  );
  const { unmount, rerender } = render(ui(props));
  const update = (next: Partial<UploadPhotoProps>) => rerender(ui(next));
  return { invalidate, onUploaded, unmount, update, queryClient };
}

const consented = { version: 1 } as const;
const consentOf = (queryClient: QueryClient) =>
  queryClient.getQueryData<User>(userKeys.me)?.photoConsentVersion;

function fileInputs(scope: ParentNode = document) {
  const inputs = [...scope.querySelectorAll<HTMLInputElement>('input[type="file"]')];
  return {
    file: inputs.find((input) => !input.hasAttribute('capture')),
    camera: inputs.find((input) => input.hasAttribute('capture')),
    all: inputs,
  };
}

// The drop card's whole-card button: a pointer's target only, out of the accessibility tree (Z47).
function dropArea() {
  const area = document.querySelector<HTMLButtonElement>('button.dropArea');
  if (!area) throw new Error('no drop area');
  return area;
}

const picture = (name = 'me.jpg') => new File(['x'], name, { type: 'image/jpeg' });

function tracked(name: string) {
  return mocks.track.mock.calls.filter(([event]) => event === name);
}

function clickedElements() {
  return tracked('Element Clicked').map(([, props]) => (props as { element: string }).element);
}

// The uploads the page sent (the POSTs to /me/photos).
function uploads() {
  return fetchMock.mock.calls
    .map(([url, init]) => ({ path: new URL(String(url)).pathname, init: init as RequestInit }))
    .filter(({ path, init }) => path === '/api/me/photos' && init?.method === 'POST');
}

function requestOf(index = 0) {
  const sent = uploads()[index];
  return { path: sent?.path, init: sent?.init as RequestInit, body: sent?.init.body as FormData };
}

// The refusal's preview is an object URL of the chosen file; jsdom has none.
const createObjectURL = vi.fn<(file: File) => string>();
const revokeObjectURL = vi.fn<(url: string) => void>();

// A window where only these media queries match.
function stubMedia(...matching: string[]) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matching.includes(query),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}
const stubPhone = () => stubMedia(PHONE_QUERY);
const stubTouch = () => stubMedia(COARSE_POINTER_QUERY);

async function checkBothConsents(dialog: HTMLElement, user: ReturnType<typeof setup>) {
  await user.click(within(dialog).getByRole('checkbox', { name: 'На фото — я' }));
  await user.click(within(dialog).getByRole('checkbox', { name: /OpenAI/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  answer = ok;
  once = [];
  meMode = 'loading';
  fetchMock.mockImplementation((url: string) => {
    const { pathname } = new URL(String(url));
    if (pathname === '/api/me') {
      return meMode === 'loading'
        ? new Promise<Response>(() => undefined)
        : failure(503, 'SERVICE_UNAVAILABLE')();
    }
    return (once.shift() ?? answer)();
  });
  vi.stubGlobal('fetch', fetchMock);
  window.localStorage.clear();
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
    stubTouch();
    const user = setup();
    renderUpload();
    await user.click(screen.getByRole('button', { name: 'Добавить фото' }));

    const dialog = await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });
    expect(dialog).toHaveTextContent('Подойдёт');
    expect(dialog).toHaveTextContent('Не подойдёт');
    expect(dialog).toHaveTextContent('JPG, PNG, WebP или HEIC до 20 МБ');
    expect(within(dialog).getByRole('checkbox', { name: /OpenAI/ })).not.toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Выбрать фото' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Сделать фото' })).toBeDisabled();
    expect(within(dialog).getByText('Отметьте оба пункта, чтобы продолжить')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('checkbox', { name: 'На фото — я' }));
    expect(within(dialog).getByRole('button', { name: 'Выбрать фото' })).toBeDisabled();

    await user.click(within(dialog).getByRole('checkbox', { name: /OpenAI/ }));
    expect(within(dialog).getByRole('button', { name: 'Выбрать фото' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Сделать фото' })).toBeEnabled();
    expect(
      within(dialog).queryByText('Отметьте оба пункта, чтобы продолжить'),
    ).not.toBeInTheDocument();
    expect(uploads()).toHaveLength(0);
  });

  it('offers no camera in the tips with a mouse, and the file picker alone', async () => {
    const user = setup();
    renderUpload();
    await user.click(screen.getByRole('button', { name: 'Добавить фото' }));
    const dialog = await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });
    await checkBothConsents(dialog, user);

    expect(within(dialog).getByRole('button', { name: 'Выбрать фото' })).toBeEnabled();
    expect(within(dialog).queryByRole('button', { name: 'Сделать фото' })).not.toBeInTheDocument();
    expect(fileInputs(dialog).camera).toBeUndefined();
  });

  it('keeps the pickers off when only the processing consent is checked', async () => {
    stubTouch();
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

  it('closes the tips with nothing sent and the consent still missing', async () => {
    const user = setup();
    const { queryClient } = renderUpload();
    await user.click(screen.getByRole('button', { name: 'Добавить фото' }));
    await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });
    await user.keyboard('{Escape}');

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(uploads()).toHaveLength(0);
    expect(consentOf(queryClient)).toBeNull();
  });

  it('is off when the saved photos are at their limit', () => {
    renderUpload({ disabled: true });
    expect(screen.getByRole('button', { name: 'Добавить фото' })).toBeDisabled();
  });
});

describe('UploadPhoto while /me is read', () => {
  it('keeps «Добавить фото» off while it loads', async () => {
    const user = setup();
    renderUpload({}, 'loading');

    const button = screen.getByRole('button', { name: 'Добавить фото' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the card off while it loads', () => {
    renderUpload({ appearance: 'card' }, 'loading');
    expect(screen.getByRole('button', { name: 'Добавить фото' })).toBeDisabled();
  });

  it('counts as not consented, with the tips, when it failed', async () => {
    const user = setup();
    renderUpload({}, 'failed');

    const button = screen.getByRole('button', { name: 'Добавить фото' });
    await vi.waitFor(() => expect(button).toBeEnabled());
    await user.click(button);

    expect(await screen.findByRole('dialog', { name: 'Какое фото подойдёт' })).toBeInTheDocument();
  });
});

describe('UploadPhoto: the first upload gives the consents (AC19)', () => {
  it('sends consent=1 between save and the photo, marks the upload first and remembers it', async () => {
    stubTouch();
    const user = setup();
    const { queryClient, onUploaded } = renderUpload();
    await user.click(screen.getByRole('button', { name: 'Добавить фото' }));
    const dialog = await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });
    await checkBothConsents(dialog, user);
    await user.upload(fileInputs(dialog).file!, picture());

    await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledWith(PHOTO));
    expect(requestOf().body.get('consent')).toBe('1');
    expect([...requestOf().body.keys()]).toEqual(['save', 'consent', 'photo']);
    expect(consentOf(queryClient)).toBe(1);
    expect(tracked('Photo Uploaded')).toEqual([
      [
        'Photo Uploaded',
        { saved: true, source: 'file', place: 'photos', first: true, format: 'jpeg' },
      ],
    ]);
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Сделать фото' })).toBeEnabled();
  });

  it('keeps the consent after a refused photo and sends it no more', async () => {
    once.push(refusedWith('dark'));
    const user = setup();
    const { queryClient, onUploaded } = renderUpload();
    await user.click(screen.getByRole('button', { name: 'Добавить фото' }));
    const tips = await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });
    await checkBothConsents(tips, user);
    await user.upload(fileInputs(tips).file!, picture('first.jpg'));

    const refused = await screen.findByRole('dialog', { name: 'Фото слишком тёмное' });
    expect(consentOf(queryClient)).toBe(1);
    expect(tracked('Photo Refused')).toEqual([
      [
        'Photo Refused',
        { reason: 'dark', source: 'file', place: 'photos', first: true, format: 'jpeg' },
      ],
    ]);

    await user.upload(fileInputs(refused).file!, picture('second.jpg'));

    await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
    expect(requestOf(0).body.get('consent')).toBe('1');
    expect(requestOf(1).body.has('consent')).toBe(false);
    expect(tracked('Photo Uploaded')).toEqual([
      [
        'Photo Uploaded',
        { saved: true, source: 'file', place: 'photos', first: false, format: 'jpeg' },
      ],
    ]);
  });

  it('does not remember the consent when the upload fails otherwise', async () => {
    // A network failure: the 503 report of another test in this file is throttled for a minute.
    answer = () => Promise.reject(new TypeError('Failed to fetch'));
    const user = setup();
    const { queryClient } = renderUpload();
    await user.click(screen.getByRole('button', { name: 'Добавить фото' }));
    const dialog = await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });
    await checkBothConsents(dialog, user);
    await user.upload(fileInputs(dialog).file!, picture());

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Нет связи с сервером');
    expect(consentOf(queryClient)).toBeNull();
  });

  describe('when the check fails past the consents (a 503)', () => {
    const meReads = () =>
      fetchMock.mock.calls.filter(([url]) => new URL(String(url)).pathname === '/api/me');

    // A 503 and a network failure end the same way; the 503's Sentry report is throttled for a
    // minute per process, which another test of this file asserts, so these use a network failure.
    const networkDown = () => Promise.reject(new TypeError('Failed to fetch'));

    it('reads /me again after a first upload, and the next upload sends no consent once /me keeps them', async () => {
      once.push(networkDown);
      const user = setup();
      const { queryClient, onUploaded } = renderUpload();
      await user.click(screen.getByRole('button', { name: 'Добавить фото' }));
      const dialog = await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });
      await checkBothConsents(dialog, user);
      const before = meReads().length;
      fetchMock.mockImplementation((url: string) => {
        if (new URL(String(url)).pathname === '/api/me') {
          return Promise.resolve(
            new Response(JSON.stringify({ ...USER, photoConsentVersion: 1 }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        return (once.shift() ?? answer)();
      });
      await user.upload(fileInputs(dialog).file!, picture('first.jpg'));

      await vi.waitFor(() => expect(meReads().length).toBeGreaterThan(before));
      await vi.waitFor(() => expect(consentOf(queryClient)).toBe(1));
      await user.upload(fileInputs(dialog).file!, picture('second.jpg'));

      await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
      expect(requestOf(0).body.get('consent')).toBe('1');
      expect(requestOf(1).body.has('consent')).toBe(false);
      expect(tracked('Photo Uploaded')).toEqual([
        [
          'Photo Uploaded',
          { saved: true, source: 'file', place: 'photos', first: false, format: 'jpeg' },
        ],
      ]);
    });

    it('does not read /me again after an upload that was not the first', async () => {
      once.push(networkDown);
      const user = setup();
      renderUpload({}, consented);
      const before = meReads().length;
      await user.upload(fileInputs().file!, picture());

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(uploads()).toHaveLength(1);
      expect(meReads()).toHaveLength(before);
    });
  });

  it('sends no consent for a user who gave it before (version 1 in /me)', async () => {
    stubTouch();
    const user = setup();
    const { onUploaded } = renderUpload({}, consented);
    expect(screen.getByRole('button', { name: 'Сделать фото' })).toBeEnabled();
    await user.upload(fileInputs().file!, picture());

    await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
    expect(requestOf().body.has('consent')).toBe(false);
  });

  it('asks again when the consents of /me are of another version', async () => {
    const user = setup();
    renderUpload({}, { version: 2 });

    expect(screen.queryByRole('button', { name: 'Сделать фото' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Добавить фото' }));
    expect(await screen.findByRole('dialog', { name: 'Какое фото подойдёт' })).toBeInTheDocument();
  });

  describe('when the api asks for them (CONSENT_REQUIRED)', () => {
    async function refused() {
      once.push(failure(400, 'VALIDATION_FAILED', [CONSENT_REQUIRED]));
      const user = setup();
      const view = renderUpload({}, consented);
      await user.upload(fileInputs().file!, picture('waiting.jpg'));
      const dialog = await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });
      return { user, dialog, ...view };
    }

    it('shows the tips and the consents again, unchecked, with no error text, and forgets the consent', async () => {
      const { dialog, queryClient } = await refused();

      expect(within(dialog).getByRole('checkbox', { name: 'На фото — я' })).not.toBeChecked();
      expect(within(dialog).getByRole('checkbox', { name: /OpenAI/ })).not.toBeChecked();
      expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
      expect(dialog).not.toHaveTextContent(detailText(CONSENT_REQUIRED));
      expect(consentOf(queryClient)).toBeNull();
      expect(uploads()).toHaveLength(1);
    });

    it('uploads the waiting file with the consents once both boxes are checked', async () => {
      const { user, dialog, queryClient, onUploaded } = await refused();
      const upload = within(dialog).getByRole('button', { name: 'Загрузить фото' });
      expect(upload).toBeDisabled();
      expect(
        within(dialog).queryByRole('button', { name: 'Выбрать фото' }),
      ).not.toBeInTheDocument();

      await user.click(within(dialog).getByRole('checkbox', { name: 'На фото — я' }));
      expect(upload).toBeDisabled();
      await user.click(within(dialog).getByRole('checkbox', { name: /OpenAI/ }));

      await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledWith(PHOTO));
      expect(uploads()).toHaveLength(2);
      expect((requestOf(1).body.get('photo') as File).name).toBe('waiting.jpg');
      expect(requestOf(1).body.get('consent')).toBe('1');
      expect(consentOf(queryClient)).toBe(1);
      expect(tracked('Photo Uploaded')).toEqual([
        [
          'Photo Uploaded',
          { saved: true, source: 'file', place: 'photos', first: true, format: 'jpeg' },
        ],
      ]);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('sends the waiting file once when a box is unchecked and checked again while it is pending', async () => {
      const { user, dialog } = await refused();
      answer = () => new Promise<Response>(() => undefined);
      await user.click(within(dialog).getByRole('checkbox', { name: 'На фото — я' }));
      await user.click(within(dialog).getByRole('checkbox', { name: /OpenAI/ }));
      await vi.waitFor(() => expect(uploads()).toHaveLength(2));
      // The file came from a picker, so the footer is the pickers again, the file one spinning.
      const footer = within(dialog).getByRole('button', { name: 'Выбрать фото' });
      expect(footer).toHaveAttribute('aria-disabled', 'true');
      expect(footer).toHaveAttribute('aria-busy', 'true');

      await user.click(within(dialog).getByRole('checkbox', { name: /OpenAI/ }));
      await user.click(within(dialog).getByRole('checkbox', { name: /OpenAI/ }));

      expect(uploads()).toHaveLength(2);
    });

    it('sends nothing more when the tips are closed', async () => {
      const { user } = await refused();

      await user.keyboard('{Escape}');

      await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(uploads()).toHaveLength(1);
    });
  });
});

describe('UploadPhoto with the consents given', () => {
  it('shows only the file picker with a mouse: no camera button or input', () => {
    renderUpload({}, consented);
    expect(screen.getByRole('button', { name: 'Добавить фото' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Сделать фото' })).not.toBeInTheDocument();
    expect(fileInputs().camera).toBeUndefined();
    expect(fileInputs().all).toHaveLength(1);
  });

  it('shows the two pickers at once, no modal, with the accepted types and the front camera, on a touch device', () => {
    stubTouch();
    renderUpload({}, consented);
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
    const user = setup();
    const { invalidate, onUploaded } = renderUpload({}, consented);
    await user.upload(fileInputs().file!, picture('me.jpg'));

    await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledWith(PHOTO));
    expect(uploads()).toHaveLength(1);
    const { path, init, body } = requestOf();
    expect(path).toBe('/api/me/photos');
    expect(init.method).toBe('POST');
    expect((body.get('photo') as File).name).toBe('me.jpg');
    expect(body.get('save')).toBe('true');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: userPhotoKeys.all });
    expect(tracked('Photo Uploaded')).toEqual([
      [
        'Photo Uploaded',
        { saved: true, source: 'file', place: 'photos', first: false, format: 'jpeg' },
      ],
    ]);
    expect(tracked('Photo Refused')).toHaveLength(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('tracks the camera as the source', async () => {
    stubTouch();
    const user = setup();
    renderUpload({}, consented);
    await user.upload(fileInputs().camera!, picture('shot.jpg'));

    await vi.waitFor(() => expect(tracked('Photo Uploaded')).toHaveLength(1));
    expect(tracked('Photo Uploaded')[0]).toEqual([
      'Photo Uploaded',
      { saved: true, source: 'camera', place: 'photos', first: false, format: 'jpeg' },
    ]);
  });

  it('sends the clicks of the two tracked buttons', async () => {
    stubTouch();
    const user = setup();
    renderUpload({}, consented);
    await user.click(screen.getByRole('button', { name: 'Добавить фото' }));
    await user.click(screen.getByRole('button', { name: 'Сделать фото' }));

    expect(clickedElements()).toEqual(['photos.upload', 'photos.camera']);
  });

  it('refuses a file over the limit with no request', async () => {
    const user = setup();
    renderUpload({}, consented);
    const big = picture('big.jpg');
    Object.defineProperty(big, 'size', { value: MAX_PHOTO_BYTES + 1 });
    await user.upload(fileInputs().file!, big);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Файл слишком большой: нужно фото до 20 МБ',
    );
    expect(uploads()).toHaveLength(0);
    expect(tracked('Photo Uploaded')).toHaveLength(0);
    expect(tracked('Photo Refused')).toHaveLength(0);
  });

  it('accepts a file of exactly the limit', async () => {
    const user = setup();
    renderUpload({}, consented);
    const edge = picture('edge.jpg');
    Object.defineProperty(edge, 'size', { value: MAX_PHOTO_BYTES });
    await user.upload(fileInputs().file!, edge);

    await vi.waitFor(() => expect(uploads()).toHaveLength(1));
  });

  it('shows the text of IS_IMAGE as an alert and tracks nothing', async () => {
    answer = failure(400, 'VALIDATION_FAILED', [
      { field: 'photo', code: 'IS_IMAGE', message: 'm' },
    ]);
    const user = setup();
    renderUpload({}, consented);
    await user.upload(fileInputs().file!, picture());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Нужно изображение JPG, PNG, WebP или HEIC',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(tracked('Photo Refused')).toHaveLength(0);
    expect(tracked('Photo Uploaded')).toHaveLength(0);
  });

  it('shows the text of a sixth photo (409 LIMIT_REACHED)', async () => {
    answer = failure(409, 'LIMIT_REACHED');
    const user = setup();
    renderUpload({}, consented);
    await user.upload(fileInputs().file!, picture());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Достигнут лимит, больше добавить нельзя',
    );
  });

  it('does not repeat a request that failed with a 503, and reports it', async () => {
    answer = failure(503, 'SERVICE_UNAVAILABLE');
    const user = setup();
    renderUpload({}, consented);
    await user.upload(fileInputs().file!, picture());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Сервис временно недоступен, попробуйте позже',
    );
    expect(uploads()).toHaveLength(1);
    expect(mocks.captureException).toHaveBeenCalled();
  });

  it('shows a network failure and lets the next try clear it', async () => {
    once.push(() => Promise.reject(new TypeError('Failed to fetch')));
    const user = setup();
    const { onUploaded } = renderUpload({}, consented);
    await user.upload(fileInputs().file!, picture());
    expect(await screen.findByRole('alert')).toHaveTextContent('Нет связи с сервером');

    await user.upload(fileInputs().file!, picture());
    await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('turns the picker off while the photo is on its way', async () => {
    stubTouch();
    answer = () => new Promise<Response>(() => undefined);
    const user = setup();
    renderUpload({}, consented);
    await user.upload(fileInputs().file!, picture());

    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Сделать фото' })).toBeDisabled(),
    );
    expect(uploads()).toHaveLength(1);
  });

  it('sends one request when a second file arrives while the first is on its way', async () => {
    stubTouch();
    answer = () => new Promise<Response>(() => undefined);
    const user = setup();
    renderUpload({}, consented);
    await user.upload(fileInputs().file!, picture('first.jpg'));
    await vi.waitFor(() => expect(uploads()).toHaveLength(1));

    fireEvent.change(fileInputs().file!, { target: { files: [picture('second.jpg')] } });
    fireEvent.change(fileInputs().camera!, { target: { files: [picture('third.jpg')] } });

    expect(uploads()).toHaveLength(1);
    expect((requestOf().body.get('photo') as File).name).toBe('first.jpg');
  });

  it('still invalidates the list and tracks the upload when the page was left meanwhile', async () => {
    let finish: (response: Response) => void = () => undefined;
    answer = () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      });
    const user = setup();
    const { invalidate, onUploaded, unmount } = renderUpload({}, consented);
    await user.upload(fileInputs().file!, picture());
    await vi.waitFor(() => expect(uploads()).toHaveLength(1));

    unmount();
    expect(invalidate).not.toHaveBeenCalled();
    finish(await ok());

    await vi.waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: userPhotoKeys.all }),
    );
    expect(tracked('Photo Uploaded')).toEqual([
      [
        'Photo Uploaded',
        { saved: true, source: 'file', place: 'photos', first: false, format: 'jpeg' },
      ],
    ]);
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('tracks a refusal that arrives after the page was left', async () => {
    stubTouch();
    let finish: (response: Response) => void = () => undefined;
    answer = () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      });
    const user = setup();
    const { invalidate, unmount } = renderUpload({}, consented);
    await user.upload(fileInputs().camera!, picture());
    await vi.waitFor(() => expect(uploads()).toHaveLength(1));

    unmount();
    finish(await refusedWith('dark')());

    await vi.waitFor(() => expect(tracked('Photo Refused')).toHaveLength(1));
    expect(tracked('Photo Refused')[0]).toEqual([
      'Photo Refused',
      { reason: 'dark', source: 'camera', place: 'photos', first: false, format: 'jpeg' },
    ]);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('shows the text of a 429 and lets the next successful upload clear it', async () => {
    once.push(failure(429, 'TOO_MANY_REQUESTS'));
    const user = setup();
    const { onUploaded } = renderUpload({}, consented);
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
      stubTouch();
      answer = refusedWith('child');
      const user = setup();
      renderUpload({}, consented);
      await user.upload(fileInputs().file!, picture());

      const dialog = await screen.findByRole('dialog', { name: 'Похоже, на фото ребёнок' });
      expect(dialog).toHaveTextContent('Фото не сохранено.');
      expect(within(dialog).getByRole('button', { name: 'Загрузить своё фото' })).toBeEnabled();
      expect(
        within(dialog).queryByRole('button', { name: 'Сделать фото' }),
      ).not.toBeInTheDocument();
      expect(
        within(dialog).queryByRole('button', { name: 'Какое фото подойдёт' }),
      ).not.toBeInTheDocument();
      expect(tracked('Photo Refused')).toEqual([
        [
          'Photo Refused',
          { reason: 'child', source: 'file', place: 'photos', first: false, format: 'jpeg' },
        ],
      ]);
      expect(tracked('Photo Uploaded')).toHaveLength(0);
    });

    it.each([
      ['dark', 'Фото слишком тёмное'],
      ['not_full', 'Не видно фигуру целиком'],
      ['many_people', 'На фото несколько человек'],
      ['no_person', 'Не нашли человека на фото'],
    ])('for %s shows «%s» with another photo, the camera and the tips', async (reason, title) => {
      stubTouch();
      answer = refusedWith(reason);
      const user = setup();
      renderUpload({}, consented);
      await user.upload(fileInputs().camera!, picture());

      const dialog = await screen.findByRole('dialog', { name: title });
      expect(dialog).toHaveTextContent('Фото не сохранено.');
      expect(within(dialog).getByRole('button', { name: 'Выбрать другое фото' })).toBeEnabled();
      expect(within(dialog).getByRole('button', { name: 'Сделать фото' })).toBeEnabled();
      expect(
        within(dialog).getByRole('button', { name: 'Какое фото подойдёт' }),
      ).toBeInTheDocument();
      expect(tracked('Photo Refused')).toEqual([
        [
          'Photo Refused',
          { reason, source: 'camera', place: 'photos', first: false, format: 'jpeg' },
        ],
      ]);
    });

    it.each([
      ['violence', 'На фото есть оружие или насилие', 'Загрузите обычное фото в полный рост'],
      ['sexual', 'Фото не подходит для примерки', 'на фото откровенный образ'],
      ['self_harm', 'Фото не подходит для примерки', 'Загрузите другое фото'],
      ['hate', 'На фото есть оскорбительные символы', 'Загрузите фото без надписей'],
      ['illicit', 'На фото есть запрещённые предметы', 'Загрузите фото без посторонних предметов'],
      ['unknown', 'Фото не прошло проверку безопасности', 'фото известных людей и персонажей'],
      ['weapons', 'Фото не прошло проверку безопасности', 'фото известных людей и персонажей'],
    ])(
      'for moderation:%s shows «%s» and tracks the reason moderation',
      async (category, title, advice) => {
        stubTouch();
        answer = refusedWith(`moderation:${category}`);
        const user = setup();
        renderUpload({}, consented);
        await user.upload(fileInputs().camera!, picture());

        const dialog = await screen.findByRole('dialog', { name: title });
        expect(dialog).toHaveTextContent(advice);
        expect(within(dialog).getByRole('img', { name: 'Загруженное фото' })).toBeInTheDocument();
        expect(within(dialog).getByRole('button', { name: 'Сделать фото' })).toBeEnabled();
        expect(
          within(dialog).getByRole('button', { name: 'Какое фото подойдёт' }),
        ).toBeInTheDocument();
        expect(tracked('Photo Refused')).toEqual([
          [
            'Photo Refused',
            {
              reason: 'moderation',
              source: 'camera',
              place: 'photos',
              first: false,
              format: 'jpeg',
            },
          ],
        ]);
      },
    );

    it('with a mouse offers no camera on the refusal screen, only another file and the tips', async () => {
      answer = refusedWith('dark');
      const user = setup();
      renderUpload({}, consented);
      await user.upload(fileInputs().file!, picture());

      const dialog = await screen.findByRole('dialog', { name: 'Фото слишком тёмное' });
      expect(within(dialog).getByRole('button', { name: 'Выбрать другое фото' })).toBeEnabled();
      expect(
        within(dialog).queryByRole('button', { name: 'Сделать фото' }),
      ).not.toBeInTheDocument();
      expect(fileInputs(dialog).camera).toBeUndefined();
      expect(
        within(dialog).getByRole('button', { name: 'Какое фото подойдёт' }),
      ).toBeInTheDocument();
    });

    it('for moderation:minors hides the photo and offers no camera, as for a child', async () => {
      stubTouch();
      answer = refusedWith('moderation:minors');
      const user = setup();
      renderUpload({}, consented);
      await user.upload(fileInputs().file!, picture());

      const dialog = await screen.findByRole('dialog', { name: 'Похоже, на фото ребёнок' });
      expect(within(dialog).getByText('Фото скрыто')).toBeInTheDocument();
      expect(within(dialog).queryByRole('img')).not.toBeInTheDocument();
      expect(createObjectURL).not.toHaveBeenCalled();
      expect(within(dialog).getByRole('button', { name: 'Загрузить своё фото' })).toBeEnabled();
      expect(
        within(dialog).queryByRole('button', { name: 'Сделать фото' }),
      ).not.toBeInTheDocument();
      expect(
        within(dialog).queryByRole('button', { name: 'Какое фото подойдёт' }),
      ).not.toBeInTheDocument();
      expect(tracked('Photo Refused')).toEqual([
        [
          'Photo Refused',
          { reason: 'moderation', source: 'file', place: 'photos', first: false, format: 'jpeg' },
        ],
      ]);
    });

    it('for an unknown reason shows the general text and tracks other', async () => {
      answer = refusedWith('something_new');
      const user = setup();
      renderUpload({}, consented);
      await user.upload(fileInputs().file!, picture());

      const dialog = await screen.findByRole('dialog', { name: 'Фото не подходит для примерки' });
      expect(dialog).toHaveTextContent('Загрузите другое фото, где вы видны в полный рост.');
      expect(tracked('Photo Refused')[0]).toEqual([
        'Photo Refused',
        { reason: 'other', source: 'file', place: 'photos', first: false, format: 'jpeg' },
      ]);
    });

    it('switches to the tips from the refusal, which need no consents any more', async () => {
      answer = refusedWith('dark');
      const user = setup();
      renderUpload({}, consented);
      await user.upload(fileInputs().file!, picture());
      await user.click(await screen.findByRole('button', { name: 'Какое фото подойдёт' }));

      const dialog = await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });
      expect(dialog).toHaveTextContent('Подойдёт');
      expect(within(dialog).getByRole('button', { name: 'Выбрать фото' })).toBeEnabled();
      expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('lets another photo be sent from the refusal, which closes it on success', async () => {
      once.push(refusedWith('dark'));
      const user = setup();
      const { onUploaded } = renderUpload({}, consented);
      await user.upload(fileInputs().file!, picture('first.jpg'));
      const dialog = await screen.findByRole('dialog', { name: 'Фото слишком тёмное' });

      await user.upload(fileInputs(dialog).file!, picture('second.jpg'));

      await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
      await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(uploads()).toHaveLength(2);
    });

    it('shows the refused photo from an object URL, in a recorder-blocked frame, and revokes it on close', async () => {
      answer = refusedWith('dark');
      const user = setup();
      renderUpload({}, consented);
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
      answer = refusedWith('not_full');
      const user = setup();
      const { unmount } = renderUpload({}, consented);
      await user.upload(fileInputs().file!, picture());
      await screen.findByRole('dialog', { name: 'Не видно фигуру целиком' });

      unmount();

      expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
    });

    it('for a child hides the photo: «Фото скрыто», no image, no object URL', async () => {
      answer = refusedWith('child');
      const user = setup();
      renderUpload({}, consented);
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
    expect(within(dialog).queryByRole('list')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Понятно' })).toBeEnabled();
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Выбрать фото' })).not.toBeInTheDocument();
    expect(fileInputs().all).toHaveLength(0);
  });

  it('«Понятно» opens «Ваше фото», and the consents gate the pickers', async () => {
    stubMedia(PHONE_QUERY, COARSE_POINTER_QUERY);
    const user = setup();
    renderUpload();
    await user.click(screen.getByRole('button', { name: 'Добавить фото' }));
    await user.click(await screen.findByRole('button', { name: 'Понятно' }));

    const dialog = await screen.findByRole('dialog', { name: 'Ваше фото' });
    expect(dialog).toHaveTextContent('Загрузите фото в полный рост');
    expect(within(dialog).getByRole('button', { name: 'Выбрать фото' })).toBeDisabled();

    await user.click(within(dialog).getByRole('checkbox', { name: 'На фото — я' }));
    expect(within(dialog).getByRole('button', { name: 'Выбрать фото' })).toBeDisabled();
    await user.click(within(dialog).getByRole('checkbox', { name: /OpenAI/ }));

    expect(within(dialog).getByRole('button', { name: 'Выбрать фото' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Сделать фото' })).toBeEnabled();
  });

  it('sends the consent when a file is chosen and closes on success', async () => {
    const user = setup();
    const { onUploaded, queryClient } = renderUpload();
    await user.click(screen.getByRole('button', { name: 'Добавить фото' }));
    await user.click(await screen.findByRole('button', { name: 'Понятно' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ваше фото' });
    await checkBothConsents(dialog, user);
    await user.upload(fileInputs(dialog).file!, picture());

    await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledWith(PHOTO));
    expect(requestOf().body.get('consent')).toBe('1');
    expect(consentOf(queryClient)).toBe(1);
    expect(tracked('Photo Uploaded')).toEqual([
      [
        'Photo Uploaded',
        { saved: true, source: 'file', place: 'photos', first: true, format: 'jpeg' },
      ],
    ]);
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closing the tips with Esc sends nothing', async () => {
    const user = setup();
    renderUpload();
    await user.click(screen.getByRole('button', { name: 'Добавить фото' }));
    await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });
    await user.keyboard('{Escape}');

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(uploads()).toHaveLength(0);
  });

  it('with the consents given shows the file picker alone at the screen width with a mouse', () => {
    renderUpload({}, consented);

    expect(screen.getByRole('button', { name: 'Добавить фото' })).toHaveClass('fullWidth');
    expect(screen.queryByRole('button', { name: 'Сделать фото' })).not.toBeInTheDocument();
  });

  it('with the consents given shows the two pickers at the screen width on a touch phone', () => {
    stubMedia(PHONE_QUERY, COARSE_POINTER_QUERY);
    renderUpload({}, consented);

    expect(screen.getByRole('button', { name: 'Добавить фото' })).toHaveClass('fullWidth');
    expect(screen.getByRole('button', { name: 'Сделать фото' })).toHaveClass('fullWidth');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('UploadPhoto in the try-on', () => {
  it('uploads a one-time photo with save=false and tracks it as not saved in the try-on', async () => {
    const user = setup();
    const { onUploaded } = renderUpload({ place: 'try-on', save: false }, consented);
    await user.upload(fileInputs().file!, picture());

    await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledWith(PHOTO));
    expect(requestOf().body.get('save')).toBe('false');
    expect(tracked('Photo Uploaded')).toEqual([
      [
        'Photo Uploaded',
        { saved: false, source: 'file', place: 'try-on', first: false, format: 'jpeg' },
      ],
    ]);
  });

  it('tracks a refusal with the try-on as its place and shows the note under its text', async () => {
    answer = refusedWith('dark');
    const user = setup();
    renderUpload(
      { place: 'try-on', refusalNote: <p>Примерка не списана · осталось 7</p> },
      consented,
    );
    await user.upload(fileInputs().file!, picture());

    const dialog = await screen.findByRole('dialog', { name: 'Фото слишком тёмное' });
    expect(within(dialog).getByText('Примерка не списана · осталось 7')).toBeInTheDocument();
    expect(tracked('Photo Refused')[0]).toEqual([
      'Photo Refused',
      { reason: 'dark', source: 'file', place: 'try-on', first: false, format: 'jpeg' },
    ]);
  });

  it('tells the file on its way, then null once it is stored', async () => {
    let finish: (response: Response) => void = () => undefined;
    answer = () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      });
    const onPendingChange = vi.fn();
    const user = setup();
    renderUpload({ place: 'try-on', onPendingChange }, consented);
    const file = picture('pending.jpg');
    await user.upload(fileInputs().file!, file);

    await vi.waitFor(() => expect(onPendingChange).toHaveBeenLastCalledWith(file));
    finish(await ok());
    await vi.waitFor(() => expect(onPendingChange).toHaveBeenLastCalledWith(null));
  });

  it('tells null again when the upload is refused', async () => {
    let finish: (response: Response) => void = () => undefined;
    answer = () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      });
    const onPendingChange = vi.fn();
    const user = setup();
    renderUpload({ place: 'try-on', onPendingChange }, consented);
    const file = picture();
    await user.upload(fileInputs().file!, file);
    await vi.waitFor(() => expect(onPendingChange).toHaveBeenLastCalledWith(file));
    finish(await refusedWith('dark')());

    await screen.findByRole('dialog', { name: 'Фото слишком тёмное' });
    expect(onPendingChange).toHaveBeenLastCalledWith(null);
  });

  it('offers the camera in the try-on only on a touch device (Y13)', () => {
    const { unmount } = renderUpload({ place: 'try-on' }, consented);
    expect(screen.queryByRole('button', { name: 'Сделать фото' })).not.toBeInTheDocument();
    unmount();

    stubTouch();
    renderUpload({ place: 'try-on' }, consented);
    expect(screen.getByRole('button', { name: 'Сделать фото' })).toBeEnabled();
  });

  it('names the replace button and its window «Заменить фото» by default', async () => {
    const user = setup();
    renderUpload({ place: 'try-on', appearance: 'replace' }, consented);

    await user.click(screen.getByRole('button', { name: 'Заменить фото' }));

    expect(await screen.findByRole('dialog', { name: 'Заменить фото' })).toBeInTheDocument();
  });

  it('names the replace button and its window by replaceLabel (Z35)', async () => {
    const user = setup();
    renderUpload(
      { place: 'try-on', appearance: 'replace', replaceLabel: 'Выбрать из сохранённых' },
      consented,
    );

    expect(screen.queryByRole('button', { name: 'Заменить фото' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Выбрать из сохранённых' }));

    expect(
      await screen.findByRole('dialog', { name: 'Выбрать из сохранённых' }),
    ).toBeInTheDocument();
  });
});

describe('UploadPhoto as the drop zone (AC8)', () => {
  const zoneProps = { place: 'try-on', appearance: 'zone', save: true } as const;
  const lead = () => screen.getByText('Загрузите своё фото');
  const zoneTarget = () => lead();

  function drop(files: File[], types: string[] = ['Files'], target: Element = zoneTarget()) {
    fireEvent.drop(target, { dataTransfer: { files, types } });
  }

  describe('empty', () => {
    it('shows the card, «Выбрать файл» and no camera on a mouse device', () => {
      renderUpload(zoneProps, consented);

      expect(lead()).toBeInTheDocument();
      expect(screen.getByText('Перетащите, вставьте Ctrl+V или выберите файл')).toBeInTheDocument();
      expect(screen.getByText('JPG, PNG, WebP, HEIC · до 20 МБ')).toBeInTheDocument();
      expect(screen.queryByText('Отпустите, чтобы загрузить')).not.toBeInTheDocument();
      expect(dropArea()).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Выбрать файл' })).toBeEnabled();
      expect(screen.queryByRole('button', { name: 'Сделать фото' })).not.toBeInTheDocument();
    });

    it.each([
      ['before the consents', undefined],
      ['after the consents', consented],
    ] as const)('keeps the area out of the tab order and the tree %s (Z47)', (_when, me) => {
      renderUpload(zoneProps, me);

      expect(dropArea()).toHaveAttribute('tabindex', '-1');
      expect(dropArea()).toHaveAttribute('aria-hidden', 'true');
      expect(screen.queryByRole('button', { name: 'Загрузить фото' })).not.toBeInTheDocument();
    });

    it('offers a mouse device only «Выбрать файл» as an accessible button (Z47)', () => {
      renderUpload(zoneProps, consented);

      expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
        'Выбрать файл',
      ]);
    });

    it('names the camera in the hint and has no «Выбрать файл» on a touch device', () => {
      stubTouch();
      renderUpload(zoneProps, consented);

      expect(screen.getByText('Выберите файл или сделайте фото')).toBeInTheDocument();
      expect(
        screen.queryByText('Перетащите, вставьте Ctrl+V или выберите файл'),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Выбрать файл' })).not.toBeInTheDocument();
    });

    it('uploads the file of the link «Выбрать файл» as a file and tracks the upload element', async () => {
      const user = setup();
      const { onUploaded } = renderUpload(zoneProps, consented);
      // The link's own input, the next node after its button.
      const linkInput = screen.getByRole('button', { name: 'Выбрать файл' })
        .nextElementSibling as HTMLInputElement;
      expect(linkInput).toHaveAttribute('type', 'file');
      const open = vi.spyOn(linkInput, 'click');

      await user.click(screen.getByRole('button', { name: 'Выбрать файл' }));

      expect(open).toHaveBeenCalledTimes(1);
      await user.upload(linkInput, picture('link.jpg'));
      await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledWith(PHOTO));
      expect((requestOf().body.get('photo') as File).name).toBe('link.jpg');
      expect(clickedElements()).toEqual(['photos.upload']);
      expect(tracked('Photo Uploaded')).toEqual([
        [
          'Photo Uploaded',
          { saved: true, source: 'file', place: 'try-on', first: false, format: 'jpeg' },
        ],
      ]);
    });

    it('opens the tips from «Выбрать файл» before the consents and tracks photos.upload', async () => {
      const user = setup();
      renderUpload(zoneProps);

      await user.click(screen.getByRole('button', { name: 'Выбрать файл' }));

      expect(
        await screen.findByRole('dialog', { name: 'Какое фото подойдёт' }),
      ).toBeInTheDocument();
      expect(uploads()).toHaveLength(0);
      expect(clickedElements()).toEqual(['photos.upload']);
    });

    it('keeps «Выбрать файл» off while /me loads', () => {
      renderUpload(zoneProps, 'loading');

      expect(screen.getByRole('button', { name: 'Выбрать файл' })).toBeDisabled();
      expect(dropArea()).toBeDisabled();
    });

    it('keeps «Выбрать файл» off when disabled', () => {
      renderUpload({ ...zoneProps, disabled: true }, consented);

      expect(screen.getByRole('button', { name: 'Выбрать файл' })).toBeDisabled();
    });

    it('adds «Сделать фото» on a touch device, with the front camera', () => {
      stubTouch();
      renderUpload(zoneProps, consented);

      expect(screen.getByRole('button', { name: 'Сделать фото' })).toBeEnabled();
      expect(fileInputs().camera).toHaveAttribute('capture', 'user');
    });

    it('uploads the file of a click on the area and tracks the upload element', async () => {
      const user = setup();
      const { onUploaded } = renderUpload(zoneProps, consented);
      await user.upload(fileInputs().file!, picture());

      await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledWith(PHOTO));
      expect(tracked('Photo Uploaded')).toEqual([
        [
          'Photo Uploaded',
          { saved: true, source: 'file', place: 'try-on', first: false, format: 'jpeg' },
        ],
      ]);
    });

    it('before the consents opens the tips from the area and sends no request', async () => {
      const user = setup();
      renderUpload(zoneProps);
      expect(fileInputs().all).toHaveLength(0);

      await user.click(dropArea());

      expect(
        await screen.findByRole('dialog', { name: 'Какое фото подойдёт' }),
      ).toBeInTheDocument();
      expect(uploads()).toHaveLength(0);
      expect(clickedElements()).toEqual(['photos.upload']);
    });

    it('opens the file picker from a click on the hidden area after the consents', async () => {
      const user = setup();
      const { onUploaded } = renderUpload(zoneProps, consented);
      const open = vi.spyOn(fileInputs().file!, 'click');

      await user.click(dropArea());

      expect(open).toHaveBeenCalledTimes(1);
      await user.upload(fileInputs().file!, picture());
      await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledWith(PHOTO));
    });

    it('is off when disabled', () => {
      renderUpload({ ...zoneProps, disabled: true }, consented);

      expect(dropArea()).toBeDisabled();
    });

    it('greys the card only while an upload is on its way', async () => {
      answer = () => new Promise<Response>(() => undefined);
      const user = setup();
      renderUpload(zoneProps, consented);
      const card = lead().closest('.dropCard')!;
      expect(card).not.toHaveClass('disabled');

      await user.upload(fileInputs().file!, picture());

      await vi.waitFor(() => expect(card).toHaveClass('disabled'));
      expect(uploads()).toHaveLength(1);
    });
  });

  describe('the two tiles on a touch device (Y21)', () => {
    beforeEach(stubTouch);

    it('shows «Загрузить фото» and «Сделать фото» as tile buttons, both in the zone', () => {
      renderUpload(zoneProps, consented);

      const camera = screen.getByRole('button', { name: 'Сделать фото' });
      const files = screen
        .getAllByRole('button', { name: 'Загрузить фото' })
        .filter((button) => button.classList.contains('tile'));
      expect(files).toHaveLength(1);
      expect(screen.getAllByRole('button', { name: 'Загрузить фото' })).toEqual(files);
      expect(files[0]).toBeEnabled();
      expect(camera).toHaveClass('tile');
      expect(camera).toBeEnabled();
    });

    it('opens the file input of the file tile, which uploads the chosen file', async () => {
      const user = setup();
      const { onUploaded } = renderUpload(zoneProps, consented);
      // The zone's whole area has a file input too; the tile's comes after it.
      const tileInput = fileInputs()
        .all.filter((input) => !input.hasAttribute('capture'))
        .at(-1)!;
      const open = vi.spyOn(tileInput, 'click');
      const tile = screen
        .getAllByRole('button', { name: 'Загрузить фото' })
        .find((button) => button.classList.contains('tile'))!;

      await user.click(tile);

      expect(open).toHaveBeenCalledTimes(1);
      await user.upload(tileInput, picture('tile.jpg'));
      await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledWith(PHOTO));
      expect((requestOf().body.get('photo') as File).name).toBe('tile.jpg');
      expect(tracked('Photo Uploaded')[0]).toEqual([
        'Photo Uploaded',
        { saved: true, source: 'file', place: 'try-on', first: false, format: 'jpeg' },
      ]);
    });

    it('opens the front camera input of «Сделать фото», which uploads as a camera shot', async () => {
      const user = setup();
      const { onUploaded } = renderUpload(zoneProps, consented);
      const open = vi.spyOn(fileInputs().camera!, 'click');

      await user.click(screen.getByRole('button', { name: 'Сделать фото' }));

      expect(open).toHaveBeenCalledTimes(1);
      expect(fileInputs().camera).toHaveAttribute('capture', 'user');
      await user.upload(fileInputs().camera!, picture('shot.jpg'));
      await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledWith(PHOTO));
      expect(tracked('Photo Uploaded')[0]).toEqual([
        'Photo Uploaded',
        { saved: true, source: 'camera', place: 'try-on', first: false, format: 'jpeg' },
      ]);
    });

    it('sends the clicks of the two tiles', async () => {
      const user = setup();
      renderUpload(zoneProps, consented);

      await user.click(
        screen
          .getAllByRole('button', { name: 'Загрузить фото' })
          .find((button) => button.classList.contains('tile'))!,
      );
      await user.click(screen.getByRole('button', { name: 'Сделать фото' }));

      expect(clickedElements()).toEqual(['photos.upload', 'photos.camera']);
    });

    it.each(['Загрузить фото', 'Сделать фото'])(
      'opens the tips from «%s» before the consents, with no file input and no request',
      async (name) => {
        const user = setup();
        renderUpload(zoneProps);
        expect(fileInputs().all).toHaveLength(0);
        const tile = screen
          .getAllByRole('button', { name })
          .find((button) => button.classList.contains('tile'))!;

        await user.click(tile);

        expect(
          await screen.findByRole('dialog', { name: 'Какое фото подойдёт' }),
        ).toBeInTheDocument();
        expect(uploads()).toHaveLength(0);
        expect(clickedElements()).toEqual([
          name === 'Сделать фото' ? 'photos.camera' : 'photos.upload',
        ]);
      },
    );

    it('keeps both tiles off while /me loads', () => {
      renderUpload(zoneProps, 'loading');

      expect(screen.getByRole('button', { name: 'Сделать фото' })).toBeDisabled();
      const tile = screen
        .getAllByRole('button', { name: 'Загрузить фото' })
        .find((button) => button.classList.contains('tile'))!;
      expect(tile).toBeDisabled();
    });

    it('keeps both tiles off when disabled', () => {
      renderUpload({ ...zoneProps, disabled: true }, consented);

      expect(screen.getByRole('button', { name: 'Сделать фото' })).toBeDisabled();
      expect(fileInputs().file).toBeDisabled();
    });

    it('shows the same tiles in the window of «Заменить фото»', async () => {
      const user = setup();
      renderUpload({ place: 'try-on', appearance: 'replace' }, consented);
      await user.click(screen.getByRole('button', { name: 'Заменить фото' }));

      const dialog = await screen.findByRole('dialog', { name: 'Заменить фото' });
      expect(within(dialog).getByRole('button', { name: 'Сделать фото' })).toHaveClass('tile');
      expect(within(dialog).getByRole('button', { name: 'Загрузить фото' })).toHaveClass('tile');
    });
  });

  describe('with a mouse (Y21)', () => {
    it('keeps no «Загрузить фото» button in the tree, no tiles and no camera', () => {
      renderUpload(zoneProps, consented);

      expect(screen.queryByRole('button', { name: 'Загрузить фото' })).not.toBeInTheDocument();
      expect(document.querySelector('.tile')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Сделать фото' })).not.toBeInTheDocument();
      expect(fileInputs().camera).toBeUndefined();
    });
  });

  describe('a dropped file', () => {
    it('uploads as a drop and tracks the source', async () => {
      const { onUploaded } = renderUpload(zoneProps, consented);

      drop([picture('dropped.jpg')]);

      await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledWith(PHOTO));
      expect((requestOf().body.get('photo') as File).name).toBe('dropped.jpg');
      expect(requestOf().body.get('save')).toBe('true');
      expect(requestOf().body.has('consent')).toBe(false);
      expect(tracked('Photo Uploaded')).toEqual([
        [
          'Photo Uploaded',
          { saved: true, source: 'drop', place: 'try-on', first: false, format: 'jpeg' },
        ],
      ]);
    });

    it.each([
      ['image/png', 'a.png'],
      ['image/webp', 'a.webp'],
    ])('takes %s too', async (type, name) => {
      renderUpload(zoneProps, consented);

      drop([new File(['x'], name, { type })]);

      await vi.waitFor(() => expect(uploads()).toHaveLength(1));
    });

    it('takes the first of several files only', async () => {
      renderUpload(zoneProps, consented);

      drop([picture('one.jpg'), picture('two.jpg')]);

      await vi.waitFor(() => expect(uploads()).toHaveLength(1));
      expect((requestOf().body.get('photo') as File).name).toBe('one.jpg');
    });

    it('tracks a refusal of a dropped photo with the source drop', async () => {
      answer = refusedWith('dark');
      renderUpload(zoneProps, consented);

      drop([picture()]);

      await screen.findByRole('dialog', { name: 'Фото слишком тёмное' });
      expect(tracked('Photo Refused')).toEqual([
        [
          'Photo Refused',
          { reason: 'dark', source: 'drop', place: 'try-on', first: false, format: 'jpeg' },
        ],
      ]);
    });

    it.each([
      ['a PDF', new File(['x'], 'doc.pdf', { type: 'application/pdf' })],
      ['a GIF', new File(['x'], 'anim.gif', { type: 'image/gif' })],
      ['a file of no type', new File(['x'], 'noext', { type: '' })],
    ])(
      'refuses %s with the text of the types, in the zone, and sends nothing',
      async (_n, file) => {
        renderUpload(zoneProps, consented);

        drop([file]);

        expect(await screen.findByRole('alert')).toHaveTextContent(WRONG_TYPE_TEXT);
        expect(WRONG_TYPE_TEXT).toBe('Нужно изображение JPG, PNG, WebP или HEIC');
        expect(uploads()).toHaveLength(0);
        expect(tracked('Photo Refused')).toHaveLength(0);
      },
    );

    it('refuses a wrong type before the consents too, without the tips', async () => {
      renderUpload(zoneProps);

      drop([new File(['x'], 'doc.pdf', { type: 'application/pdf' })]);

      expect(await screen.findByRole('alert')).toHaveTextContent(WRONG_TYPE_TEXT);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('refuses a file over the limit with the text of the size', async () => {
      renderUpload(zoneProps, consented);
      const big = picture('big.jpg');
      Object.defineProperty(big, 'size', { value: MAX_PHOTO_BYTES + 1 });

      drop([big]);

      expect(await screen.findByRole('alert')).toHaveTextContent(TOO_BIG_TEXT);
      expect(uploads()).toHaveLength(0);
    });

    it('clears the error text with the next upload', async () => {
      renderUpload(zoneProps, consented);
      drop([new File(['x'], 'doc.pdf', { type: 'application/pdf' })]);
      await screen.findByRole('alert');

      drop([picture()]);

      await vi.waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    });

    it('waits behind the tips and the consents before the first upload, then uploads as a drop', async () => {
      const user = setup();
      const { onUploaded, queryClient } = renderUpload(zoneProps);

      drop([picture('waiting.jpg')]);

      const dialog = await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });
      expect(uploads()).toHaveLength(0);
      const upload = within(dialog).getByRole('button', { name: 'Загрузить фото' });
      expect(upload).toBeDisabled();
      await user.click(within(dialog).getByRole('checkbox', { name: 'На фото — я' }));
      expect(uploads()).toHaveLength(0);
      await user.click(within(dialog).getByRole('checkbox', { name: /OpenAI/ }));

      await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledWith(PHOTO));
      expect(uploads()).toHaveLength(1);
      expect((requestOf().body.get('photo') as File).name).toBe('waiting.jpg');
      expect(requestOf().body.get('consent')).toBe('1');
      expect(consentOf(queryClient)).toBe(1);
      expect(tracked('Photo Uploaded')).toEqual([
        [
          'Photo Uploaded',
          { saved: true, source: 'drop', place: 'try-on', first: true, format: 'jpeg' },
        ],
      ]);
    });

    it('is forgotten when the tips are closed', async () => {
      const user = setup();
      renderUpload(zoneProps);
      drop([picture()]);
      await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });

      await user.keyboard('{Escape}');

      await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(uploads()).toHaveLength(0);
    });

    it('is ignored while /me loads', () => {
      renderUpload(zoneProps, 'loading');

      drop([picture()]);

      expect(uploads()).toHaveLength(0);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('is ignored when the zone is disabled', () => {
      renderUpload({ ...zoneProps, disabled: true }, consented);

      drop([picture()]);

      expect(uploads()).toHaveLength(0);
    });

    it('is ignored while another photo is on its way', async () => {
      answer = () => new Promise<Response>(() => undefined);
      renderUpload(zoneProps, consented);
      drop([picture('first.jpg')]);
      await vi.waitFor(() => expect(uploads()).toHaveLength(1));

      drop([picture('second.jpg')]);

      expect(uploads()).toHaveLength(1);
    });

    it('is ignored when the drag carries no files', () => {
      renderUpload(zoneProps, consented);

      drop([], ['text/plain']);
      drop([picture()], ['text/plain']);

      expect(uploads()).toHaveLength(0);
    });
  });

  describe('the drag over the zone', () => {
    const hint = 'Отпустите, чтобы загрузить';
    // The empty zone shows its drag on the card, with no hint of its own.
    const card = () => zoneTarget().closest('.dropCard')!;
    const darkened = () => card().classList.contains('dragging');

    // jsdom has no DragEvent, so Testing Library's event cannot carry `relatedTarget` by init.
    function leave(from: Element, to: Element | null) {
      const event = createEvent.dragLeave(from, { dataTransfer: { types: ['Files'] } });
      Object.defineProperty(event, 'relatedTarget', { value: to });
      fireEvent(from, event);
    }

    it('fills the empty card while files are over it, with no hint, and lets go on leaving', () => {
      renderUpload(zoneProps, consented);
      expect(darkened()).toBe(false);

      fireEvent.dragEnter(zoneTarget(), { dataTransfer: { types: ['Files'] } });
      expect(darkened()).toBe(true);
      expect(screen.queryByText(hint)).not.toBeInTheDocument();

      fireEvent.dragLeave(zoneTarget(), { dataTransfer: { types: ['Files'] } });
      expect(darkened()).toBe(false);
    });

    it('stays while the drag moves between the zone’s own elements', () => {
      renderUpload(zoneProps, consented);
      const inner = zoneTarget();
      const outer = inner.closest('div')!;

      fireEvent.dragEnter(outer, { dataTransfer: { types: ['Files'] } });
      leave(outer, inner);
      expect(darkened()).toBe(true);

      leave(inner, outer);
      expect(darkened()).toBe(true);

      leave(inner, document.body);
      expect(darkened()).toBe(false);
    });

    it('clears when the drag leaves for nowhere (off the page)', () => {
      renderUpload(zoneProps, consented);
      fireEvent.dragEnter(zoneTarget(), { dataTransfer: { types: ['Files'] } });

      leave(zoneTarget(), null);

      expect(darkened()).toBe(false);
    });

    it('darkens a zone with a photo inside with the hint, not a card', () => {
      renderUpload({ ...zoneProps, children: <p>Ваше фото тут</p> }, consented);
      const photo = screen.getByText('Ваше фото тут');
      expect(screen.queryByText(hint)).not.toBeInTheDocument();

      fireEvent.dragEnter(photo, { dataTransfer: { types: ['Files'] } });
      expect(screen.getByText(hint)).toBeInTheDocument();
      expect(photo.closest('.zone')).toHaveClass('dragging');

      fireEvent.dragLeave(photo, { dataTransfer: { types: ['Files'] } });
      expect(screen.queryByText(hint)).not.toBeInTheDocument();
    });

    it('does not darken while disabled, with dropEffect none', () => {
      renderUpload({ ...zoneProps, disabled: true }, consented);
      const dataTransfer = { types: ['Files'], dropEffect: 'copy' };

      fireEvent.dragEnter(zoneTarget(), { dataTransfer });
      fireEvent.dragOver(zoneTarget(), { dataTransfer });

      expect(darkened()).toBe(false);
      expect(dataTransfer.dropEffect).toBe('none');
    });

    it('does not darken while /me loads, with dropEffect none', () => {
      renderUpload(zoneProps, 'loading');
      const dataTransfer = { types: ['Files'], dropEffect: 'copy' };

      fireEvent.dragEnter(zoneTarget(), { dataTransfer });
      fireEvent.dragOver(zoneTarget(), { dataTransfer });

      expect(darkened()).toBe(false);
      expect(dataTransfer.dropEffect).toBe('none');
    });

    it('does not darken while its own upload is pending', async () => {
      answer = () => new Promise<Response>(() => undefined);
      renderUpload(zoneProps, consented);
      drop([picture()]);
      await vi.waitFor(() => expect(uploads()).toHaveLength(1));

      fireEvent.dragEnter(zoneTarget(), { dataTransfer: { types: ['Files'] } });

      expect(darkened()).toBe(false);
    });

    it('copies when it accepts a file', () => {
      renderUpload(zoneProps, consented);
      const dataTransfer = { types: ['Files'], dropEffect: 'none' };

      fireEvent.dragOver(zoneTarget(), { dataTransfer });

      expect(dataTransfer.dropEffect).toBe('copy');
    });

    it('clears the error text on the next drag in', async () => {
      renderUpload(zoneProps, consented);
      drop([new File(['x'], 'doc.pdf', { type: 'application/pdf' })]);
      await screen.findByRole('alert');

      fireEvent.dragEnter(zoneTarget(), { dataTransfer: { types: ['Files'] } });

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('clears the error text when it becomes disabled', async () => {
      const { update } = renderUpload(zoneProps, consented);
      drop([new File(['x'], 'doc.pdf', { type: 'application/pdf' })]);
      await screen.findByRole('alert');

      update({ ...zoneProps, disabled: true });

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('tells null when it unmounts with a file on its way', async () => {
      answer = () => new Promise<Response>(() => undefined);
      const onPendingChange = vi.fn();
      const { unmount } = renderUpload({ ...zoneProps, onPendingChange }, consented);
      const file = picture();
      drop([file]);
      await vi.waitFor(() => expect(onPendingChange).toHaveBeenLastCalledWith(file));

      unmount();

      expect(onPendingChange).toHaveBeenLastCalledWith(null);
    });

    it('ignores a drag of text', () => {
      renderUpload(zoneProps, consented);

      fireEvent.dragEnter(zoneTarget(), { dataTransfer: { types: ['text/plain'] } });

      expect(darkened()).toBe(false);
    });

    describe('a file dropped beside the zone', () => {
      function dropOnWindow(types: string[]) {
        const event = new Event('drop', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'dataTransfer', { value: { types, files: [] } });
        document.body.dispatchEvent(event);
        return event;
      }
      function dragOverWindow(types: string[]) {
        const event = new Event('dragover', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'dataTransfer', { value: { types } });
        document.body.dispatchEvent(event);
        return event;
      }

      it('is kept from opening in the tab while the zone is mounted', () => {
        renderUpload(zoneProps, consented);

        expect(dropOnWindow(['Files']).defaultPrevented).toBe(true);
        expect(dragOverWindow(['Files']).defaultPrevented).toBe(true);
      });

      it('leaves a drag without files alone', () => {
        renderUpload(zoneProps, consented);

        expect(dropOnWindow(['text/plain']).defaultPrevented).toBe(false);
        expect(dragOverWindow(['text/plain']).defaultPrevented).toBe(false);
      });

      it('is handled by the browser again after the zone is unmounted', () => {
        const { unmount } = renderUpload(zoneProps, consented);
        unmount();

        expect(dropOnWindow(['Files']).defaultPrevented).toBe(false);
        expect(dragOverWindow(['Files']).defaultPrevented).toBe(false);
      });
    });

    it('lets go of the card’s dragging look when the file is dropped', () => {
      answer = () => new Promise<Response>(() => undefined);
      renderUpload(zoneProps, consented);
      fireEvent.dragEnter(zoneTarget(), { dataTransfer: { types: ['Files'] } });
      expect(darkened()).toBe(true);

      drop([picture()]);

      expect(darkened()).toBe(false);
    });
  });

  describe('with a photo inside', () => {
    it('shows it instead of the line and the buttons, and still takes a drop', async () => {
      renderUpload({ ...zoneProps, children: <p>Ваше фото тут</p> }, consented);

      expect(screen.getByText('Ваше фото тут')).toBeInTheDocument();
      expect(screen.queryByText('Загрузите своё фото')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Выбрать файл' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Загрузить фото' })).not.toBeInTheDocument();
      expect(fileInputs().all).toHaveLength(0);

      drop([picture('over.jpg')], ['Files'], screen.getByText('Ваше фото тут'));

      await vi.waitFor(() => expect(uploads()).toHaveLength(1));
      expect((requestOf().body.get('photo') as File).name).toBe('over.jpg');
    });
  });
});

describe('UploadPhoto as «Заменить фото» (AC9)', () => {
  const replaceProps = {
    place: 'try-on',
    appearance: 'replace',
    thumbs: (close: () => void) => <button onClick={close}>Сохранённое фото</button>,
  } as const;

  async function openWindow(user: ReturnType<typeof setup>) {
    await user.click(screen.getByRole('button', { name: 'Заменить фото' }));
    return screen.findByRole('dialog', { name: 'Заменить фото' });
  }

  it('is a button that tracks its click and opens the window with the thumbs and the pickers', async () => {
    const user = setup();
    renderUpload(replaceProps, consented);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const dialog = await openWindow(user);

    expect(clickedElements()).toEqual(['try-on.replace-photo']);
    expect(within(dialog).getByRole('button', { name: 'Сохранённое фото' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Загрузить фото' })).toBeEnabled();
    expect(within(dialog).queryByRole('button', { name: 'Сделать фото' })).not.toBeInTheDocument();
  });

  it('offers the camera in the window on a touch device', async () => {
    stubTouch();
    const user = setup();
    renderUpload(replaceProps, consented);

    const dialog = await openWindow(user);

    expect(within(dialog).getByRole('button', { name: 'Сделать фото' })).toBeEnabled();
  });

  it('closes the window from a thumb', async () => {
    const user = setup();
    renderUpload(replaceProps, consented);
    const dialog = await openWindow(user);

    await user.click(within(dialog).getByRole('button', { name: 'Сохранённое фото' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(uploads()).toHaveLength(0);
  });

  it('uploads a chosen file and closes the window', async () => {
    const user = setup();
    const { onUploaded } = renderUpload({ ...replaceProps, save: false }, consented);
    const dialog = await openWindow(user);

    await user.upload(fileInputs(dialog).file!, picture('new.jpg'));

    await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledWith(PHOTO));
    expect((requestOf().body.get('photo') as File).name).toBe('new.jpg');
    expect(requestOf().body.get('save')).toBe('false');
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('before the consents opens the tips in place of the window', async () => {
    const user = setup();
    renderUpload(replaceProps);
    const dialog = await openWindow(user);

    await user.click(within(dialog).getByRole('button', { name: 'Загрузить фото' }));

    expect(await screen.findByRole('dialog', { name: 'Какое фото подойдёт' })).toBeInTheDocument();
    await vi.waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Заменить фото' })).not.toBeInTheDocument(),
    );
    expect(uploads()).toHaveLength(0);
  });

  it('is a sheet below 600px with the same content', async () => {
    stubPhone();
    const user = setup();
    renderUpload(replaceProps, consented);

    const dialog = await openWindow(user);

    expect(within(dialog).getByRole('button', { name: 'Сохранённое фото' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Загрузить фото' })).toBeEnabled();
  });

  it('is off when disabled', () => {
    renderUpload({ ...replaceProps, disabled: true }, consented);

    expect(screen.getByRole('button', { name: 'Заменить фото' })).toBeDisabled();
  });

  it('shows the error of a refused file under the button after the window closed', async () => {
    answer = failure(409, 'LIMIT_REACHED');
    const user = setup();
    renderUpload(replaceProps, consented);
    const dialog = await openWindow(user);

    await user.upload(fileInputs(dialog).file!, picture());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Достигнут лимит, больше добавить нельзя',
    );
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
    expect(clickedElements()).toEqual(['photos.upload']);
  });

  it('after the consents opens the file picker at once, with one input and no camera', async () => {
    const user = setup();
    renderUpload({ appearance: 'card' }, consented);

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
    expect(clickedElements()).toEqual(['photos.upload']);
  });

  it('has no camera input on a touch device either', () => {
    stubTouch();
    renderUpload({ appearance: 'card' }, consented);

    expect(screen.queryByRole('button', { name: 'Сделать фото' })).not.toBeInTheDocument();
    expect(fileInputs().camera).toBeUndefined();
  });

  it('after the consents uploads the chosen file and is busy meanwhile', async () => {
    let finish: (response: Response) => void = () => undefined;
    answer = () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      });
    const user = setup();
    const { onUploaded } = renderUpload({ appearance: 'card' }, consented);
    await user.upload(fileInputs().file!, picture('card.jpg'));

    const card = screen.getByRole('button', { name: 'Добавить фото' });
    await vi.waitFor(() => expect(card).toBeDisabled());
    expect(card).toHaveAttribute('aria-busy', 'true');
    expect(within(card).getByRole('progressbar', { name: 'Загрузка' })).toBeInTheDocument();
    expect((requestOf().body.get('photo') as File).name).toBe('card.jpg');

    finish(await ok());

    await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledWith(PHOTO));
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it.each([
    ['before the consents', false],
    ['after the consents', true],
  ])('is off when disabled, %s', async (_when, given) => {
    const user = setup();
    renderUpload({ appearance: 'card', disabled: true }, given ? consented : { version: null });

    const card = screen.getByRole('button', { name: 'Добавить фото' });
    expect(card).toBeDisabled();
    await user.click(card);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(tracked('Element Clicked')).toHaveLength(0);
    if (given) expect(fileInputs().file).toBeDisabled();
  });
});

describe('UploadPhoto with HEIC (AC27)', () => {
  const zoneProps = { place: 'try-on', appearance: 'zone', save: true } as const;
  const heic = (name = 'IMG_1.HEIC', type = 'image/heic') => new File(['h'], name, { type });
  const jpegOf = (name = 'IMG_1.jpg') => new File(['j'], name, { type: 'image/jpeg' });

  function dropFile(file: File) {
    fireEvent.drop(screen.getByText('Загрузите своё фото'), {
      dataTransfer: { files: [file], types: ['Files'] },
    });
  }

  it('names HEIC in the picker with a mouse only', () => {
    stubMedia(MOUSE_QUERY);
    renderUpload({}, consented);
    expect(fileInputs().file).toHaveAttribute(
      'accept',
      'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif',
    );
  });

  it('names no HEIC in the picker on a touch device', () => {
    stubTouch();
    renderUpload({}, consented);
    expect(fileInputs().file).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
    expect(fileInputs().camera).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
  });

  it('uploads the JPEG made of a dropped HEIC and tracks the original format', async () => {
    mocks.heicToJpeg.mockResolvedValue(jpegOf('IMG_1.jpg'));
    const { onUploaded } = renderUpload(zoneProps, consented);
    const original = heic();

    dropFile(original);

    await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledWith(PHOTO));
    expect(mocks.heicToJpeg).toHaveBeenCalledWith(original);
    const sent = requestOf().body.get('photo') as File;
    expect(sent.name).toBe('IMG_1.jpg');
    expect(sent.type).toBe('image/jpeg');
    expect(tracked('Photo Uploaded')).toEqual([
      [
        'Photo Uploaded',
        { saved: true, source: 'drop', place: 'try-on', first: false, format: 'heic' },
      ],
    ]);
  });

  it('takes a HEIC with no type by its extension', async () => {
    mocks.heicToJpeg.mockResolvedValue(jpegOf());
    renderUpload(zoneProps, consented);

    dropFile(heic('IMG_2.heif', ''));

    await vi.waitFor(() => expect(uploads()).toHaveLength(1));
    expect(mocks.heicToJpeg).toHaveBeenCalledTimes(1);
  });

  it('converts a HEIC chosen in the picker and tracks the file source', async () => {
    mocks.heicToJpeg.mockResolvedValue(jpegOf());
    // user-event keeps only the files the input's `accept` lists.
    stubMedia(MOUSE_QUERY);
    const user = setup();
    const { onUploaded } = renderUpload({}, consented);

    await user.upload(fileInputs().file!, heic());

    await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
    expect(tracked('Photo Uploaded')[0]).toEqual([
      'Photo Uploaded',
      { saved: true, source: 'file', place: 'photos', first: false, format: 'heic' },
    ]);
  });

  it('sends a JPEG, a PNG and a WebP without converting them', async () => {
    renderUpload(zoneProps, consented);

    dropFile(picture());

    await vi.waitFor(() => expect(uploads()).toHaveLength(1));
    expect(mocks.heicToJpeg).not.toHaveBeenCalled();
  });

  it('shows «Готовим фото…» and sends nothing until the conversion ends', async () => {
    let finish: (file: File) => void = () => undefined;
    mocks.heicToJpeg.mockReturnValue(
      new Promise<File>((resolve) => {
        finish = resolve;
      }),
    );
    answer = () => new Promise<Response>(() => undefined);
    const onPendingChange = vi.fn();
    renderUpload({ ...zoneProps, onPendingChange }, consented);

    dropFile(heic());

    expect(await screen.findByRole('status')).toHaveTextContent('Готовим фото…');
    expect(uploads()).toHaveLength(0);
    expect(fileInputs().file).toBeDisabled();
    // The page is told of the JPEG only once it exists.
    expect(onPendingChange).not.toHaveBeenCalledWith(expect.any(File));

    const jpeg = jpegOf();
    finish(jpeg);

    await vi.waitFor(() => expect(uploads()).toHaveLength(1));
    await vi.waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(onPendingChange).toHaveBeenLastCalledWith(jpeg);
  });

  it('ignores a second file while the first is being converted', async () => {
    mocks.heicToJpeg.mockReturnValue(new Promise<File>(() => undefined));
    renderUpload(zoneProps, consented);

    dropFile(heic('first.heic'));
    await screen.findByRole('status');
    dropFile(picture('second.jpg'));

    expect(uploads()).toHaveLength(0);
    expect(mocks.heicToJpeg).toHaveBeenCalledTimes(1);
  });

  it('spins the picker the HEIC came from and keeps the window of «Заменить фото» open meanwhile', async () => {
    let finish: (file: File) => void = () => undefined;
    mocks.heicToJpeg.mockReturnValue(
      new Promise<File>((resolve) => {
        finish = resolve;
      }),
    );
    stubMedia(MOUSE_QUERY);
    const user = setup();
    renderUpload({ place: 'try-on', appearance: 'replace' }, consented);
    await user.click(screen.getByRole('button', { name: 'Заменить фото' }));
    const dialog = await screen.findByRole('dialog', { name: 'Заменить фото' });

    await user.upload(fileInputs(dialog).file!, heic());

    const picker = within(dialog).getByRole('button', { name: 'Загрузить фото' });
    await vi.waitFor(() => expect(picker).toHaveAttribute('aria-busy', 'true'));
    expect(screen.getByRole('dialog', { name: 'Заменить фото' })).toBeInTheDocument();
    expect(uploads()).toHaveLength(0);

    finish(jpegOf());

    await vi.waitFor(() => expect(uploads()).toHaveLength(1));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows the HEIC text when the conversion fails and uploads nothing', async () => {
    mocks.heicToJpeg.mockRejectedValue(new Error('bad heic'));
    renderUpload(zoneProps, consented);

    dropFile(heic());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось прочитать HEIC — попробуйте JPG',
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(uploads()).toHaveLength(0);
    expect(tracked('Photo Uploaded')).toHaveLength(0);
    expect(tracked('Photo Refused')).toHaveLength(0);
  });

  it('lets the next file go after a failed conversion', async () => {
    mocks.heicToJpeg.mockRejectedValue(new Error('bad heic'));
    renderUpload(zoneProps, consented);
    dropFile(heic());
    await screen.findByRole('alert');

    dropFile(picture());

    await vi.waitFor(() => expect(uploads()).toHaveLength(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('refuses a HEIC over the limit before converting it', async () => {
    mocks.heicToJpeg.mockResolvedValue(jpegOf());
    renderUpload(zoneProps, consented);
    const big = heic();
    Object.defineProperty(big, 'size', { value: MAX_PHOTO_BYTES + 1 });

    dropFile(big);

    expect(await screen.findByRole('alert')).toHaveTextContent(TOO_BIG_TEXT);
    expect(mocks.heicToJpeg).not.toHaveBeenCalled();
    expect(uploads()).toHaveLength(0);
  });

  it('refuses a HEIC over the limit from the picker before converting it', async () => {
    stubMedia(MOUSE_QUERY);
    const user = setup();
    renderUpload({}, consented);
    const big = heic();
    Object.defineProperty(big, 'size', { value: MAX_PHOTO_BYTES + 1 });

    await user.upload(fileInputs().file!, big);

    expect(await screen.findByRole('alert')).toHaveTextContent(TOO_BIG_TEXT);
    expect(mocks.heicToJpeg).not.toHaveBeenCalled();
    expect(uploads()).toHaveLength(0);
  });

  it('refuses a JPEG made of a HEIC that is over the limit', async () => {
    const jpeg = jpegOf();
    Object.defineProperty(jpeg, 'size', { value: MAX_PHOTO_BYTES + 1 });
    mocks.heicToJpeg.mockResolvedValue(jpeg);
    renderUpload(zoneProps, consented);

    dropFile(heic());

    expect(await screen.findByRole('alert')).toHaveTextContent(TOO_BIG_TEXT);
    expect(uploads()).toHaveLength(0);
  });

  it('converts a HEIC dropped before the consents only once they are given', async () => {
    mocks.heicToJpeg.mockResolvedValue(jpegOf());
    const user = setup();
    renderUpload(zoneProps);

    dropFile(heic());

    const dialog = await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });
    expect(mocks.heicToJpeg).not.toHaveBeenCalled();
    await checkBothConsents(dialog, user);

    await vi.waitFor(() => expect(uploads()).toHaveLength(1));
    expect(tracked('Photo Uploaded')[0]).toEqual([
      'Photo Uploaded',
      { saved: true, source: 'drop', place: 'try-on', first: true, format: 'heic' },
    ]);
  });

  it('shows the converted JPEG, not the HEIC, on the refusal screen', async () => {
    const jpeg = jpegOf();
    mocks.heicToJpeg.mockResolvedValue(jpeg);
    answer = refusedWith('dark');
    renderUpload(zoneProps, consented);

    dropFile(heic());

    await screen.findByRole('dialog', { name: 'Фото слишком тёмное' });
    expect(createObjectURL).toHaveBeenCalledWith(jpeg);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('brings the pickers back after a failed conversion of a file that waited for the consents', async () => {
    mocks.heicToJpeg.mockRejectedValue(new Error('bad heic'));
    const user = setup();
    renderUpload(zoneProps);
    dropFile(heic());
    const dialog = await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });
    expect(within(dialog).getByRole('button', { name: 'Загрузить фото' })).toBeInTheDocument();

    await checkBothConsents(dialog, user);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Не удалось прочитать HEIC — попробуйте JPG',
    );
    expect(within(dialog).getByRole('button', { name: 'Выбрать фото' })).toBeEnabled();
    expect(
      within(dialog).queryByRole('button', { name: 'Загрузить фото' }),
    ).not.toBeInTheDocument();
    expect(uploads()).toHaveLength(0);
  });

  it('brings the pickers back after a converted JPEG over the limit, for a file that waited', async () => {
    const jpeg = jpegOf();
    Object.defineProperty(jpeg, 'size', { value: MAX_PHOTO_BYTES + 1 });
    mocks.heicToJpeg.mockResolvedValue(jpeg);
    const user = setup();
    renderUpload(zoneProps);
    dropFile(heic());
    const dialog = await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });

    await checkBothConsents(dialog, user);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(TOO_BIG_TEXT);
    expect(within(dialog).getByRole('button', { name: 'Выбрать фото' })).toBeEnabled();
    expect(
      within(dialog).queryByRole('button', { name: 'Загрузить фото' }),
    ).not.toBeInTheDocument();
    expect(uploads()).toHaveLength(0);
  });

  it('tracks a refusal of a converted photo with the original format', async () => {
    mocks.heicToJpeg.mockResolvedValue(jpegOf());
    answer = refusedWith('dark');
    renderUpload(zoneProps, consented);

    dropFile(heic());

    await screen.findByRole('dialog', { name: 'Фото слишком тёмное' });
    expect(tracked('Photo Refused')).toEqual([
      [
        'Photo Refused',
        { reason: 'dark', source: 'drop', place: 'try-on', first: false, format: 'heic' },
      ],
    ]);
  });
});

describe('UploadPhoto: a pasted image (AC28)', () => {
  const zoneProps = { place: 'try-on', appearance: 'zone', save: true } as const;

  interface Pasted {
    kind: string;
    type: string;
    file: File | null;
  }

  function paste(items: Pasted[], target: EventTarget = document.body) {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: {
        items: items.map((item) => ({
          kind: item.kind,
          type: item.type,
          getAsFile: () => item.file,
        })),
      },
    });
    target.dispatchEvent(event);
    return event;
  }

  const image = (file = picture('pasted.png')) => [
    { kind: 'file', type: file.type, file } satisfies Pasted,
  ];
  const png = () => new File(['x'], 'pasted.png', { type: 'image/png' });

  it('uploads the image as a paste and tracks the source', async () => {
    const { onUploaded } = renderUpload(zoneProps, consented);

    const event = paste(image(png()));

    expect(event.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledWith(PHOTO));
    expect((requestOf().body.get('photo') as File).name).toBe('pasted.png');
    expect(tracked('Photo Uploaded')).toEqual([
      [
        'Photo Uploaded',
        { saved: true, source: 'paste', place: 'try-on', first: false, format: 'png' },
      ],
    ]);
  });

  it('tracks a refusal of a pasted photo with the source paste', async () => {
    answer = refusedWith('dark');
    renderUpload(zoneProps, consented);

    paste(image(png()));

    await screen.findByRole('dialog', { name: 'Фото слишком тёмное' });
    expect(tracked('Photo Refused')).toEqual([
      [
        'Photo Refused',
        { reason: 'dark', source: 'paste', place: 'try-on', first: false, format: 'png' },
      ],
    ]);
  });

  it('does nothing for text and leaves the paste to the browser', () => {
    renderUpload(zoneProps, consented);

    const event = paste([{ kind: 'string', type: 'text/plain', file: null }]);

    expect(event.defaultPrevented).toBe(false);
    expect(uploads()).toHaveLength(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    ['a textarea', '<textarea aria-label="Пожелания"></textarea>'],
    ['a text input', '<input type="text" aria-label="Поиск">'],
  ])('does nothing when %s is focused', (_name, html) => {
    renderUpload(zoneProps, consented);
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.append(host);
    const field = host.firstElementChild as HTMLElement;
    field.focus();

    const event = paste(image(png()), field);

    expect(event.defaultPrevented).toBe(false);
    expect(uploads()).toHaveLength(0);
    host.remove();
  });

  it('still takes the image when a checkbox is focused', async () => {
    renderUpload(zoneProps, consented);
    const box = document.createElement('input');
    box.type = 'checkbox';
    document.body.append(box);
    box.focus();

    paste(image(png()), box);

    await vi.waitFor(() => expect(uploads()).toHaveLength(1));
    box.remove();
  });

  it('ignores a paste another handler already took', () => {
    renderUpload(zoneProps, consented);
    const taken = (event: Event) => event.preventDefault();
    document.body.addEventListener('paste', taken);

    paste(image(png()));

    document.body.removeEventListener('paste', taken);
    expect(uploads()).toHaveLength(0);
  });

  it('refuses a pasted GIF with the text of the types', async () => {
    renderUpload(zoneProps, consented);

    paste(image(new File(['x'], 'anim.gif', { type: 'image/gif' })));

    expect(await screen.findByRole('alert')).toHaveTextContent(WRONG_TYPE_TEXT);
    expect(uploads()).toHaveLength(0);
  });

  it('refuses a pasted image over the limit', async () => {
    renderUpload(zoneProps, consented);
    const big = png();
    Object.defineProperty(big, 'size', { value: MAX_PHOTO_BYTES + 1 });

    paste(image(big));

    expect(await screen.findByRole('alert')).toHaveTextContent(TOO_BIG_TEXT);
    expect(uploads()).toHaveLength(0);
  });

  it('converts a pasted HEIC', async () => {
    mocks.heicToJpeg.mockResolvedValue(new File(['j'], 'p.jpg', { type: 'image/jpeg' }));
    renderUpload(zoneProps, consented);

    paste(image(new File(['h'], 'p.heic', { type: 'image/heic' })));

    await vi.waitFor(() => expect(uploads()).toHaveLength(1));
    expect(tracked('Photo Uploaded')[0]).toEqual([
      'Photo Uploaded',
      { saved: true, source: 'paste', place: 'try-on', first: false, format: 'heic' },
    ]);
  });

  it('replaces a chosen photo', async () => {
    renderUpload({ ...zoneProps, children: <p>Ваше фото тут</p> }, consented);

    paste(image(png()));

    await vi.waitFor(() => expect(uploads()).toHaveLength(1));
  });

  it('waits behind the tips and the consents before the first upload', async () => {
    const user = setup();
    renderUpload(zoneProps);

    paste(image(png()));

    const dialog = await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });
    expect(uploads()).toHaveLength(0);
    await checkBothConsents(dialog, user);

    await vi.waitFor(() => expect(uploads()).toHaveLength(1));
    expect(requestOf().body.get('consent')).toBe('1');
    expect(tracked('Photo Uploaded')[0]).toEqual([
      'Photo Uploaded',
      { saved: true, source: 'paste', place: 'try-on', first: true, format: 'png' },
    ]);
  });

  it('does nothing while /me loads or the zone is disabled', () => {
    const { unmount } = renderUpload(zoneProps, 'loading');
    paste(image(png()));
    unmount();
    renderUpload({ ...zoneProps, disabled: true }, consented);
    paste(image(png()));
    expect(uploads()).toHaveLength(0);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('takes one paste at a time', async () => {
    answer = () => new Promise<Response>(() => undefined);
    renderUpload(zoneProps, consented);

    paste(image(png()));
    await vi.waitFor(() => expect(uploads()).toHaveLength(1));
    paste(image(png()));

    expect(uploads()).toHaveLength(1);
  });

  it.each(['buttons', 'card', 'replace'] as const)(
    'is not taken by the %s appearance',
    (appearance) => {
      renderUpload({ place: 'photos', appearance }, consented);

      const event = paste(image(png()));

      expect(event.defaultPrevented).toBe(false);
      expect(uploads()).toHaveLength(0);
    },
  );

  it('takes a paste made inside the dialog that holds the zone', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    queryClient.setQueryData(userKeys.me, { ...USER, photoConsentVersion: 1 });
    render(
      <div role="dialog" aria-label="Окно примерки">
        <QueryClientProvider client={queryClient}>
          <UploadPhoto {...zoneProps} />
        </QueryClientProvider>
      </div>,
    );

    const event = paste(image(png()), screen.getByRole('dialog', { name: 'Окно примерки' }));

    expect(event.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(uploads()).toHaveLength(1));
  });

  it('ignores a paste made inside another dialog', () => {
    renderUpload(zoneProps, consented);
    const other = document.createElement('div');
    other.setAttribute('role', 'dialog');
    other.tabIndex = -1;
    document.body.append(other);
    other.focus();

    const event = paste(image(png()), other);
    other.remove();

    expect(event.defaultPrevented).toBe(false);
    expect(uploads()).toHaveLength(0);
  });

  it('ignores a paste made inside the tips', async () => {
    const user = setup();
    renderUpload(zoneProps);
    await user.click(screen.getByRole('button', { name: 'Выбрать файл' }));
    const tips = await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });

    const event = paste(image(png()), tips);

    expect(event.defaultPrevented).toBe(false);
    expect(uploads()).toHaveLength(0);
    expect(within(tips).queryByRole('button', { name: 'Загрузить фото' })).not.toBeInTheDocument();
  });

  it('stops listening once the zone is unmounted', () => {
    const { unmount } = renderUpload(zoneProps, consented);
    unmount();

    const event = paste(image(png()));

    expect(event.defaultPrevented).toBe(false);
    expect(uploads()).toHaveLength(0);
  });
});

describe('UploadPhoto: onBusyChange', () => {
  const zoneProps = { place: 'try-on', appearance: 'zone', save: true } as const;
  const dropFile = (file: File) =>
    fireEvent.drop(screen.getByText('Загрузите своё фото'), {
      dataTransfer: { files: [file], types: ['Files'] },
    });

  it('is not called on an idle mount or unmount', () => {
    const onBusyChange = vi.fn();
    const { unmount } = renderUpload({ ...zoneProps, onBusyChange }, consented);
    unmount();

    expect(onBusyChange).not.toHaveBeenCalled();
  });

  it('says true while a photo uploads and false once it is stored', async () => {
    let finish: (response: Response) => void = () => undefined;
    answer = () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      });
    const onBusyChange = vi.fn();
    renderUpload({ ...zoneProps, onBusyChange }, consented);

    dropFile(picture());

    await vi.waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(true));
    expect(onBusyChange).not.toHaveBeenCalledWith(false);
    finish(await ok());
    await vi.waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false));
  });

  it('says false once a refused photo is answered', async () => {
    let finish: (response: Response) => void = () => undefined;
    answer = () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      });
    const onBusyChange = vi.fn();
    renderUpload({ ...zoneProps, onBusyChange }, consented);

    dropFile(picture());
    await vi.waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(true));
    finish(await refusedWith('dark')());

    await screen.findByRole('dialog', { name: 'Фото слишком тёмное' });
    await vi.waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false));
  });

  it('says true while a HEIC is prepared, before any upload, and false after a failed conversion', async () => {
    let fail: (reason: Error) => void = () => undefined;
    mocks.heicToJpeg.mockReturnValue(
      new Promise<File>((_resolve, reject) => {
        fail = reject;
      }),
    );
    const onBusyChange = vi.fn();
    renderUpload({ ...zoneProps, onBusyChange }, consented);

    dropFile(new File(['h'], 'a.heic', { type: 'image/heic' }));

    await vi.waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(true));
    expect(uploads()).toHaveLength(0);
    fail(new Error('bad heic'));
    await screen.findByRole('alert');
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(uploads()).toHaveLength(0);
  });

  it('says false when the component unmounts while busy', async () => {
    answer = () => new Promise<Response>(() => undefined);
    const onBusyChange = vi.fn();
    const { unmount } = renderUpload({ ...zoneProps, onBusyChange }, consented);
    dropFile(picture());
    await vi.waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(true));

    unmount();

    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it('says nothing for a file refused by its type or size', async () => {
    const onBusyChange = vi.fn();
    renderUpload({ ...zoneProps, onBusyChange }, consented);

    dropFile(new File(['x'], 'a.gif', { type: 'image/gif' }));
    await screen.findByRole('alert');

    expect(onBusyChange).not.toHaveBeenCalled();
  });
});
