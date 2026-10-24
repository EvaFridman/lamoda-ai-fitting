import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fittingKeys } from '@/entities/fitting';

import { type DeletableFitting, DELETE_TEXT, DELETE_TITLE, DeleteFitting } from './delete-fitting';

const mocks = vi.hoisted(() => ({ track: vi.fn(), captureException: vi.fn() }));

vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }));

vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  reset: vi.fn(),
  track: mocks.track,
}));

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const fetchMock = vi.fn();

const FITTING: DeletableFitting = {
  id: ID,
  kind: 'look',
  status: 'completed',
  resultUrl: 'https://s3.test/keep/users/u/r.webp?X-Amz-Signature=sig',
};

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

const apiError = (status: number, code: string) =>
  json({ error: { code, message: 'm', details: [] } }, status);

function deletes() {
  return fetchMock.mock.calls
    .map(([url, init]) => ({
      method: (init as RequestInit | undefined)?.method ?? 'GET',
      path: new URL(String(url)).pathname,
    }))
    .filter((call) => call.method === 'DELETE');
}

function renderDelete(fitting: DeletableFitting | null = FITTING) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const onClose = vi.fn();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <DeleteFitting fitting={fitting} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { ...view, invalidate, onClose };
}

function stubPhone() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

const setup = () => userEvent.setup({ pointerEventsCheck: 0 });

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DeleteFitting', () => {
  it('stays closed without a fitting', () => {
    renderDelete(null);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks with its title and text, the focus on «Отмена»', async () => {
    renderDelete();

    const dialog = await screen.findByRole('dialog', { name: DELETE_TITLE });
    expect(dialog).toHaveTextContent(
      'Результат и его фото удалятся. Потраченная примерка не вернётся.',
    );
    expect(DELETE_TEXT).toBe('Результат и его фото удалятся. Потраченная примерка не вернётся.');
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Отмена' })).toHaveFocus());
  });

  it('shows the result only as an image src inside an mp-block container', async () => {
    renderDelete();

    const dialog = await screen.findByRole('dialog');
    const image = dialog.querySelector('img');
    expect(image).toHaveAttribute('src', FITTING.resultUrl);
    expect(image?.closest('.mp-block')).not.toBeNull();
    for (const element of dialog.querySelectorAll('*')) {
      for (const attribute of element.getAttributeNames()) {
        if (element === image && attribute === 'src') continue;
        expect(element.getAttribute(attribute)).not.toContain('X-Amz-Signature');
      }
    }
  });

  it('deletes once, tracks the click with the status and the kind, reads the list again and closes', async () => {
    const { invalidate, onClose } = renderDelete();
    await screen.findByRole('dialog');

    await setup().click(screen.getByRole('button', { name: 'Удалить' }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(deletes()).toEqual([{ method: 'DELETE', path: `/api/fittings/${ID}` }]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: fittingKeys.all });
    expect(mocks.track).toHaveBeenCalledWith('Element Clicked', {
      element: 'history.delete',
      zone: 'fitting',
      type: 'interaction',
      status: 'completed',
      kind: 'look',
    });
  });

  it('closes and reads again, with no error, when the fitting is already gone (404)', async () => {
    fetchMock.mockImplementation(() => apiError(404, 'NOT_FOUND'));
    const { invalidate, onClose } = renderDelete();
    await screen.findByRole('dialog');

    await setup().click(screen.getByRole('button', { name: 'Удалить' }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: fittingKeys.all });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the error and stays open on another failure, without a second request', async () => {
    fetchMock.mockImplementation(() => apiError(503, 'SERVICE_UNAVAILABLE'));
    const { invalidate, onClose } = renderDelete();
    await screen.findByRole('dialog');

    await setup().click(screen.getByRole('button', { name: 'Удалить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Сервис временно недоступен, попробуйте позже',
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(deletes()).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: DELETE_TITLE })).toBeInTheDocument();
  });

  it('closes on «Отмена» without a request', async () => {
    const { onClose } = renderDelete();
    await screen.findByRole('dialog');

    await setup().click(screen.getByRole('button', { name: 'Отмена' }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(deletes()).toHaveLength(0);
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('is a sheet on a phone, with the same text and actions', async () => {
    stubPhone();
    const { onClose } = renderDelete();

    const dialog = await screen.findByRole('dialog', { name: DELETE_TITLE });
    expect(dialog).toHaveTextContent(DELETE_TEXT);
    await setup().click(screen.getByRole('button', { name: 'Удалить' }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(deletes()).toEqual([{ method: 'DELETE', path: `/api/fittings/${ID}` }]);
  });
});
