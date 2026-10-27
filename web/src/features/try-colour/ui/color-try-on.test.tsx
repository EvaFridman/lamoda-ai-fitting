import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Fitting } from '@/entities/fitting';

const mocks = vi.hoisted(() => ({ track: vi.fn(), captureException: vi.fn() }));
vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  reset: vi.fn(),
  track: mocks.track,
}));
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }));

import { ColorTryOn, type ColorTryOnProps, type TryColour } from './color-try-on';

const PHOTO = '00000000-0000-4000-8000-0000000000f1';
const PRODUCT = '00000000-0000-4000-8000-0000000000a1';
const RED = '00000000-0000-4000-8000-0000000000c1';
const BLUE = '00000000-0000-4000-8000-0000000000c2';
const GREEN = '00000000-0000-4000-8000-0000000000c3';

const COLOURS: TryColour[] = [
  { id: RED, value: 'Красный', colorHex: '#FF0000' },
  { id: BLUE, value: 'Синий', colorHex: '#0000FF' },
  { id: GREEN, value: 'Зелёный', colorHex: '#00FF00' },
];

const fetchMock = vi.fn();

function fitting(patch: Partial<Fitting> = {}): Fitting {
  return {
    id: '00000000-0000-4000-8000-0000000000e1',
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
        name: 'Dress',
        brand: 'B',
        imageUrl: null,
        price: 1,
        finalPrice: 1,
        attributeValueId: RED,
        colour: 'Красный',
        slot: 'top',
      },
    ],
    promptText: null,
    photoId: PHOTO,
    resultUrl: 'https://s3.test/r.webp',
    createdAt: '2026-10-20T12:00:00.000Z',
    startedAt: null,
    finishedAt: '2026-10-20T12:00:20.000Z',
    estimatedSeconds: null,
    ...patch,
  };
}

function startedBody() {
  return {
    ...fitting({ status: 'pending', stage: 'queued', finishedAt: null }),
    id: '00000000-0000-4000-8000-0000000000e2',
    repeated: false,
  };
}

function answer(status: number, body: unknown) {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status }));
}

function failure(status: number, code: string) {
  return answer(status, { error: { code, message: 'm', details: [] } });
}

function renderColours(props: Partial<ColorTryOnProps> = {}) {
  const handlers = { onStarted: vi.fn(), onLimit: vi.fn() };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ColorTryOn
        fitting={fitting()}
        colours={COLOURS}
        tried={new Set()}
        {...handlers}
        {...props}
      />
    </QueryClientProvider>,
  );
  return handlers;
}

// A tried colour's name is led by the tick's «Уже примерено».
const tile = (name: string) => screen.getByRole('button', { name: new RegExp(`(^| )${name}$`) });

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('ColorTryOn', () => {
  it('shows a pressed, off tile for the current colour and the others ready', () => {
    renderColours();

    expect(screen.getByRole('heading', { name: 'Примерить другой цвет' })).toBeInTheDocument();
    expect(tile('Красный')).toHaveAttribute('aria-pressed', 'true');
    expect(tile('Красный')).toBeDisabled();
    expect(tile('Синий')).toHaveAttribute('aria-pressed', 'false');
    expect(tile('Синий')).toBeEnabled();
    expect(screen.getByText(/Новый цвет — 1 примерка/)).toBeInTheDocument();
  });

  it.each([
    ['one colour', COLOURS.slice(0, 1)],
    ['no colours', []],
  ])('shows nothing with %s', (_name, colours) => {
    renderColours({ colours });

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('shows nothing when the photo is gone', () => {
    renderColours({ fitting: fitting({ photoId: null }) });

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('shows nothing for a fitting with no item', () => {
    renderColours({ fitting: fitting({ items: [] }) });

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('ticks a colour tried before, but not the current one', () => {
    renderColours({ tried: new Set([RED, BLUE]) });

    expect(screen.getAllByTitle('Уже примерено')).toHaveLength(1);
    expect(tile('Синий')).toContainElement(screen.getByTitle('Уже примерено'));
  });

  it('tries a colour on the same photo, with the colour of the tile, and passes the answer on (AC7)', async () => {
    fetchMock.mockImplementation(answer(201, startedBody()));
    const { onStarted } = renderColours();

    await userEvent.setup().click(tile('Синий'));

    await vi.waitFor(() => expect(onStarted).toHaveBeenCalledTimes(1));
    expect(onStarted.mock.calls[0]?.[1]).toEqual(COLOURS[1]);
    const [, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      photoId: PHOTO,
      kind: 'single',
      items: [{ productId: PRODUCT, attributeValueId: BLUE }],
    });
    expect(mocks.track).toHaveBeenCalledWith(
      'Fitting Started',
      expect.objectContaining({ source: 'colour' }),
    );
  });

  it('tracks the click with whether the colour was tried', async () => {
    fetchMock.mockImplementation(answer(201, startedBody()));
    renderColours({ tried: new Set([GREEN]) });
    const user = userEvent.setup();

    await user.click(tile('Зелёный'));
    await user.click(tile('Синий'));

    const clicks = mocks.track.mock.calls.filter(([event]) => event === 'Element Clicked');
    expect(clicks.map(([, props]) => props)).toEqual([
      expect.objectContaining({ element: 'result.try-colour', tried: true }),
      expect.objectContaining({ element: 'result.try-colour', tried: false }),
    ]);
  });

  it('turns the other colours off and says so while one is on its way', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    renderColours();

    await userEvent.setup().click(tile('Синий'));

    await vi.waitFor(() => expect(tile('Зелёный')).toBeDisabled());
    expect(tile('Синий')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText('Пока идёт примерка, другие цвета недоступны')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('turns the others off while the page runs a colour (board 7.2)', () => {
    renderColours({ generating: BLUE });

    expect(tile('Синий')).toHaveAttribute('aria-busy', 'true');
    expect(tile('Зелёный')).toBeDisabled();
    expect(tile('Красный')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Пока идёт примерка, другие цвета недоступны')).toBeInTheDocument();
  });

  it('calls onLimit for the month’s limit and shows no error text', async () => {
    fetchMock.mockImplementation(failure(409, 'LIMIT_REACHED'));
    const { onLimit, onStarted } = renderColours();

    await userEvent.setup().click(tile('Синий'));

    await vi.waitFor(() => expect(onLimit).toHaveBeenCalledTimes(1));
    expect(onStarted).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the reason of a refused wish and lets the colour be tried again', async () => {
    fetchMock.mockImplementation(
      answer(400, {
        error: {
          code: 'PROMPT_REFUSED',
          message: 'm',
          details: [
            {
              field: 'promptText',
              code: 'PROMPT_REFUSED',
              message: 'promptText was refused: minors',
            },
          ],
        },
      }),
    );
    const { onLimit, onStarted } = renderColours();

    await userEvent.setup().click(tile('Синий'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Пожелание не может касаться детей');
    expect(onLimit).not.toHaveBeenCalled();
    expect(onStarted).not.toHaveBeenCalled();
    expect(tile('Синий')).toBeEnabled();
  });

  it('shows the text of any other failure and lets the colour be tried again', async () => {
    fetchMock.mockImplementation(failure(503, 'SERVICE_UNAVAILABLE'));
    const { onLimit } = renderColours();

    await userEvent.setup().click(tile('Синий'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Сервис временно недоступен, попробуйте позже',
    );
    expect(onLimit).not.toHaveBeenCalled();
    expect(tile('Синий')).toBeEnabled();
  });
});
