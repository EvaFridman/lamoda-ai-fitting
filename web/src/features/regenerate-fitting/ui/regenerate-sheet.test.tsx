import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Fitting } from '@/entities/fitting';

const mocks = vi.hoisted(() => ({ track: vi.fn(), captureException: vi.fn() }));
vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  reset: vi.fn(),
  track: mocks.track,
}));
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }));

import {
  commentWithItem,
  MAX_COMMENT_LENGTH,
  RegenerateSheet,
  type RegenerateSheetProps,
} from './regenerate-sheet';

const PARENT = '00000000-0000-4000-8000-0000000000e1';
const fetchMock = vi.fn();

function fitting(patch: Partial<Fitting> = {}): Fitting {
  return {
    id: PARENT,
    kind: 'single',
    parentId: null,
    status: 'completed',
    stage: 'done',
    failureCode: null,
    countsAgainstLimit: true,
    regenerationFree: true,
    model: 'gpt-image-2',
    items: [],
    promptText: null,
    photoId: null,
    resultUrl: null,
    createdAt: '2026-10-20T12:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    estimatedSeconds: null,
    ...patch,
  };
}

function startedBody() {
  return {
    ...fitting({ status: 'pending', stage: 'queued' }),
    id: '00000000-0000-4000-8000-0000000000e2',
    parentId: PARENT,
    repeated: false,
  };
}

function answer(status: number, body: unknown) {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status }));
}

function failure(status: number, code: string) {
  return answer(status, { error: { code, message: 'm', details: [] } });
}

function renderSheet(props: Partial<RegenerateSheetProps> = {}) {
  const handlers = { onOpenChange: vi.fn(), onStarted: vi.fn(), onLimit: vi.fn() };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RegenerateSheet fitting={fitting()} open {...handlers} {...props} />
    </QueryClientProvider>,
  );
  return handlers;
}

