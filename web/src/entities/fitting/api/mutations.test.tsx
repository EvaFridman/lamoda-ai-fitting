import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const track = vi.hoisted(() => vi.fn());
const requests = vi.hoisted(() => ({ startFitting: vi.fn(), regenerateFitting: vi.fn() }));
const reportFailure = vi.hoisted(() => vi.fn());

vi.mock('@/shared/analytics', () => ({ track }));
vi.mock('./fitting-requests', () => requests);
vi.mock('@/shared/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api')>()),
  reportFailure,
}));

import { ApiError } from '@/shared/api';

import type { StartedFitting } from '../model/schemas';
import { fittingKeys } from './keys';
import {
  repeatBody,
  useRegenerateFitting,
  useRepeatFitting,
  useStartLookFitting,
  useStartSingleFitting,
} from './mutations';

const PHOTO = '00000000-0000-4000-8000-0000000000f1';
const PRODUCT = '00000000-0000-4000-8000-0000000000a1';
const COLOUR = '00000000-0000-4000-8000-0000000000c1';
const FITTING = '00000000-0000-4000-8000-0000000000e1';

function started(patch: Partial<StartedFitting> = {}): StartedFitting {
  return {
    id: FITTING,
    kind: 'single',
    parentId: null,
    status: 'pending',
    stage: 'queued',
    failureCode: null,
    failureCategory: null,
    failureStage: null,
    countsAgainstLimit: true,
    regenerationFree: true,
    model: 'gpt-image-2',
    items: [],
    promptText: null,
    photoId: PHOTO,
    photoTransient: false,
    resultUrl: null,
    createdAt: '2026-10-20T12:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    estimatedSeconds: 25,
    repeated: false,
    ...patch,
  };
}

function refusal(code: string): ApiError {
  return new ApiError('refused', {
    kind: 'http',
    template: '/fittings',
    method: 'POST',
    status: 409,
    code,
  });
}

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  track.mockReset();
  reportFailure.mockReset();
  requests.startFitting.mockReset();
  requests.regenerateFitting.mockReset();
});

