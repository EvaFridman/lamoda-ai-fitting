import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DeleteAccount } from './delete-account';

const mocks = vi.hoisted(() => ({
  track: vi.fn(),
  reset: vi.fn(),
  identify: vi.fn(),
  captureException: vi.fn(),
  assign: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }));

vi.mock('@/shared/analytics/client', () => ({
  identify: mocks.identify,
  track: mocks.track,
  reset: mocks.reset,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/customer/account',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}));

const fetchMock = vi.fn();

// Base UI turns pointer events off on the page while a modal is open and the styles that give them
// back to the dialog are not loaded in jsdom, so user-event's pointer-events check is off.
const setup = () => userEvent.setup({ pointerEventsCheck: 0 });

function renderComponent() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DeleteAccount />
    </QueryClientProvider>,
  );
}

function elementClicks() {
  return mocks.track.mock.calls.filter(([name]) => name === 'Element Clicked');
}

function accountDeleted() {
  return mocks.track.mock.calls.filter(([name]) => name === 'Account Deleted');
}

const unavailable = () =>
  Promise.resolve(
    new Response(
      JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'm', details: [] } }),
      { status: 503 },
    ),
  );

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('location', { ...window.location, assign: mocks.assign });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DeleteAccount', () => {
  it('opens the confirmation from "Удалить аккаунт" and sends the click of account-delete.open', async () => {
    const user = setup();
    renderComponent();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Удалить аккаунт' }));

    const dialog = await screen.findByRole('dialog', { name: 'Удалить аккаунт?' });
    expect(dialog).toHaveTextContent('историю примерок');
    expect(dialog).toHaveTextContent('до 7 дней');
    expect(elementClicks()).toEqual([
      ['Element Clicked', { element: 'account-delete.open', zone: 'account', type: 'interaction' }],
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cancel closes the modal and changes nothing', async () => {
    const user = setup();
    renderComponent();
    await user.click(screen.getByRole('button', { name: 'Удалить аккаунт' }));
    await user.click(await screen.findByRole('button', { name: 'Отмена' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(accountDeleted()).toHaveLength(0);
    expect(mocks.reset).not.toHaveBeenCalled();
    expect(mocks.assign).not.toHaveBeenCalled();
    expect(elementClicks().map(([, props]) => (props as { element: string }).element)).toEqual([
      'account-delete.open',
      'account-delete.cancel',
    ]);
  });

  it('confirming deletes /me, then tracks, then resets, then loads the home page', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })));
    const user = setup();
    renderComponent();
    await user.click(screen.getByRole('button', { name: 'Удалить аккаунт' }));
    await user.click(await screen.findByRole('button', { name: 'Удалить' }));

    await vi.waitFor(() => expect(mocks.assign).toHaveBeenCalledExactlyOnceWith('/'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
    expect(new URL(String(url)).pathname).toBe('/api/me');
    expect(init.method).toBe('DELETE');

    expect(mocks.track).toHaveBeenCalledWith('Account Deleted', {}, { sendNow: true });
    expect(accountDeleted()).toHaveLength(1);
    const trackOrder = mocks.track.mock.invocationCallOrder.at(-1) ?? 0;
    expect(fetchMock.mock.invocationCallOrder[0]).toBeLessThan(trackOrder);
    expect(trackOrder).toBeLessThan(mocks.reset.mock.invocationCallOrder[0] ?? 0);
    expect(mocks.reset.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.assign.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.reset).toHaveBeenCalledTimes(1);
  });

  it('a failed deletion keeps the modal open with its text and does nothing after', async () => {
    fetchMock.mockImplementation(unavailable);
    const user = setup();
    renderComponent();
    await user.click(screen.getByRole('button', { name: 'Удалить аккаунт' }));
    await user.click(await screen.findByRole('button', { name: 'Удалить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Сервис временно недоступен, попробуйте позже',
    );
    expect(screen.getByRole('dialog', { name: 'Удалить аккаунт?' })).toBeInTheDocument();
    expect(mocks.captureException).toHaveBeenCalled();
    expect(accountDeleted()).toHaveLength(0);
    expect(mocks.reset).not.toHaveBeenCalled();
    expect(mocks.assign).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Удалить' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Отмена' })).toBeEnabled();
  });

  it('a 401 (the account is already gone) resets and loads the home page without the event or a text', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'm', details: [] } }),
          {
            status: 401,
          },
        ),
      ),
    );
    const user = setup();
    renderComponent();
    await user.click(screen.getByRole('button', { name: 'Удалить аккаунт' }));
    await user.click(await screen.findByRole('button', { name: 'Удалить' }));

    await vi.waitFor(() => expect(mocks.assign).toHaveBeenCalledExactlyOnceWith('/'));
    expect(mocks.reset).toHaveBeenCalledTimes(1);
    expect(mocks.reset.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.assign.mock.invocationCallOrder[0] ?? 0,
    );
    expect(accountDeleted()).toHaveLength(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('a network error shows its text and keeps the modal open without reset or navigation', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
    const user = setup();
    renderComponent();
    await user.click(screen.getByRole('button', { name: 'Удалить аккаунт' }));
    await user.click(await screen.findByRole('button', { name: 'Удалить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Нет связи с сервером, попробуйте позже',
    );
    expect(screen.getByRole('dialog', { name: 'Удалить аккаунт?' })).toBeInTheDocument();
    expect(accountDeleted()).toHaveLength(0);
    expect(mocks.reset).not.toHaveBeenCalled();
    expect(mocks.assign).not.toHaveBeenCalled();
  });

  it('opens with the focus on "Отмена"', async () => {
    const user = setup();
    renderComponent();
    await user.click(screen.getByRole('button', { name: 'Удалить аккаунт' }));
    await screen.findByRole('dialog', { name: 'Удалить аккаунт?' });

    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Отмена' })).toHaveFocus());
  });

  it('closing after a failure clears the error, and it can be tried again', async () => {
    fetchMock.mockImplementationOnce(unavailable);
    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })));
    const user = setup();
    renderComponent();
    await user.click(screen.getByRole('button', { name: 'Удалить аккаунт' }));
    await user.click(await screen.findByRole('button', { name: 'Удалить' }));
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Удалить аккаунт' }));
    await screen.findByRole('dialog', { name: 'Удалить аккаунт?' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    await vi.waitFor(() => expect(mocks.assign).toHaveBeenCalledExactlyOnceWith('/'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('cannot be closed or cancelled while the deletion is pending', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    const user = setup();
    renderComponent();
    await user.click(screen.getByRole('button', { name: 'Удалить аккаунт' }));
    await user.click(await screen.findByRole('button', { name: 'Удалить' }));

    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Отмена' })).toBeDisabled());
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Удалить аккаунт?' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.assign).not.toHaveBeenCalled();
  });

  it('two quick clicks on "Удалить" send one DELETE', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    const user = setup();
    renderComponent();
    await user.click(screen.getByRole('button', { name: 'Удалить аккаунт' }));
    const confirm = await screen.findByRole('button', { name: 'Удалить' });
    await user.click(confirm);
    await user.click(confirm);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
    expect(new URL(String(url)).pathname).toBe('/api/me');
    expect(init.method).toBe('DELETE');
  });

  it('the "Закрыть" button does not close the modal while the deletion is pending', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    const user = setup();
    renderComponent();
    await user.click(screen.getByRole('button', { name: 'Удалить аккаунт' }));
    await user.click(await screen.findByRole('button', { name: 'Удалить' }));
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Отмена' })).toBeDisabled());

    await user.click(screen.getByRole('button', { name: 'Закрыть' }));

    expect(screen.getByRole('dialog', { name: 'Удалить аккаунт?' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns focus to "Удалить аккаунт" after "Отмена"', async () => {
    const user = setup();
    renderComponent();
    const trigger = screen.getByRole('button', { name: 'Удалить аккаунт' });
    await user.click(trigger);
    await user.click(await screen.findByRole('button', { name: 'Отмена' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await vi.waitFor(() => expect(trigger).toHaveFocus());
  });

  it('returns focus to "Удалить аккаунт" after Escape', async () => {
    const user = setup();
    renderComponent();
    const trigger = screen.getByRole('button', { name: 'Удалить аккаунт' });
    await user.click(trigger);
    await screen.findByRole('dialog', { name: 'Удалить аккаунт?' });
    await user.keyboard('{Escape}');

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await vi.waitFor(() => expect(trigger).toHaveFocus());
  });
});
