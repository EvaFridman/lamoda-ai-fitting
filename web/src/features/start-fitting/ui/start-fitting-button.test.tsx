import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ track: vi.fn(), captureException: vi.fn() }));
vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  reset: vi.fn(),
  track: mocks.track,
}));
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }));

import { StartFittingButton, type StartFittingButtonProps } from './start-fitting-button';

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