describe('useStartSingleFitting', () => {
  it('starts a single fitting of the product in its own colour when none is given', async () => {
    requests.startFitting.mockResolvedValue(started());
    const { result } = renderHook(() => useStartSingleFitting(), { wrapper });
    await act(() =>
      result.current.mutateAsync({ photoId: PHOTO, productId: PRODUCT, source: 'picker' }),
    );
    expect(requests.startFitting).toHaveBeenCalledExactlyOnceWith({
      photoId: PHOTO,
      kind: 'single',
      items: [{ productId: PRODUCT }],
    });
  });

  it('sends the chosen colour with the item', async () => {
    requests.startFitting.mockResolvedValue(started());
    const { result } = renderHook(() => useStartSingleFitting(), { wrapper });
    await act(() =>
      result.current.mutateAsync({
        photoId: PHOTO,
        productId: PRODUCT,
        attributeValueId: COLOUR,
        source: 'colour',
      }),
    );
    expect(requests.startFitting).toHaveBeenCalledWith(
      expect.objectContaining({ items: [{ productId: PRODUCT, attributeValueId: COLOUR }] }),
    );
  });

  it('puts the started fitting, without `repeated`, into its own entry', async () => {
    requests.startFitting.mockResolvedValue(started({ repeated: true }));
    const { result } = renderHook(() => useStartSingleFitting(), { wrapper });
    await act(() =>
      result.current.mutateAsync({ photoId: PHOTO, productId: PRODUCT, source: 'picker' }),
    );
    const stored = client.getQueryData<Record<string, unknown>>(fittingKeys.detail(FITTING));
    expect(stored).toMatchObject({ id: FITTING, status: 'pending' });
    expect(stored).not.toHaveProperty('repeated');
  });

  it('reads the lists and the quota again but not the started fitting', async () => {
    requests.startFitting.mockResolvedValue(started());
    client.setQueryData(fittingKeys.quota, { limit: 20, used: 0, left: 20 });
    client.setQueryData(fittingKeys.list(), { pages: [], pageParams: [] });
    const { result } = renderHook(() => useStartSingleFitting(), { wrapper });
    await act(() =>
      result.current.mutateAsync({ photoId: PHOTO, productId: PRODUCT, source: 'picker' }),
    );
    expect(client.getQueryState(fittingKeys.quota)?.isInvalidated).toBe(true);
    expect(client.getQueryState(fittingKeys.list())?.isInvalidated).toBe(true);
    expect(client.getQueryState(fittingKeys.detail(FITTING))?.isInvalidated).toBe(false);
  });

  it('sends Fitting Started with the source of the start', async () => {
    requests.startFitting.mockResolvedValue(started());
    const { result } = renderHook(() => useStartSingleFitting(), { wrapper });
    await act(() =>
      result.current.mutateAsync({ photoId: PHOTO, productId: PRODUCT, source: 'retry' }),
    );
    expect(track).toHaveBeenCalledWith(
      'Fitting Started',
      expect.objectContaining({ kind: 'single', source: 'retry', with_prompt: false }),
    );
  });

  it('does not repeat a failed start', async () => {
    requests.startFitting.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useStartSingleFitting(), { wrapper });
    await act(() =>
      result.current
        .mutateAsync({ photoId: PHOTO, productId: PRODUCT, source: 'picker' })
        .catch(() => undefined),
    );
    expect(requests.startFitting).toHaveBeenCalledTimes(1);
  });

  it('keeps nothing of a finished mutation in the cache', async () => {
    requests.startFitting.mockResolvedValue(started());
    const { result, unmount } = renderHook(() => useStartSingleFitting(), { wrapper });
    await act(() =>
      result.current.mutateAsync({ photoId: PHOTO, productId: PRODUCT, source: 'picker' }),
    );
    unmount();
    await waitFor(() => {
      expect(client.getMutationCache().getAll()).toHaveLength(0);
    });
  });

  it('reports the limit as a refusal event and not as a failure', async () => {
    requests.startFitting.mockRejectedValue(refusal('LIMIT_REACHED'));
    const { result } = renderHook(() => useStartSingleFitting(), { wrapper });
    await act(() =>
      result.current
        .mutateAsync({ photoId: PHOTO, productId: PRODUCT, source: 'picker' })
        .catch(() => undefined),
    );
    expect(track).toHaveBeenCalledExactlyOnceWith('Fitting Refused', {
      kind: 'single',
      reason: 'limit_reached',
    });
    expect(reportFailure).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(ApiError);
    });
  });

  it('reports any other failure and sends no refusal event', async () => {
    const failure = refusal('INTERNAL');
    requests.startFitting.mockRejectedValue(failure);
    const { result } = renderHook(() => useStartSingleFitting(), { wrapper });
    await act(() =>
      result.current
        .mutateAsync({ photoId: PHOTO, productId: PRODUCT, source: 'picker' })
        .catch(() => undefined),
    );
    expect(reportFailure).toHaveBeenCalledExactlyOnceWith(failure);
    expect(track).not.toHaveBeenCalled();
  });
});

