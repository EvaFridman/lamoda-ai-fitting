import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRoomStore } from '@/entities/fitting-room';
import type { SessionState } from '@/entities/session';

const mocks = vi.hoisted(() => ({
  session: { status: 'signed-in', user: { id: 'u1', email: 'a@b.c', name: null } } as SessionState,
  pathname: '/catalog',
}));

vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  reset: vi.fn(),
  track: vi.fn(),
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/entities/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/session')>()),
  useSession: () => mocks.session,
}));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => mocks.pathname,
}));

import { LookTryOn } from './look-try-on';

const fetchMock = vi.fn();

function json(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

function route(url: string) {
  const { pathname } = new URL(url);
  if (pathname === '/api/me/photos') return json([]);
  if (pathname === '/api/me/fitting-quota') {
    return json({ limit: 20, used: 0, left: 20, renewsAt: '2026-10-31T21:00:00.000Z' });
  }
  if (pathname === '/api/me/fitting-room') return json({ items: [], count: 0, sum: 0 });
  if (pathname === '/api/categories') return json({ items: [], total: 0, limit: 100, offset: 0 });
  return Promise.resolve(new Response(null, { status: 404 }));
}

function renderLook() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // A new element each time, or React skips the render and never reads the page or the session.
  const ui = () => (
    <QueryClientProvider client={client}>
      <LookTryOn />
    </QueryClientProvider>
  );
  const view = render(ui());
  return { ...view, again: () => view.rerender(ui()) };
}

const dialog = () => screen.findByRole('dialog', { name: 'Примерка образа' });

beforeEach(() => {
  mocks.session = { status: 'signed-in', user: { id: 'u1', email: 'a@b.c', name: null } };
  mocks.pathname = '/catalog';
  useRoomStore.setState({ open: false, lookOpen: false, wishes: null, userId: undefined });
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string) => route(String(url)));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('LookTryOn', () => {
  it('renders nothing while the look is not open, and reads nothing', () => {
    renderLook();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('opens the look’s window when the store says so', async () => {
    renderLook();

    useRoomStore.getState().setLookOpen(true);

    expect(await dialog()).toBeInTheDocument();
  });

  it.each([
    ['pending', { status: 'pending' }],
    ['signed out', { status: 'signed-out', failed: false }],
  ] as const)(
    'shows nothing to a visitor (%s) even when told to open, and reads nothing of the user',
    (_, session) => {
      mocks.session = session;
      renderLook();

      useRoomStore.setState({ lookOpen: true });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      const paths = fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname);
      expect(paths.filter((path) => path.startsWith('/api/me/'))).toEqual([]);
    },
  );

  it('closes with Escape, and the store follows', async () => {
    renderLook();
    useRoomStore.getState().setLookOpen(true);
    await dialog();

    await userEvent.setup({ pointerEventsCheck: 0 }).keyboard('{Escape}');

    await waitFor(() => expect(useRoomStore.getState().lookOpen).toBe(false));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes when the page changes', async () => {
    const { again } = renderLook();
    useRoomStore.getState().setLookOpen(true);
    await dialog();

    mocks.pathname = '/products/p';
    again();

    await waitFor(() => expect(useRoomStore.getState().lookOpen).toBe(false));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('stays open on a re-render of the same page', async () => {
    const { again } = renderLook();
    useRoomStore.getState().setLookOpen(true);
    await dialog();

    again();

    expect(useRoomStore.getState().lookOpen).toBe(true);
    expect(screen.getByRole('dialog', { name: 'Примерка образа' })).toBeInTheDocument();
  });

  it('closes when the session ends', async () => {
    const { again } = renderLook();
    useRoomStore.getState().setLookOpen(true);
    await dialog();

    mocks.session = { status: 'signed-out', failed: false };
    again();

    await waitFor(() => expect(useRoomStore.getState().lookOpen).toBe(false));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes when another user signs in with no end of the session seen in between', async () => {
    const { again } = renderLook();
    useRoomStore.getState().setLookOpen(true);
    await dialog();

    mocks.session = { status: 'signed-in', user: { id: 'u2', email: 'x@y.z', name: null } };
    again();

    await waitFor(() => expect(useRoomStore.getState().lookOpen).toBe(false));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('stays open while the session reloads to the same user', async () => {
    const { again } = renderLook();
    useRoomStore.getState().setLookOpen(true);
    await dialog();

    mocks.session = { status: 'pending' };
    again();
    mocks.session = { status: 'signed-in', user: { id: 'u1', email: 'a@b.c', name: null } };
    again();

    expect(useRoomStore.getState().lookOpen).toBe(true);
  });
});
