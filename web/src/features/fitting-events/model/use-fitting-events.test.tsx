import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { showFitting, watchFitting, type Fitting } from '@/entities/fitting';

const mocks = vi.hoisted(() => ({
  track: vi.fn(),
  captureException: vi.fn(),
  push: vi.fn(),
  showToast: vi.fn(),
  deliver: undefined as undefined | ((push: unknown) => void),
}));

vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  reset: vi.fn(),
  track: mocks.track,
}));
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  usePathname: () => '/catalog',
}));
vi.mock('@/shared/realtime', () => ({
  useRealtimeEvent: (_event: unknown, handler: (push: unknown) => void) => {
    mocks.deliver = handler;
  },
}));
vi.mock('@/shared/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/ui')>()),
  showToast: mocks.showToast,
}));

import { useFittingEvents } from './use-fitting-events';

const PHOTO = '00000000-0000-4000-8000-0000000000f1';
const PRODUCT = '00000000-0000-4000-8000-0000000000a1';
const COLOUR = '00000000-0000-4000-8000-0000000000c1';
const NEW_ID = '00000000-0000-4000-8000-0000000000d9';
const fetchMock = vi.fn();

let counter = 0;

function fitting(patch: Partial<Fitting> = {}): Fitting {
  counter += 1;
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, '1')}`,
    kind: 'single',
    parentId: null,
    status: 'completed',
    stage: 'done',
    failureCode: null,
    failureCategory: null,
    failureStage: null,
    countsAgainstLimit: true,
    regenerationFree: true,
    model: 'gpt-image-2',
    items: [
      {
        productId: PRODUCT,
        name: 'Сарафан на бретелях',
        brand: 'B',
        imageUrl: null,
        price: 1,
        finalPrice: 1,
        attributeValueId: COLOUR,
        colour: 'Красный',
        slot: 'top',
      },
    ],
    promptText: null,
    photoId: PHOTO,
    photoTransient: false,
    resultUrl: 'https://s3.test/r.webp',
    createdAt: '2026-10-20T12:00:00.000Z',
    startedAt: null,
    finishedAt: '2026-10-20T12:00:20.000Z',
    estimatedSeconds: null,
    ...patch,
  };
}

function json(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

// The api serves the given fitting for its id; a start answers a new pending fitting.
function serve(read: Fitting) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    if (init?.method === 'POST' && path === '/api/fittings') {
      return json(201, {
        ...fitting({ status: 'pending', stage: 'queued', finishedAt: null }),
        id: NEW_ID,
        repeated: false,
      });
    }
    if (path === `/api/fittings/${read.id}`) return json(200, read);
    return json(404, { error: { code: 'NOT_FOUND', message: 'm', details: [] } });
  });
}

function Host() {
  useFittingEvents();
  return null;
}

function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  render(
    <QueryClientProvider client={queryClient}>
      <Host />
    </QueryClientProvider>,
  );
  return { invalidate };
}

async function push(read: Fitting, kind: 'single' | 'look' = read.kind) {
  await act(async () => {
    mocks.deliver?.({
      generationId: read.id,
      kind,
      status: read.status === 'failed' ? 'failed' : 'completed',
    });
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
  });
}

function toast(): { title: string; actionLabel: string; onAction: () => void; tone?: string } {
  expect(mocks.showToast).toHaveBeenCalledTimes(1);
  return mocks.showToast.mock.calls[0]?.[0];
}

function tracked(name: string) {
  return mocks.track.mock.calls.filter(([event]) => event === name);
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  mocks.deliver = undefined;
});

describe('useFittingEvents on a finished push', () => {
  it('reads the fittings again, then the fitting itself', async () => {
    const done = fitting();
    serve(done);
    const { invalidate } = mount();

    await push(done);

    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalledTimes(1));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users', 'fittings'] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).pathname).toBe(`/api/fittings/${done.id}`);
  });

  it('says the try-on is ready, naming the item, with «Открыть» (AC10)', async () => {
    const done = fitting();
    serve(done);
    mount();

    await push(done);

    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalledTimes(1));
    expect(toast().title).toBe('Примерка готова: сарафан на бретелях');
    expect(toast().actionLabel).toBe('Открыть');
    expect(toast().tone).toBeUndefined();
  });

  it('opens the fitting from the action and tracks it', async () => {
    const done = fitting();
    serve(done);
    mount();
    await push(done);
    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalledTimes(1));

    toast().onAction();

    expect(mocks.push).toHaveBeenCalledWith(`/customer/fittings?fitting=${done.id}`);
    expect(mocks.track).toHaveBeenCalledWith(
      'Element Clicked',
      expect.objectContaining({ element: 'fitting-toast.open', kind: 'single' }),
    );
  });

  it('says a look is ready without an item name', async () => {
    const done = fitting({ kind: 'look' });
    serve(done);
    mount();

    await push(done);

    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalledTimes(1));
    expect(toast().title).toBe('Примерка образа готова');
  });

  it('says a failed try-on spent nothing, as an error with «Повторить» (AC10)', async () => {
    const failed = fitting({
      status: 'failed',
      failureCode: 'model_timeout',
      resultUrl: null,
      countsAgainstLimit: false,
    });
    serve(failed);
    mount();

    await push(failed);

    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalledTimes(1));
    expect(toast()).toMatchObject({
      title: 'Примерка не удалась: сарафан на бретелях. Лимит не списан.',
      actionLabel: 'Повторить',
      tone: 'error',
    });
  });

  it('says a failed look spent nothing', async () => {
    const failed = fitting({
      kind: 'look',
      status: 'failed',
      failureCode: 'moderation',
      countsAgainstLimit: false,
    });
    serve(failed);
    mount();

    await push(failed);

    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalledTimes(1));
    expect(toast().title).toBe('Примерка образа не удалась. Лимит не списан.');
  });

  it('does not claim the limit was kept for a failed try-on that stays spent', async () => {
    const failed = fitting({
      status: 'failed',
      failureCode: 'model_timeout',
      countsAgainstLimit: true,
    });
    serve(failed);
    mount();

    await push(failed);

    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalledTimes(1));
    expect(toast().title).toBe('Примерка не удалась: сарафан на бретелях.');
  });

  it('does not claim the limit was kept for a failed look that stays spent', async () => {
    const failed = fitting({
      kind: 'look',
      status: 'failed',
      failureCode: 'moderation',
      countsAgainstLimit: true,
    });
    serve(failed);
    mount();

    await push(failed);

    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalledTimes(1));
    expect(toast().title).toBe('Примерка образа не удалась.');
  });

  it('starts the same try-on again from «Повторить» and opens the new fitting', async () => {
    const failed = fitting({ status: 'failed', failureCode: 'model_timeout' });
    serve(failed);
    mount();
    await push(failed);
    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalledTimes(1));

    toast().onAction();

    await vi.waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(`/customer/fittings?fitting=${NEW_ID}`),
    );
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1].body))).toEqual({
      photoId: PHOTO,
      kind: 'single',
      items: [{ productId: PRODUCT, attributeValueId: COLOUR }],
    });
    expect(tracked('Fitting Started')[0]?.[1]).toMatchObject({ source: 'retry' });
    expect(mocks.track).toHaveBeenCalledWith(
      'Element Clicked',
      expect.objectContaining({ element: 'fitting-toast.retry', kind: 'single' }),
    );
  });

  it.each([
    ['a regeneration', { parentId: '00000000-0000-4000-8000-0000000000b1' }],
    ['one whose photo is gone', { photoId: null }],
    ['a look', { kind: 'look' as const }],
  ])('opens the failed fitting instead of restarting %s', async (_name, patch) => {
    const failed = fitting({ status: 'failed', failureCode: 'model_timeout', ...patch });
    serve(failed);
    mount();
    await push(failed);
    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalledTimes(1));

    toast().onAction();

    expect(mocks.push).toHaveBeenCalledWith(`/customer/fittings?fitting=${failed.id}`);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('opens the failed fitting when the restart itself fails', async () => {
    const failed = fitting({ status: 'failed', failureCode: 'model_timeout' });
    serve(failed);
    mount();
    await push(failed);
    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalledTimes(1));
    fetchMock.mockImplementation(() =>
      json(409, { error: { code: 'LIMIT_REACHED', message: 'm', details: [] } }),
    );

    toast().onAction();

    await vi.waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(`/customer/fittings?fitting=${failed.id}`),
    );
  });

  it('shows no toast for a fitting an open window shows, and still reads it', async () => {
    const done = fitting();
    serve(done);
    mount();
    const hide = showFitting(done.id);

    await push(done);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.showToast).not.toHaveBeenCalled();
    hide();
  });

  it('shows a toast again once the window no longer shows the fitting', async () => {
    const done = fitting();
    serve(done);
    mount();
    showFitting(done.id)();

    await push(done);

    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalledTimes(1));
  });

  it('shows no toast and reports when the fitting cannot be read', async () => {
    const done = fitting();
    fetchMock.mockImplementation(() =>
      json(404, { error: { code: 'NOT_FOUND', message: 'm', details: [] } }),
    );
    mount();

    await push(done);

    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it('sends the end of a watched fitting once, even when the push comes twice', async () => {
    const done = fitting();
    serve(done);
    mount();
    watchFitting(done.id);

    await push(done);
    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalledTimes(1));
    await push(done);
    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalledTimes(2));

    expect(tracked('Fitting Completed')).toHaveLength(1);
  });

  it('sends Fitting Failed for a watched failed fitting', async () => {
    const failed = fitting({ status: 'failed', failureCode: 'moderation' });
    serve(failed);
    mount();
    watchFitting(failed.id);

    await push(failed);

    await vi.waitFor(() => expect(tracked('Fitting Failed')).toHaveLength(1));
    expect(tracked('Fitting Failed')[0]?.[1]).toMatchObject({ reason: 'moderation' });
  });

  it('sends no outcome event for a fitting this tab did not watch', async () => {
    const done = fitting();
    serve(done);
    mount();

    await push(done);
    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalledTimes(1));

    expect(tracked('Fitting Completed')).toHaveLength(0);
  });

  it('sends the outcome event even when a window shows the fitting', async () => {
    const done = fitting();
    serve(done);
    mount();
    watchFitting(done.id);
    const hide = showFitting(done.id);

    await push(done);

    await vi.waitFor(() => expect(tracked('Fitting Completed')).toHaveLength(1));
    expect(mocks.showToast).not.toHaveBeenCalled();
    hide();
  });
});