describe('useStartLookFitting', () => {
  const OTHER = '00000000-0000-4000-8000-0000000000a2';

  it('sends a look of every item, a colour only where there is one, and the trimmed wishes', async () => {
    requests.startFitting.mockResolvedValue(started({ kind: 'look' }));
    const { result } = renderHook(() => useStartLookFitting(), { wrapper });
    await act(() =>
      result.current.mutateAsync({
        photoId: PHOTO,
        items: [
          { productId: PRODUCT, attributeValueId: COLOUR },
          { productId: OTHER, attributeValueId: null },
        ],
        promptText: '  Свободнее  ',
        source: 'picker',
      }),
    );
    expect(requests.startFitting).toHaveBeenCalledExactlyOnceWith({
      photoId: PHOTO,
      kind: 'look',
      items: [{ productId: PRODUCT, attributeValueId: COLOUR }, { productId: OTHER }],
      promptText: 'Свободнее',
    });
  });

  it.each([null, '', '   '])('leaves blank wishes (%j) out and tracks no prompt', async (text) => {
    requests.startFitting.mockResolvedValue(started({ kind: 'look' }));
    const { result } = renderHook(() => useStartLookFitting(), { wrapper });
    await act(() =>
      result.current.mutateAsync({
        photoId: PHOTO,
        items: [
          { productId: PRODUCT, attributeValueId: null },
          { productId: OTHER, attributeValueId: null },
        ],
        promptText: text,
        source: 'picker',
      }),
    );
    expect(requests.startFitting.mock.calls[0]?.[0]).not.toHaveProperty('promptText');
    expect(track).toHaveBeenCalledWith(
      'Fitting Started',
      expect.objectContaining({ with_prompt: false }),
    );
  });

  it('sends Fitting Started of a look with the source and the prompt', async () => {
    requests.startFitting.mockResolvedValue(started({ kind: 'look' }));
    const { result } = renderHook(() => useStartLookFitting(), { wrapper });
    await act(() =>
      result.current.mutateAsync({
        photoId: PHOTO,
        items: [
          { productId: PRODUCT, attributeValueId: COLOUR },
          { productId: OTHER, attributeValueId: null },
        ],
        promptText: 'Светлее',
        source: 'colour',
      }),
    );
    expect(track).toHaveBeenCalledWith(
      'Fitting Started',
      expect.objectContaining({ kind: 'look', source: 'colour', with_prompt: true }),
    );
    expect(client.getQueryData(fittingKeys.detail(FITTING))).toMatchObject({ kind: 'look' });
  });

  it('tracks a refused limit with the kind look and reports any other failure', async () => {
    const request = {
      photoId: PHOTO,
      items: [
        { productId: PRODUCT, attributeValueId: null },
        { productId: OTHER, attributeValueId: null },
      ],
      promptText: null,
      source: 'picker' as const,
    };
    requests.startFitting.mockRejectedValueOnce(refusal('LIMIT_REACHED'));
    const { result } = renderHook(() => useStartLookFitting(), { wrapper });
    await act(() => result.current.mutateAsync(request).catch(() => undefined));
    expect(track).toHaveBeenCalledExactlyOnceWith('Fitting Refused', {
      kind: 'look',
      reason: 'limit_reached',
    });
    expect(reportFailure).not.toHaveBeenCalled();

    const failure = refusal('INTERNAL');
    requests.startFitting.mockRejectedValueOnce(failure);
    await act(() => result.current.mutateAsync(request).catch(() => undefined));
    expect(reportFailure).toHaveBeenCalledExactlyOnceWith(failure);
    expect(requests.startFitting).toHaveBeenCalledTimes(2);
  });
});

describe('repeatBody', () => {
  const OTHER = '00000000-0000-4000-8000-0000000000a2';
  const item = (productId: string, attributeValueId: string | null) => ({
    productId,
    name: 'Рубашка',
    brand: 'Annen',
    imageUrl: null,
    price: 1000,
    finalPrice: 900,
    attributeValueId,
    colour: null,
    slot: null,
  });

  it('is null once the photo is gone', () => {
    expect(
      repeatBody({
        kind: 'single',
        photoId: null,
        items: [item(PRODUCT, COLOUR)],
        promptText: null,
      }),
    ).toBeNull();
  });

  it('sends the photo, the kind and each item with its colour only where it has one', () => {
    expect(
      repeatBody({
        kind: 'look',
        photoId: PHOTO,
        items: [item(PRODUCT, COLOUR), item(OTHER, null)],
        promptText: null,
      }),
    ).toEqual({
      photoId: PHOTO,
      kind: 'look',
      items: [{ productId: PRODUCT, attributeValueId: COLOUR }, { productId: OTHER }],
    });
  });

  it('sends the wishes trimmed', () => {
    expect(
      repeatBody({
        kind: 'single',
        photoId: PHOTO,
        items: [item(PRODUCT, null)],
        promptText: '  Свободнее ',
      }),
    ).toHaveProperty('promptText', 'Свободнее');
  });

  it.each([null, '', '   '])('leaves blank wishes (%j) out', (promptText) => {
    expect(
      repeatBody({ kind: 'single', photoId: PHOTO, items: [item(PRODUCT, null)], promptText }),
    ).not.toHaveProperty('promptText');
  });
});

