import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ track: vi.fn(), captureException: vi.fn() }));
vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  reset: vi.fn(),
  track: mocks.track,
}));
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }));

import type { Fitting } from '@/entities/fitting';
import { userPhotoKeys, type UserPhoto } from '@/entities/user-photo';

import { SavePhotoSwitch, type SavePhotoSwitchProps } from './save-photo-switch';

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const OTHER = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5c';
const kept: UserPhoto = {
  id: ID,
  url: 'https://s3.example/keep/users/u/photo.webp?X-Amz-Signature=abc',
  isDefault: true,
  transient: false,
  width: 768,
  height: 1024,
  createdAt: '2026-10-01T12:00:00.000Z',
};

type Answer = () => Response | Promise<Response>;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const failure = (status: number, code: string) =>
  json({ error: { code, message: 'm', details: [] } }, status);

let keepAnswer: Answer;
let unkeepAnswer: Answer;
const fetchMock = vi.fn();

const calls = (method: string) =>
  fetchMock.mock.calls.filter(([, init]) => (init as RequestInit).method === method);

beforeEach(() => {
  vi.clearAllMocks();
  keepAnswer = () => json(kept);
  unkeepAnswer = () => new Response(null, { status: 204 });
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string, init: RequestInit) => {
    const { pathname } = new URL(String(url));
    if (pathname === `/api/me/photos/${ID}/keep`) {
      return Promise.resolve(init.method === 'PUT' ? keepAnswer() : unkeepAnswer());
    }
    return Promise.reject(new Error(`unexpected ${init.method} ${pathname}`));
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function setup(props: Partial<SavePhotoSwitchProps> = {}, strict = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const all: SavePhotoSwitchProps = {
    photoId: ID,
    photoTransient: true,
    uploadedHere: false,
    onKept: vi.fn(),
    onUnkept: vi.fn(),
    ...props,
  };
  const tree = (p: SavePhotoSwitchProps) => {
    const body = (
      <QueryClientProvider client={queryClient}>
        <SavePhotoSwitch {...p} />
      </QueryClientProvider>
    );
    return strict ? <StrictMode>{body}</StrictMode> : body;
  };
  const view = render(tree(all));
  return {
    container: view.container,
    props: all,
    queryClient,
    invalidate,
    rerender: (patch: Partial<SavePhotoSwitchProps>) => view.rerender(tree({ ...all, ...patch })),
  };
}

const toggle = () => screen.getByRole('switch', { name: 'Сохранить фото для следующих примерок' });
// Base UI marks a disabled switch on its span with `aria-disabled`, not the `disabled` attribute.
const isDisabled = () => toggle().getAttribute('aria-disabled') === 'true';
const settled = () => waitFor(() => expect(isDisabled()).toBe(false));
const clicks = () =>
  mocks.track.mock.calls
    .filter(
      ([event, props]) => event === 'Element Clicked' && props.element === 'result.save-photo',
    )
    .map(([, props]) => props);

describe('SavePhotoSwitch: what it shows', () => {
  it('shows the switch for a one-time photo', async () => {
    setup({ photoTransient: true });

    await settled();
    expect(toggle()).toBeChecked();
  });

  it('shows the switch for a photo uploaded in the window, whatever the fitting says', async () => {
    setup({ photoTransient: false, uploadedHere: true });

    await settled();
    expect(toggle()).toBeChecked();
  });

  it('says the photo is gone for a null photo, and keeps nothing', () => {
    setup({ photoId: null, photoTransient: null });

    expect(screen.getByText('Фото уже удалено')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows nothing for a saved photo', () => {
    const { container } = setup({ photoTransient: false });

    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not change what it shows when the props change later', async () => {
    const { rerender } = setup({ photoTransient: true });
    await settled();

    rerender({ photoTransient: false });

    expect(toggle()).toBeInTheDocument();
  });

  it('does not show a switch later for a photo that was saved at mount', () => {
    const { rerender } = setup({ photoTransient: false });

    rerender({ photoTransient: true });

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });
});

describe('SavePhotoSwitch: keeping on mount', () => {
  it('keeps the photo once, disabled while the request is pending', async () => {
    let finish: (response: Response) => void = () => undefined;
    keepAnswer = () => new Promise<Response>((resolve) => (finish = resolve));
    const { props } = setup();

    await waitFor(() => expect(calls('PUT')).toHaveLength(1));
    expect(toggle()).toBeChecked();
    expect(isDisabled()).toBe(true);
    finish(json(kept));

    await settled();
    expect(toggle()).toBeChecked();
    expect(props.onKept).toHaveBeenCalledExactlyOnceWith(kept);
  });

  it('keeps it once under StrictMode too', async () => {
    setup({}, true);

    await settled();
    expect(calls('PUT')).toHaveLength(1);
  });

  it('invalidates the photos query after the keep', async () => {
    const { invalidate } = setup();

    await settled();
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: userPhotoKeys.all }));
  });

  it('is off and disabled, with no error text, at 409 LIMIT_REACHED', async () => {
    keepAnswer = () => failure(409, 'LIMIT_REACHED');
    const { props } = setup();

    await waitFor(() => expect(toggle()).not.toBeChecked());
    expect(isDisabled()).toBe(true);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(props.onKept).not.toHaveBeenCalled();
  });

  it('says the photo is gone at 404', async () => {
    keepAnswer = () => failure(404, 'NOT_FOUND');
    setup();

    expect(await screen.findByText('Фото уже удалено')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('is off and enabled with the error text at 503, and turning on retries the keep', async () => {
    const user = userEvent.setup();
    keepAnswer = () => failure(503, 'SERVICE_UNAVAILABLE');
    const { props } = setup();

    expect(await screen.findByRole('alert')).not.toBeEmptyDOMElement();
    expect(toggle()).not.toBeChecked();
    expect(isDisabled()).toBe(false);
    expect(props.onKept).not.toHaveBeenCalled();

    keepAnswer = () => json(kept);
    await user.click(toggle());

    await waitFor(() => expect(toggle()).toBeChecked());
    await settled();
    expect(calls('PUT')).toHaveLength(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(props.onKept).toHaveBeenCalledExactlyOnceWith(kept);
  });
});

describe('SavePhotoSwitch: turning off and on', () => {
  it('unkeeps, then is off, tells onUnkept the photo as one-time and drops it from the cache', async () => {
    const user = userEvent.setup();
    const { props, queryClient } = setup();
    await settled();
    const other: UserPhoto = { ...kept, id: OTHER, isDefault: false };
    queryClient.setQueryData<UserPhoto[]>(userPhotoKeys.all, [kept, other]);

    await user.click(toggle());

    await waitFor(() => expect(toggle()).not.toBeChecked());
    expect(calls('DELETE')).toHaveLength(1);
    expect(props.onUnkept).toHaveBeenCalledExactlyOnceWith({
      ...kept,
      transient: true,
      isDefault: false,
    });
    expect(queryClient.getQueryData<UserPhoto[]>(userPhotoKeys.all)).toEqual([other]);
  });

  it('is disabled while the unkeep is pending', async () => {
    const user = userEvent.setup();
    let finish: (response: Response) => void = () => undefined;
    setup();
    await settled();
    unkeepAnswer = () => new Promise<Response>((resolve) => (finish = resolve));

    await user.click(toggle());

    await waitFor(() => expect(isDisabled()).toBe(true));
    finish(new Response(null, { status: 204 }));
    await settled();
  });

  it('keeps it on with the error text when the unkeep fails', async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await settled();
    unkeepAnswer = () => failure(503, 'SERVICE_UNAVAILABLE');

    await user.click(toggle());

    expect(await screen.findByRole('alert')).not.toBeEmptyDOMElement();
    expect(toggle()).toBeChecked();
    expect(props.onUnkept).not.toHaveBeenCalled();
  });

  it('says the photo is gone when the unkeep gets 404', async () => {
    const user = userEvent.setup();
    setup();
    await settled();
    unkeepAnswer = () => failure(404, 'NOT_FOUND');

    await user.click(toggle());

    expect(await screen.findByText('Фото уже удалено')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('keeps the photo again when turned back on', async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await settled();
    await user.click(toggle());
    await waitFor(() => expect(toggle()).not.toBeChecked());
    await settled();

    await user.click(toggle());

    await waitFor(() => expect(toggle()).toBeChecked());
    await settled();
    expect(calls('PUT')).toHaveLength(2);
    expect(props.onKept).toHaveBeenCalledTimes(2);
  });
});

describe('SavePhotoSwitch: declined', () => {
  it('mounts off and sends no keep by itself', async () => {
    setup({ declined: true });

    await settled();
    expect(toggle()).not.toBeChecked();
    expect(calls('PUT')).toHaveLength(0);
  });

  it('keeps the photo when turned on', async () => {
    const user = userEvent.setup();
    const { props } = setup({ declined: true });
    await settled();

    await user.click(toggle());

    await waitFor(() => expect(toggle()).toBeChecked());
    expect(calls('PUT')).toHaveLength(1);
    expect(props.onKept).toHaveBeenCalledExactlyOnceWith(kept);
  });

  it('is taken once at mount: a later prop change turns nothing', async () => {
    const { rerender } = setup({ declined: true });
    await settled();

    rerender({ declined: false });

    expect(toggle()).not.toBeChecked();
    expect(calls('PUT')).toHaveLength(0);
  });
});

describe('SavePhotoSwitch: onKeeping', () => {
  it('tells true when the keep starts and false when it succeeds', async () => {
    let finish: (response: Response) => void = () => undefined;
    keepAnswer = () => new Promise<Response>((resolve) => (finish = resolve));
    const onKeeping = vi.fn();
    setup({ onKeeping });

    await waitFor(() => expect(onKeeping).toHaveBeenCalledExactlyOnceWith(ID, true));
    finish(json(kept));

    await waitFor(() => expect(onKeeping).toHaveBeenCalledTimes(2));
    expect(onKeeping).toHaveBeenLastCalledWith(ID, false);
  });

  it('tells false when the keep fails', async () => {
    keepAnswer = () => failure(503, 'SERVICE_UNAVAILABLE');
    const onKeeping = vi.fn();
    setup({ onKeeping });

    await waitFor(() => expect(onKeeping).toHaveBeenCalledTimes(2));
    expect(onKeeping).toHaveBeenNthCalledWith(1, ID, true);
    expect(onKeeping).toHaveBeenNthCalledWith(2, ID, false);
  });

  it('is not called for a declined mount', async () => {
    const onKeeping = vi.fn();
    setup({ declined: true, onKeeping });

    await settled();
    expect(onKeeping).not.toHaveBeenCalled();
  });
});

describe('SavePhotoSwitch: the cache', () => {
  const FITTING = '00000000-0000-4000-8000-0000000000e1';
  const ELSE = '00000000-0000-4000-8000-0000000000e2';
  const detailKey = (id: string) => ['users', 'fittings', 'detail', id];
  const fittingOf = (id: string, photoId: string | null, photoTransient: boolean | null) =>
    ({ id, photoId, photoTransient }) as unknown as Fitting;
  const fittingIn = (client: QueryClient, id: string) =>
    client.getQueryData<Fitting>(detailKey(id));

  function seed(client: QueryClient) {
    client.setQueryData(detailKey(FITTING), fittingOf(FITTING, ID, true));
    client.setQueryData(detailKey(ELSE), fittingOf(ELSE, OTHER, true));
  }

  it('marks the fittings on the photo as kept, leaves the others, and adds the photo to the list', async () => {
    const { queryClient } = setup();
    seed(queryClient);
    queryClient.setQueryData<UserPhoto[]>(userPhotoKeys.all, []);

    await waitFor(() => expect(fittingIn(queryClient, FITTING)?.photoTransient).toBe(false));
    expect(fittingIn(queryClient, ELSE)?.photoTransient).toBe(true);
    expect(queryClient.getQueryData<UserPhoto[]>(userPhotoKeys.all)).toEqual([kept]);
  });

  it('does not add the photo to the list twice', async () => {
    const { queryClient } = setup();
    queryClient.setQueryData<UserPhoto[]>(userPhotoKeys.all, [kept]);

    await settled();
    expect(queryClient.getQueryData<UserPhoto[]>(userPhotoKeys.all)).toEqual([kept]);
  });

  it('marks the fittings on the photo as one-time again after an unkeep', async () => {
    const user = userEvent.setup();
    const { queryClient } = setup();
    seed(queryClient);
    await waitFor(() => expect(fittingIn(queryClient, FITTING)?.photoTransient).toBe(false));
    await settled();

    await user.click(toggle());

    await waitFor(() => expect(fittingIn(queryClient, FITTING)?.photoTransient).toBe(true));
    expect(fittingIn(queryClient, ELSE)?.photoTransient).toBe(true);
  });
});

describe('SavePhotoSwitch: tracking', () => {
  it('sends result.save-photo with saved false when turning off and true when turning on', async () => {
    const user = userEvent.setup();
    setup();
    await settled();

    await user.click(toggle());
    await waitFor(() => expect(toggle()).not.toBeChecked());
    await settled();
    await user.click(toggle());
    await waitFor(() => expect(toggle()).toBeChecked());

    expect(clicks()).toEqual([
      expect.objectContaining({ element: 'result.save-photo', saved: false }),
      expect.objectContaining({ element: 'result.save-photo', saved: true }),
    ]);
  });

  // The switch's own track is 34×14: the hover belongs to the whole row, the label too.
  it('sends the hover of result.save-photo when the pointer rests on the label text', async () => {
    const user = userEvent.setup();
    setup();
    await settled();

    await user.hover(screen.getByText('Сохранить фото для следующих примерок'));

    // The hover's real 500 ms rest, with room for a slow CI.
    await waitFor(
      () =>
        expect(mocks.track).toHaveBeenCalledWith(
          'Element Hovered',
          expect.objectContaining({ element: 'result.save-photo', saved: false }),
        ),
      { timeout: 3000 },
    );
    expect(mocks.track).not.toHaveBeenCalledWith('Element Clicked', expect.anything());
  });
});
