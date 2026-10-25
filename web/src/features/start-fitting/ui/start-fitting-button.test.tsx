import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ track: vi.fn(), captureException: vi.fn() }));
vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  reset: vi.fn(),
  track: mocks.track,
}));
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }));

import {
  StartFittingButton,
  type StartFittingButtonProps,
  StartLookButton,
  type StartLookButtonProps,
} from './start-fitting-button';

const PHOTO = '00000000-0000-4000-8000-0000000000f1';
const PRODUCT = '00000000-0000-4000-8000-0000000000a1';
const COLOUR = '00000000-0000-4000-8000-0000000000c1';
const FITTING = '00000000-0000-4000-8000-0000000000e1';

const fetchMock = vi.fn();

function startedBody() {
  return {
    id: FITTING,
    kind: 'single',
    parentId: null,
    status: 'pending',
    stage: 'queued',
    failureCode: null,
    countsAgainstLimit: true,
    regenerationFree: true,
    model: 'gpt-image-2',
    items: [],
    promptText: null,
    photoId: PHOTO,
    resultUrl: null,
    createdAt: '2026-10-20T12:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    estimatedSeconds: 25,
    repeated: false,
  };
}

function answer(status: number, body: unknown) {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status }));
}

function failure(status: number, code: string) {
  return answer(status, { error: { code, message: 'm', details: [] } });
}

function renderButton(props: Partial<StartFittingButtonProps> = {}) {
  const handlers = { onStarted: vi.fn(), onLimit: vi.fn(), onError: vi.fn() };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <StartFittingButton photoId={PHOTO} productId={PRODUCT} {...handlers} {...props} />
    </QueryClientProvider>,
  );
  return handlers;
}

const button = () => screen.getByRole('button', { name: /Примерить/ });

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('StartFittingButton', () => {
  it('starts a single fitting of the photo and the product, and passes the answer on', async () => {
    fetchMock.mockImplementation(answer(201, startedBody()));
    const { onStarted, onError } = renderButton({ attributeValueId: COLOUR });

    await userEvent.setup().click(button());

    await vi.waitFor(() => expect(onStarted).toHaveBeenCalledTimes(1));
    expect(onStarted.mock.calls[0]?.[0]).toMatchObject({ id: FITTING, repeated: false });
    const [url, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
    expect(new URL(String(url)).pathname).toBe('/api/fittings');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      photoId: PHOTO,
      kind: 'single',
      items: [{ productId: PRODUCT, attributeValueId: COLOUR }],
    });
    expect(onError).toHaveBeenCalledWith(null);
  });

  it('starts one fitting when it is clicked twice at once (AC12)', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    renderButton();
    const user = userEvent.setup();

    await user.dblClick(button());
    await user.click(button());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(button()).toHaveAttribute('aria-busy', 'true');
  });

  it('sends one POST for two clicks in the same tick and reports the first answer (AC12)', async () => {
    fetchMock
      .mockImplementationOnce(answer(201, startedBody()))
      .mockImplementation(failure(429, 'TOO_MANY_REQUESTS'));
    const { onStarted, onError, onLimit } = renderButton();

    act(() => {
      fireEvent.click(button());
      fireEvent.click(button());
    });

    await vi.waitFor(() => expect(onStarted).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onStarted.mock.calls[0]?.[0]).toMatchObject({ id: FITTING });
    expect(onError).not.toHaveBeenCalledWith(expect.any(String));
    expect(onLimit).not.toHaveBeenCalled();
  });

  it('is busy while the request runs and ready again after a failure', async () => {
    let finish: (response: Response) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    renderButton();

    await userEvent.setup().click(button());
    await vi.waitFor(() => expect(button()).toHaveAttribute('aria-busy', 'true'));

    finish(await failure(503, 'SERVICE_UNAVAILABLE')());
    await vi.waitFor(() => expect(button()).not.toHaveAttribute('aria-busy'));
  });

  it('is off while no photo is chosen and sends nothing', async () => {
    renderButton({ photoId: null });

    expect(button()).toBeDisabled();
    await userEvent.setup().click(button());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is off when disabled', () => {
    renderButton({ disabled: true });

    expect(button()).toBeDisabled();
  });

  it('calls onLimit and no error for the month’s limit (AC19)', async () => {
    fetchMock.mockImplementation(failure(409, 'LIMIT_REACHED'));
    const { onLimit, onStarted, onError } = renderButton();

    await userEvent.setup().click(button());

    await vi.waitFor(() => expect(onLimit).toHaveBeenCalledTimes(1));
    expect(onStarted).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(null);
    expect(mocks.track).toHaveBeenCalledWith('Fitting Refused', {
      kind: 'single',
      reason: 'limit_reached',
    });
  });

  it('passes the Russian text of any other failure to onError', async () => {
    fetchMock.mockImplementation(failure(503, 'SERVICE_UNAVAILABLE'));
    const { onLimit, onError } = renderButton();

    await userEvent.setup().click(button());

    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(2));
    expect(onError).toHaveBeenLastCalledWith('Сервис временно недоступен, попробуйте позже');
    expect(onLimit).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('tracks the click of the start element', async () => {
    fetchMock.mockImplementation(answer(201, startedBody()));
    renderButton();

    await userEvent.setup().click(button());

    expect(mocks.track).toHaveBeenCalledWith(
      'Element Clicked',
      expect.objectContaining({ element: 'try-on.start' }),
    );
  });
});