describe('useRepeatFitting', () => {
  const body = {
    photoId: PHOTO,
    kind: 'single' as const,
    items: [{ productId: PRODUCT, attributeValueId: COLOUR }],
  };

  it('starts the body as it is and tracks a start from the history', async () => {
    requests.startFitting.mockResolvedValue(started());
    const { result } = renderHook(() => useRepeatFitting(), { wrapper });
    await act(() => result.current.mutateAsync(body));
    expect(requests.startFitting).toHaveBeenCalledExactlyOnceWith(body);
    expect(track).toHaveBeenCalledExactlyOnceWith('Fitting Started', {
      kind: 'single',
      source: 'history',
      items: 0,
      repeated: false,
      with_prompt: false,
    });
  });

  it('tracks the wishes of the body', async () => {
    requests.startFitting.mockResolvedValue(started());
    const { result } = renderHook(() => useRepeatFitting(), { wrapper });
    await act(() => result.current.mutateAsync({ ...body, promptText: 'Светлее' }));
    expect(track).toHaveBeenCalledWith(
      'Fitting Started',
      expect.objectContaining({ with_prompt: true }),
    );
  });

  it('sends the repeated result as completed at once, spending nothing', async () => {
    requests.startFitting.mockResolvedValue(started({ status: 'completed', repeated: true }));
    const { result } = renderHook(() => useRepeatFitting(), { wrapper });
    await act(() => result.current.mutateAsync(body));
    expect(track).toHaveBeenCalledWith(
      'Fitting Started',
      expect.objectContaining({ repeated: true, source: 'history' }),
    );
    expect(track).toHaveBeenCalledWith(
      'Fitting Completed',
      expect.objectContaining({ repeated: true, duration: 0, counts_against_limit: false }),
    );
  });

  it('puts the answer into its entry and reads the quota and lists again', async () => {
    requests.startFitting.mockResolvedValue(started({ repeated: true }));
    client.setQueryData(fittingKeys.quota, { limit: 20, used: 0, left: 20 });
    const { result } = renderHook(() => useRepeatFitting(), { wrapper });
    await act(() => result.current.mutateAsync(body));
    expect(client.getQueryData(fittingKeys.detail(FITTING))).not.toHaveProperty('repeated');
    expect(client.getQueryState(fittingKeys.quota)?.isInvalidated).toBe(true);
  });

  it('tracks a refused limit with the kind of the body, and does not retry', async () => {
    requests.startFitting.mockRejectedValue(refusal('LIMIT_REACHED'));
    const { result } = renderHook(() => useRepeatFitting(), { wrapper });
    await act(() => result.current.mutateAsync({ ...body, kind: 'look' }).catch(() => undefined));
    expect(track).toHaveBeenCalledExactlyOnceWith('Fitting Refused', {
      kind: 'look',
      reason: 'limit_reached',
    });
    expect(reportFailure).not.toHaveBeenCalled();
    expect(requests.startFitting).toHaveBeenCalledTimes(1);
  });

  it('reports any other failure', async () => {
    const failure = refusal('INTERNAL');
    requests.startFitting.mockRejectedValue(failure);
    const { result } = renderHook(() => useRepeatFitting(), { wrapper });
    await act(() => result.current.mutateAsync(body).catch(() => undefined));
    expect(reportFailure).toHaveBeenCalledExactlyOnceWith(failure);
  });
});

