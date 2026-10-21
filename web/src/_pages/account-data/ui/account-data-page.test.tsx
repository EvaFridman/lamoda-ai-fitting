import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionState } from '@/entities/session';
import { userKeys } from '@/entities/user';

import { AccountDataPage } from './account-data-page';

const mocks = vi.hoisted(() => ({
  session: { status: 'pending' } as SessionState,
}));

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('@/entities/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/session')>()),
  useSession: () => mocks.session,
}));

vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  track: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/customer/account',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}));

const DATE = '2026-10-01T12:00:00.000Z';
const me = {
  id: '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b',
  phone: null,
  email: 'eva@example.com',
  firstName: 'Ева',
  lastName: 'Иванова',
  patronymic: null,
  dateOfBirth: '1990-05-12',
  gender: null,
  fittingProfileImageKey: null,
  fittingProfileImageUrl: null,
  createdAt: DATE,
  updatedAt: DATE,
};

const fetchMock = vi.fn();

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <AccountDataPage />
      </QueryClientProvider>,
    ),
  };
}

function signedIn() {
  mocks.session = {
    status: 'signed-in',
    user: { id: me.id, email: me.email, name: null },
  } as SessionState;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  signedIn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AccountDataPage', () => {
  it('shows a busy placeholder while /me is read', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    const { container } = renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Мои данные' })).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Сохранить' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Удалить аккаунт' })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).pathname).toBe('/api/me');
  });

  it('shows the form filled from /me once it is read', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify(me))));
    renderPage();
    expect(await screen.findByRole('textbox', { name: 'Фамилия' })).toHaveValue('Иванова');
    expect(screen.getByRole('textbox', { name: 'Имя' })).toHaveValue('Ева');
    expect(screen.getByRole('textbox', { name: 'Дата рождения' })).toHaveValue('12.05.1990');
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
    expect(screen.getByText(me.email)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Удалить аккаунт' })).toBeInTheDocument();
  });

  it('shows the error text of a failed read, and "Повторить" reads it again', async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'm', details: [] } }),
          { status: 503 },
        ),
      ),
    );
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify(me))));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Сервис временно недоступен, попробуйте позже',
    );
    expect(screen.queryByRole('button', { name: 'Сохранить' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Удалить аккаунт' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByRole('textbox', { name: 'Имя' })).toHaveValue('Ева');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the form and what was typed when a background read fails', async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify(me))));
    const { queryClient } = renderPage();
    const name = await screen.findByRole('textbox', { name: 'Имя' });
    await userEvent.type(name, 'а');
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'm', details: [] } }),
          { status: 503 },
        ),
      ),
    );
    await act(() => queryClient.refetchQueries({ queryKey: userKeys.me }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('textbox', { name: 'Имя' })).toHaveValue('Еваа');
    expect(screen.queryByRole('button', { name: 'Повторить' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it("shows another user's values, not the typed ones, when the cached user changes", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify(me))));
    const { queryClient } = renderPage();
    await userEvent.type(await screen.findByRole('textbox', { name: 'Имя' }), 'тест');
    act(() => {
      queryClient.setQueryData(userKeys.me, {
        ...me,
        id: '9a8b7c6d-1111-4222-8333-444455556666',
        firstName: 'Олег',
        lastName: 'Смирнов',
      });
    });
    await vi.waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Имя' })).toHaveValue('Олег'),
    );
    expect(screen.getByRole('textbox', { name: 'Фамилия' })).toHaveValue('Смирнов');
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  });

  it('saves, disables "Сохранить" again and shows the new initials', async () => {
    const saved = { ...me, firstName: 'Анна', lastName: 'Петрова', updatedAt: DATE };
    fetchMock.mockImplementation((_url: unknown, init?: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify(init?.method === 'PATCH' ? saved : me))),
    );
    const { container } = renderPage();
    const first = await screen.findByRole('textbox', { name: 'Имя' });
    expect(container).toHaveTextContent('ЕИ');
    await userEvent.clear(first);
    await userEvent.type(first, 'Анна');
    await userEvent.clear(screen.getByRole('textbox', { name: 'Фамилия' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Фамилия' }), 'Петрова');
    const save = screen.getByRole('button', { name: 'Сохранить' });
    await userEvent.click(save);
    await vi.waitFor(() => expect(container).toHaveTextContent('АП'));
    expect(container).not.toHaveTextContent('ЕИ');
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled(),
    );
    const patches = () =>
      fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
      );
    expect(patches()).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(patches()).toHaveLength(1);
  });

  it('asks for /me only when signed in', () => {
    mocks.session = { status: 'signed-out', failed: false };
    renderPage();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Сохранить' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Мои данные' })).toBeInTheDocument();
  });

  it('asks for nothing while the session loads', () => {
    mocks.session = { status: 'pending' };
    const { container } = renderPage();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});