describe('StartLookButton', () => {
  const SHIRT = '00000000-0000-4000-8000-0000000000a2';
  const ITEMS = [
    { productId: PRODUCT, attributeValueId: COLOUR },
    { productId: SHIRT, attributeValueId: null },
  ];

  function renderLook(props: Partial<StartLookButtonProps> = {}) {
    const handlers = { onStarted: vi.fn(), onLimit: vi.fn(), onError: vi.fn() };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <StartLookButton photoId={PHOTO} items={ITEMS} promptText="" {...handlers} {...props} />
      </QueryClientProvider>,
    );
    return handlers;
  }

  const lookButton = () => screen.getByRole('button', { name: /Примерить образ/ });

  it('starts a look of the photo, the items in their colours and the wishes (AC14)', async () => {
    fetchMock.mockImplementation(answer(201, { ...startedBody(), kind: 'look' }));
    const { onStarted, onError } = renderLook({ promptText: ' Свободнее ' });

    await userEvent.setup().click(lookButton());

    await vi.waitFor(() => expect(onStarted).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
    expect(new URL(String(url)).pathname).toBe('/api/fittings');
    expect(JSON.parse(String(init.body))).toEqual({
      photoId: PHOTO,
      kind: 'look',
      items: [{ productId: PRODUCT, attributeValueId: COLOUR }, { productId: SHIRT }],
      promptText: 'Свободнее',
    });
    expect(onError).toHaveBeenCalledWith(null);
  });

  it('sends no wishes when they are blank', async () => {
    fetchMock.mockImplementation(answer(201, { ...startedBody(), kind: 'look' }));
    renderLook({ promptText: '   ' });

    await userEvent.setup().click(lookButton());

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
    expect(JSON.parse(String(init.body))).not.toHaveProperty('promptText');
  });

  it('is off without a photo and sends nothing', async () => {
    renderLook({ photoId: null });

    expect(lookButton()).toBeDisabled();
    await userEvent.setup().click(lookButton());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is off with one item', () => {
    renderLook({ items: ITEMS.slice(0, 1) });

    expect(lookButton()).toBeDisabled();
  });

  it('is off when disabled', () => {
    renderLook({ disabled: true });

    expect(lookButton()).toBeDisabled();
  });

  it('is busy while the request runs and starts one look when clicked twice (AC12)', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    renderLook();
    const user = userEvent.setup();

    await user.dblClick(lookButton());
    await user.click(lookButton());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lookButton()).toHaveAttribute('aria-busy', 'true');
  });

  it('sends one POST for two clicks in the same tick and reports the first answer (AC12)', async () => {
    fetchMock
      .mockImplementationOnce(answer(201, { ...startedBody(), kind: 'look' }))
      .mockImplementation(failure(429, 'TOO_MANY_REQUESTS'));
    const { onStarted, onError, onLimit } = renderLook();

    act(() => {
      fireEvent.click(lookButton());
      fireEvent.click(lookButton());
    });

    await vi.waitFor(() => expect(onStarted).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onStarted.mock.calls[0]?.[0]).toMatchObject({ id: FITTING });
    expect(onError).not.toHaveBeenCalledWith(expect.any(String));
    expect(onLimit).not.toHaveBeenCalled();
  });

  it('calls onLimit at the month’s limit and tracks the refusal of a look', async () => {
    fetchMock.mockImplementation(failure(409, 'LIMIT_REACHED'));
    const { onLimit, onStarted } = renderLook();

    await userEvent.setup().click(lookButton());

    await vi.waitFor(() => expect(onLimit).toHaveBeenCalledTimes(1));
    expect(onStarted).not.toHaveBeenCalled();
    expect(mocks.track).toHaveBeenCalledWith('Fitting Refused', {
      kind: 'look',
      reason: 'limit_reached',
    });
  });

  it('passes the Russian text of any other failure to onError', async () => {
    fetchMock.mockImplementation(failure(503, 'SERVICE_UNAVAILABLE'));
    const { onLimit, onError } = renderLook();

    await userEvent.setup().click(lookButton());

    await vi.waitFor(() =>
      expect(onError).toHaveBeenLastCalledWith('Сервис временно недоступен, попробуйте позже'),
    );
    expect(onLimit).not.toHaveBeenCalled();
  });
});