describe('useRegenerateFitting', () => {
  const PARENT = '00000000-0000-4000-8000-0000000000b1';

  it('sends the comment alone', async () => {
    requests.regenerateFitting.mockResolvedValue(started({ parentId: PARENT }));
    const { result } = renderHook(() => useRegenerateFitting(), { wrapper });
    await act(() =>
      result.current.mutateAsync({
        parentId: PARENT,
        kind: 'single',
        comment: 'Светлее',
        source: 'regenerate',
      }),
    );
    expect(requests.regenerateFitting).toHaveBeenCalledExactlyOnceWith(PARENT, {
      comment: 'Светлее',
    });
    expect(track).toHaveBeenCalledWith(
      'Fitting Started',
      expect.objectContaining({ source: 'regenerate', with_prompt: true }),
    );
  });

  it('sends an empty body when the comment is blank', async () => {
    requests.regenerateFitting.mockResolvedValue(started({ parentId: PARENT }));
    const { result } = renderHook(() => useRegenerateFitting(), { wrapper });
    await act(() =>
      result.current.mutateAsync({
        parentId: PARENT,
        kind: 'single',
        comment: '',
        source: 'regenerate',
      }),
    );
    expect(requests.regenerateFitting).toHaveBeenCalledWith(PARENT, {});
    expect(track).toHaveBeenCalledWith(
      'Fitting Started',
      expect.objectContaining({ with_prompt: false }),
    );
  });

  it('stores the new fitting and does not retry a failure', async () => {
    requests.regenerateFitting.mockResolvedValueOnce(started({ parentId: PARENT }));
    const { result } = renderHook(() => useRegenerateFitting(), { wrapper });
    await act(() =>
      result.current.mutateAsync({
        parentId: PARENT,
        kind: 'single',
        source: 'regenerate',
      }),
    );
    expect(client.getQueryData(fittingKeys.detail(FITTING))).toMatchObject({ parentId: PARENT });

    requests.regenerateFitting.mockRejectedValue(new Error('x'));
    await act(() =>
      result.current
        .mutateAsync({
          parentId: PARENT,
          kind: 'single',
          source: 'regenerate',
        })
        .catch(() => undefined),
    );
    expect(requests.regenerateFitting).toHaveBeenCalledTimes(2);
  });

  it('sends Fitting Refused with the kind of the result for a refused comment', async () => {
    requests.regenerateFitting.mockRejectedValue(refusal('PROMPT_REFUSED'));
    const { result } = renderHook(() => useRegenerateFitting(), { wrapper });
    await act(() =>
      result.current
        .mutateAsync({
          parentId: PARENT,
          kind: 'look',
          comment: 'плохо',
          source: 'regenerate',
        })
        .catch(() => undefined),
    );
    expect(track).toHaveBeenCalledExactlyOnceWith('Fitting Refused', {
      kind: 'look',
      reason: 'prompt_refused',
      prompt_reason: 'off_topic',
    });
    expect(reportFailure).not.toHaveBeenCalled();
  });

  it('tracks the retry of a failed regeneration with the retry source', async () => {
    requests.regenerateFitting.mockResolvedValue(started({ parentId: PARENT }));
    const { result } = renderHook(() => useRegenerateFitting(), { wrapper });
    await act(() =>
      result.current.mutateAsync({
        parentId: PARENT,
        kind: 'single',
        source: 'retry',
      }),
    );
    expect(track).toHaveBeenCalledWith(
      'Fitting Started',
      expect.objectContaining({ source: 'retry', with_prompt: false }),
    );
  });
});

function failure(
  kind: 'network' | 'timeout' | 'http' | 'schema',
  status?: number,
  code?: string,
): ApiError {
  return new ApiError('failed', {
    kind,
    template: '/fittings',
    method: 'POST',
    ...(status === undefined ? {} : { status }),
    ...(code ? { code } : {}),
  });
}

interface StartCase {
  name: string;
  kind: 'single' | 'look';
  source: 'picker' | 'regenerate' | 'history';
  request: ReturnType<typeof vi.fn>;
  useSend: () => () => Promise<unknown>;
}

const START_CASES: StartCase[] = [
  {
    name: 'useStartSingleFitting',
    kind: 'single',
    source: 'picker',
    request: requests.startFitting,
    useSend: () => {
      const mutation = useStartSingleFitting();
      return () => mutation.mutateAsync({ photoId: PHOTO, productId: PRODUCT, source: 'picker' });
    },
  },
  {
    name: 'useStartLookFitting',
    kind: 'look',
    source: 'picker',
    request: requests.startFitting,
    useSend: () => {
      const mutation = useStartLookFitting();
      return () =>
        mutation.mutateAsync({
          photoId: PHOTO,
          items: [
            { productId: PRODUCT, attributeValueId: COLOUR },
            { productId: '00000000-0000-4000-8000-0000000000a2', attributeValueId: null },
          ],
          promptText: null,
          source: 'picker',
        });
    },
  },
  {
    name: 'useRepeatFitting',
    kind: 'single',
    source: 'history',
    request: requests.startFitting,
    useSend: () => {
      const mutation = useRepeatFitting();
      return () =>
        mutation.mutateAsync({
          photoId: PHOTO,
          kind: 'single',
          items: [{ productId: PRODUCT }],
        });
    },
  },
  {
    name: 'useRegenerateFitting',
    kind: 'single',
    source: 'regenerate',
    request: requests.regenerateFitting,
    useSend: () => {
      const mutation = useRegenerateFitting();
      return () =>
        mutation.mutateAsync({
          parentId: '00000000-0000-4000-8000-0000000000b1',
          kind: 'single',
          source: 'regenerate',
        });
    },
  },
];