// Base UI turns pointer events off on the page while a modal is open.
const setup = () => userEvent.setup({ pointerEventsCheck: 0 });
const submit = () => screen.getByRole('button', { name: /Перегенерировать/ });

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RegenerateSheet', () => {
  it('asks what to change with the five reasons, a comment field and the button off', async () => {
    renderSheet();

    expect(await screen.findByRole('dialog', { name: 'Что поменять?' })).toBeInTheDocument();
    for (const reason of ['Лицо', 'Фигура', 'Вещь', 'Фон', 'Другое']) {
      expect(screen.getByRole('button', { name: reason })).toHaveAttribute('aria-pressed', 'false');
    }
    expect(screen.getByLabelText('Комментарий, по желанию')).toHaveValue('');
    expect(screen.getByText('0 / 300')).toBeInTheDocument();
    expect(submit()).toBeDisabled();
  });

  it('turns the button on from the first reason and off again when it is unchecked', async () => {
    const user = setup();
    renderSheet();

    await user.click(await screen.findByRole('button', { name: 'Лицо' }));
    expect(screen.getByRole('button', { name: 'Лицо' })).toHaveAttribute('aria-pressed', 'true');
    expect(submit()).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Лицо' }));
    expect(submit()).toBeDisabled();
  });

  it('says the first regeneration is free', async () => {
    renderSheet({ fitting: fitting({ regenerationFree: true }) });

    expect(
      await screen.findByText(/Первая перегенерация не списывает примерку/),
    ).toBeInTheDocument();
  });

  it('says a later regeneration spends a try-on', async () => {
    renderSheet({ fitting: fitting({ regenerationFree: false }) });

    expect(await screen.findByText(/Перегенерация списывает 1 примерку/)).toBeInTheDocument();
    expect(screen.queryByText(/не списывает/)).not.toBeInTheDocument();
  });

  it('counts the comment and stops at the limit', async () => {
    const user = setup();
    renderSheet();
    const area = await screen.findByLabelText('Комментарий, по желанию');

    await user.type(area, 'Светлее');
    expect(screen.getByText('7 / 300')).toBeInTheDocument();
    expect(area).toHaveAttribute('maxlength', String(MAX_COMMENT_LENGTH));
  });

  it('sends the reasons and the trimmed comment, then passes the new fitting on (AC8)', async () => {
    fetchMock.mockImplementation(answer(201, startedBody()));
    const user = setup();
    const { onStarted } = renderSheet();

    await user.click(await screen.findByRole('button', { name: 'Лицо' }));
    await user.click(screen.getByRole('button', { name: 'Фон' }));
    await user.type(screen.getByLabelText('Комментарий, по желанию'), '  Светлее  ');
    await user.click(submit());

    await vi.waitFor(() => expect(onStarted).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
    expect(new URL(String(url)).pathname).toBe(`/api/fittings/${PARENT}/regenerate`);
    expect(JSON.parse(String(init.body))).toEqual({
      reasons: ['face', 'background'],
      comment: 'Светлее',
    });
    expect(onStarted.mock.calls[0]?.[0]).toMatchObject({ parentId: PARENT });
  });

  it('leaves the comment out when it is blank', async () => {
    fetchMock.mockImplementation(answer(201, startedBody()));
    const user = setup();
    renderSheet();

    await user.click(await screen.findByRole('button', { name: 'Вещь' }));
    await user.type(screen.getByLabelText('Комментарий, по желанию'), '   ');
    await user.click(submit());

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ reasons: ['item'] });
  });

  it('sends nothing without a reason', async () => {
    const user = setup();
    renderSheet();

    await user.click(await screen.findByRole('button', { name: /Перегенерировать/ }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends one request when the button is clicked twice', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    const user = setup();
    renderSheet();

    await user.click(await screen.findByRole('button', { name: 'Лицо' }));
    await user.dblClick(submit());

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows a refused comment under the field and spends nothing (AC9)', async () => {
    fetchMock.mockImplementation(failure(400, 'PROMPT_REFUSED'));
    const user = setup();
    const { onLimit, onStarted } = renderSheet();

    await user.click(await screen.findByRole('button', { name: 'Другое' }));
    await user.type(screen.getByLabelText('Комментарий, по желанию'), 'плохой текст');
    await user.click(submit());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Текст не подходит для примерки');
    expect(screen.getByLabelText('Комментарий, по желанию')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(onStarted).not.toHaveBeenCalled();
    expect(onLimit).not.toHaveBeenCalled();
    expect(mocks.track).toHaveBeenCalledWith('Fitting Refused', {
      kind: 'single',
      reason: 'prompt_refused',
    });
  });

  it('calls onLimit at the month’s limit', async () => {
    fetchMock.mockImplementation(failure(409, 'LIMIT_REACHED'));
    const user = setup();
    const { onLimit } = renderSheet({ fitting: fitting({ regenerationFree: false }) });

    await user.click(await screen.findByRole('button', { name: 'Лицо' }));
    await user.click(submit());

    await vi.waitFor(() => expect(onLimit).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the text of any other failure as a notice, not under the comment', async () => {
    fetchMock.mockImplementation(failure(409, 'PHOTO_GONE'));
    const user = setup();
    renderSheet();

    await user.click(await screen.findByRole('button', { name: 'Лицо' }));
    await user.click(submit());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Фото этой примерки удалено — выберите фото и примерьте заново',
    );
    expect(screen.getByLabelText('Комментарий, по желанию')).not.toHaveAttribute('aria-invalid');
  });

  it('tracks the regenerate click with its reasons count, comment flag and freeness', async () => {
    fetchMock.mockImplementation(answer(201, startedBody()));
    const user = setup();
    renderSheet({ fitting: fitting({ regenerationFree: false }) });

    await user.click(await screen.findByRole('button', { name: 'Лицо' }));
    await user.click(screen.getByRole('button', { name: 'Фигура' }));
    await user.click(submit());

    expect(mocks.track).toHaveBeenCalledWith(
      'Element Clicked',
      expect.objectContaining({
        element: 'result.regenerate',
        reasons: 2,
        with_comment: false,
        free: false,
      }),
    );
  });

  it('asks the page to close when the dialog is dismissed', async () => {
    const user = setup();
    const { onOpenChange } = renderSheet();
    await screen.findByRole('dialog', { name: 'Что поменять?' });

    await user.keyboard('{Escape}');

    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('renders nothing while closed', () => {
    renderSheet({ open: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  describe('«Какая именно?» of a look', () => {
    const lookItem = (n: number, name: string): Fitting['items'][number] => ({
      productId: `00000000-0000-4000-8000-00000000010${n}`,
      name,
      brand: 'B',
      imageUrl: null,
      price: 1000,
      finalPrice: 900,
      attributeValueId: null,
      colour: null,
      slot: n === 1 ? 'top' : 'bottom',
    });
    const look = (items = [lookItem(1, 'Тренч Nord'), lookItem(2, 'Брюки Lux')]) =>
      fitting({ kind: 'look', items });

    it('is not shown until «Вещь» is checked', async () => {
      const user = setup();
      renderSheet({ fitting: look() });

      await user.click(await screen.findByRole('button', { name: 'Лицо' }));
      expect(screen.queryByText('Какая именно?')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Вещь' }));
      expect(screen.getByText('Какая именно?')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Тренч Nord' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Брюки Lux' })).toBeInTheDocument();
    });

    it('lists the items in the slots’ order, not the api’s', async () => {
      const user = setup();
      const shoes = { ...lookItem(3, 'Туфли Vero'), slot: 'shoes' as const };
      const bottom = lookItem(2, 'Брюки Lux');
      const top = lookItem(1, 'Тренч Nord');
      renderSheet({ fitting: look([bottom, top, shoes]) });

      await user.click(await screen.findByRole('button', { name: 'Вещь' }));

      const group = screen.getByText('Какая именно?').parentElement as HTMLElement;
      const names = within(group)
        .getAllByRole('button')
        .map((button) => button.textContent);
      expect(names).toEqual(['Тренч Nord', 'Брюки Lux', 'Туфли Vero']);
    });

    it('is never shown for a single fitting or a look of one item', async () => {
      const user = setup();
      renderSheet({
        fitting: fitting({
          kind: 'single',
          items: [lookItem(1, 'Тренч Nord'), lookItem(2, 'Брюки')],
        }),
      });

      await user.click(await screen.findByRole('button', { name: 'Вещь' }));
      expect(screen.queryByText('Какая именно?')).not.toBeInTheDocument();
    });

    it('is not shown for a look of one item', async () => {
      const user = setup();
      renderSheet({ fitting: look([lookItem(1, 'Тренч Nord')]) });

      await user.click(await screen.findByRole('button', { name: 'Вещь' }));
      expect(screen.queryByText('Какая именно?')).not.toBeInTheDocument();
    });

    it('chooses one item at a time and sends «<name>: <comment>» of it', async () => {
      fetchMock.mockImplementation(answer(201, startedBody()));
      const user = setup();
      renderSheet({ fitting: look() });

      await user.click(await screen.findByRole('button', { name: 'Вещь' }));
      await user.click(screen.getByRole('button', { name: 'Тренч Nord' }));
      await user.click(screen.getByRole('button', { name: 'Брюки Lux' }));
      expect(screen.getByRole('button', { name: 'Тренч Nord' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      expect(screen.getByRole('button', { name: 'Брюки Lux' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await user.type(screen.getByLabelText('Комментарий, по желанию'), 'короче');
      await user.click(submit());

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const [url, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
      expect(new URL(String(url)).pathname).toBe(`/api/fittings/${PARENT}/regenerate`);
      expect(JSON.parse(String(init.body))).toEqual({
        reasons: ['item'],
        comment: 'Брюки Lux: короче',
      });
    });

    it('sends the name alone when there is no comment', async () => {
      fetchMock.mockImplementation(answer(201, startedBody()));
      const user = setup();
      renderSheet({ fitting: look() });

      await user.click(await screen.findByRole('button', { name: 'Вещь' }));
      await user.click(screen.getByRole('button', { name: 'Тренч Nord' }));
      await user.click(submit());

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const [, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
      expect(JSON.parse(String(init.body))).toEqual({ reasons: ['item'], comment: 'Тренч Nord' });
    });

    it('sends only the comment when no item is chosen', async () => {
      fetchMock.mockImplementation(answer(201, startedBody()));
      const user = setup();
      renderSheet({ fitting: look() });

      await user.click(await screen.findByRole('button', { name: 'Вещь' }));
      await user.type(screen.getByLabelText('Комментарий, по желанию'), 'короче');
      await user.click(submit());

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const [, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
      expect(JSON.parse(String(init.body))).toEqual({ reasons: ['item'], comment: 'короче' });
    });

    it('shrinks the comment field and its counter by the name and the colon', async () => {
      const user = setup();
      renderSheet({ fitting: look() });

      await user.click(await screen.findByRole('button', { name: 'Вещь' }));
      expect(screen.getByLabelText('Комментарий, по желанию')).toHaveAttribute('maxlength', '300');
      await user.click(screen.getByRole('button', { name: 'Тренч Nord' }));

      const prefix = 'Тренч Nord'.length + 2;
      expect(screen.getByLabelText('Комментарий, по желанию')).toHaveAttribute(
        'maxlength',
        String(300 - prefix),
      );
      expect(screen.getByText(`0 / ${300 - prefix}`)).toBeInTheDocument();
    });

    it('trims a typed comment at once to what the name leaves when an item is chosen', async () => {
      const user = setup();
      renderSheet({ fitting: look() });
      await user.click(await screen.findByRole('button', { name: 'Вещь' }));
      const area = screen.getByLabelText('Комментарий, по желанию');
      fireEvent.change(area, { target: { value: 'я'.repeat(295) } });
      expect(area).toHaveValue('я'.repeat(295));

      await user.click(screen.getByRole('button', { name: 'Тренч Nord' }));

      const max = MAX_COMMENT_LENGTH - 'Тренч Nord'.length - 2;
      expect(area).toHaveValue('я'.repeat(max));
      expect(screen.getByText(`${max} / ${max}`)).toBeInTheDocument();
    });

    it('sends the whole text it shows after the trim, within the limit', async () => {
      fetchMock.mockImplementation(answer(201, startedBody()));
      const user = setup();
      renderSheet({ fitting: look() });
      await user.click(await screen.findByRole('button', { name: 'Вещь' }));
      fireEvent.change(screen.getByLabelText('Комментарий, по желанию'), {
        target: { value: 'я'.repeat(300) },
      });
      await user.click(screen.getByRole('button', { name: 'Тренч Nord' }));
      await user.click(submit());

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const [, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
      const { comment } = JSON.parse(String(init.body)) as { comment: string };
      expect(comment).toHaveLength(MAX_COMMENT_LENGTH);
      expect(comment.startsWith('Тренч Nord: я')).toBe(true);
    });

    it('tracks with_item false while «Вещь» is checked and no item is chosen (A94.5)', async () => {
      fetchMock.mockImplementation(answer(201, startedBody()));
      const user = setup();
      renderSheet({ fitting: look() });
      await user.click(await screen.findByRole('button', { name: 'Вещь' }));

      await user.click(submit());
      expect(mocks.track).toHaveBeenCalledWith(
        'Element Clicked',
        expect.objectContaining({ element: 'result.regenerate', with_item: false }),
      );
    });

    it('tracks with_item true after «Какая именно?» is answered', async () => {
      fetchMock.mockImplementation(answer(201, startedBody()));
      const user = setup();
      renderSheet({ fitting: look() });
      await user.click(await screen.findByRole('button', { name: 'Вещь' }));
      await user.click(screen.getByRole('button', { name: 'Тренч Nord' }));

      await user.click(submit());

      expect(mocks.track).toHaveBeenCalledWith(
        'Element Clicked',
        expect.objectContaining({ element: 'result.regenerate', with_item: true }),
      );
    });

    it('sends Fitting Started with no prompt when only an item is chosen', async () => {
      fetchMock.mockImplementation(answer(201, startedBody()));
      const user = setup();
      renderSheet({ fitting: look() });
      await user.click(await screen.findByRole('button', { name: 'Вещь' }));
      await user.click(screen.getByRole('button', { name: 'Тренч Nord' }));
      await user.click(submit());

      await vi.waitFor(() =>
        expect(mocks.track).toHaveBeenCalledWith(
          'Fitting Started',
          expect.objectContaining({ source: 'regenerate', with_prompt: false }),
        ),
      );
    });

    it('sends Fitting Started with a prompt when a comment is typed besides the item', async () => {
      fetchMock.mockImplementation(answer(201, startedBody()));
      const user = setup();
      renderSheet({ fitting: look() });
      await user.click(await screen.findByRole('button', { name: 'Вещь' }));
      await user.click(screen.getByRole('button', { name: 'Тренч Nord' }));
      await user.type(screen.getByLabelText('Комментарий, по желанию'), 'короче');
      await user.click(submit());

      await vi.waitFor(() =>
        expect(mocks.track).toHaveBeenCalledWith(
          'Fitting Started',
          expect.objectContaining({ source: 'regenerate', with_prompt: true }),
        ),
      );
    });
  });

  describe('commentWithItem', () => {
    it('leaves the trimmed comment alone with no item', () => {
      expect(commentWithItem('  короче ', null)).toBe('короче');
    });

    it('puts the name before the comment, or is the name alone', () => {
      expect(commentWithItem('короче', 'Брюки')).toBe('Брюки: короче');
      expect(commentWithItem('   ', 'Брюки')).toBe('Брюки');
    });

    it('stays within the comment limit', () => {
      expect(commentWithItem('я'.repeat(400), 'Брюки')).toHaveLength(MAX_COMMENT_LENGTH);
    });
  });

  it('is a bottom sheet on a phone with the same reasons', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(width < 600px)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    renderSheet();

    expect(await screen.findByRole('dialog', { name: 'Что поменять?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Лицо' })).toBeInTheDocument();
  });
});