describe.each(START_CASES)('the silent retry of $name', (start) => {
  const retried = 'Fitting Start Retried';

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Sends once and lets `ms` of fake time pass; resolves with the settled outcome.
  async function sendAndWait(send: () => Promise<unknown>, ms: number) {
    let settled: Promise<unknown> = Promise.resolve();
    await act(async () => {
      settled = send().then(
        () => 'ok',
        () => 'error',
      );
      await vi.advanceTimersByTimeAsync(ms);
    });
    return act(() => settled);
  }

  it.each([
    ['a network error', failure('network'), 'network'],
    ['a timeout', failure('timeout'), 'timeout'],
    ['a 502', failure('http', 502), 'server'],
    ['a 503', failure('http', 503), 'server'],
    ['a 504', failure('http', 504), 'server'],
  ])(
    'sends again once, 1.5 s later, after %s, and goes on when it succeeds',
    async (_n, error, cause) => {
      start.request
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(started({ kind: start.kind }));
      const { result } = renderHook(() => start.useSend(), { wrapper });

      let settled: Promise<unknown> = Promise.resolve();
      await act(async () => {
        settled = result.current().then(
          () => 'ok',
          () => 'error',
        );
        await vi.advanceTimersByTimeAsync(1499);
      });
      expect(start.request).toHaveBeenCalledTimes(1);
      expect(reportFailure).not.toHaveBeenCalled();
      expect(track).not.toHaveBeenCalled();

      await act(() => vi.advanceTimersByTimeAsync(1));
      expect(await act(() => settled)).toBe('ok');

      expect(start.request).toHaveBeenCalledTimes(2);
      expect(reportFailure).not.toHaveBeenCalled();
      expect(track).toHaveBeenCalledWith(
        'Fitting Started',
        expect.objectContaining({ kind: start.kind, source: start.source }),
      );
      expect(track).toHaveBeenCalledWith(retried, {
        kind: start.kind,
        source: start.source,
        cause,
        outcome: 'started',
      });
      expect(client.getQueryData(fittingKeys.detail(FITTING))).toMatchObject({ id: FITTING });
    },
  );

  it('shows the error after a second failure, sends only twice and names the first cause', async () => {
    const last = failure('http', 503);
    start.request.mockRejectedValueOnce(failure('network')).mockRejectedValueOnce(last);
    const { result } = renderHook(() => start.useSend(), { wrapper });

    expect(await sendAndWait(result.current, 1500)).toBe('error');
    await act(() => vi.advanceTimersByTimeAsync(10_000));

    expect(start.request).toHaveBeenCalledTimes(2);
    expect(reportFailure).toHaveBeenCalledExactlyOnceWith(last);
    expect(track).toHaveBeenCalledExactlyOnceWith(retried, {
      kind: start.kind,
      source: start.source,
      cause: 'network',
      outcome: 'failed',
    });
  });

  it('counts a repeat that ends in the limit as refused', async () => {
    start.request
      .mockRejectedValueOnce(failure('http', 503))
      .mockRejectedValueOnce(failure('http', 409, 'LIMIT_REACHED'));
    const { result } = renderHook(() => start.useSend(), { wrapper });

    expect(await sendAndWait(result.current, 1500)).toBe('error');

    expect(start.request).toHaveBeenCalledTimes(2);
    expect(reportFailure).not.toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith('Fitting Refused', {
      kind: start.kind,
      reason: 'limit_reached',
    });
    expect(track).toHaveBeenCalledWith(retried, {
      kind: start.kind,
      source: start.source,
      cause: 'server',
      outcome: 'refused',
    });
  });

  it.each([
    ['a 400', failure('http', 400)],
    ['a 401', failure('http', 401)],
    ['a 409', failure('http', 409, 'LIMIT_REACHED')],
    ['a 429', failure('http', 429)],
    ['a bare 500', failure('http', 500)],
    ['a wrong answer', failure('schema')],
    ['a plain error', new Error('x')],
  ])('does not send again after %s', async (_n, error) => {
    start.request.mockRejectedValue(error);
    const { result } = renderHook(() => start.useSend(), { wrapper });

    expect(await sendAndWait(result.current, 5000)).toBe('error');

    expect(start.request).toHaveBeenCalledTimes(1);
    expect(track).not.toHaveBeenCalledWith(retried, expect.anything());
  });

  it('sends no retry event when the first try succeeds', async () => {
    start.request.mockResolvedValue(started());
    const { result } = renderHook(() => start.useSend(), { wrapper });

    expect(await sendAndWait(result.current, 5000)).toBe('ok');

    expect(start.request).toHaveBeenCalledTimes(1);
    expect(track).not.toHaveBeenCalledWith(retried, expect.anything());
  });

  it('retries a second send of the same hook afresh', async () => {
    start.request
      .mockRejectedValueOnce(failure('network'))
      .mockResolvedValueOnce(started())
      .mockResolvedValueOnce(started());
    const { result } = renderHook(() => start.useSend(), { wrapper });

    expect(await sendAndWait(result.current, 1500)).toBe('ok');
    track.mockClear();
    expect(await sendAndWait(result.current, 1500)).toBe('ok');

    expect(start.request).toHaveBeenCalledTimes(3);
    expect(track).not.toHaveBeenCalledWith(retried, expect.anything());
  });
});

describe.each(START_CASES)('the silent retry of $name, edge cases', (start) => {
  const retried = 'Fitting Start Retried';

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    onlineManager.setOnline(true);
    vi.useRealTimers();
  });

  it.each([
    ['before the start', true],
    ['after the first failure', false],
  ])('still sends again and ends in error when offline %s', async (_n, offlineFirst) => {
    const last = failure('network');
    start.request.mockImplementationOnce(() => {
      if (!offlineFirst) onlineManager.setOnline(false);
      return Promise.reject(failure('network'));
    });
    start.request.mockRejectedValueOnce(last);
    if (offlineFirst) onlineManager.setOnline(false);
    const { result } = renderHook(() => start.useSend(), { wrapper });

    let settled: Promise<unknown> = Promise.resolve();
    await act(async () => {
      settled = result.current().then(
        () => 'ok',
        () => 'error',
      );
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(await act(() => settled)).toBe('error');

    expect(start.request).toHaveBeenCalledTimes(2);
    expect(reportFailure).toHaveBeenCalledExactlyOnceWith(last);
    expect(track).toHaveBeenCalledExactlyOnceWith(retried, {
      kind: start.kind,
      source: start.source,
      cause: 'network',
      outcome: 'failed',
    });
  });

  it('sends again after the hook is unmounted and reports once', async () => {
    const last = failure('http', 503);
    start.request.mockRejectedValueOnce(failure('network')).mockRejectedValueOnce(last);
    const { result, unmount } = renderHook(() => start.useSend(), { wrapper });

    await act(async () => {
      void result.current().catch(() => undefined);
      await vi.advanceTimersByTimeAsync(100);
    });
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(10_000));

    expect(start.request).toHaveBeenCalledTimes(2);
    expect(reportFailure).toHaveBeenCalledExactlyOnceWith(last);
    expect(track.mock.calls.filter(([name]) => name === retried)).toEqual([
      [retried, { kind: start.kind, source: start.source, cause: 'network', outcome: 'failed' }],
    ]);
  });

  it('gives each of two overlapping sends its own cause', async () => {
    const answers = [
      () => Promise.reject(failure('network')),
      () => Promise.reject(failure('http', 503)),
      () => Promise.resolve(started({ kind: start.kind })),
      () => Promise.resolve(started({ kind: start.kind })),
    ];
    start.request.mockImplementation(
      () => answers.shift()?.() ?? Promise.reject(new Error('extra')),
    );
    const { result } = renderHook(() => start.useSend(), { wrapper });

    const settled: Promise<unknown>[] = [];
    await act(async () => {
      settled.push(result.current().catch(() => undefined));
      settled.push(result.current().catch(() => undefined));
      await vi.advanceTimersByTimeAsync(1500);
      await Promise.all(settled);
    });

    expect(start.request).toHaveBeenCalledTimes(4);
    const causes = track.mock.calls
      .filter(([name]) => name === retried)
      .map(([, props]) => props as { cause: string; outcome: string });
    expect(causes).toHaveLength(2);
    expect(causes.map((p) => p.cause).sort()).toEqual(['network', 'server']);
    expect(causes.every((p) => p.outcome === 'started')).toBe(true);
  });
});
