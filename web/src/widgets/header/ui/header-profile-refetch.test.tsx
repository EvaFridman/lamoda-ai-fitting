import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HeaderProfile } from './header-profile';

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  authFailure: vi.fn(),
  signInWithGoogle: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('@/shared/analytics/client', () => ({
  identify: mocks.identify,
  track: vi.fn(),
  reset: mocks.reset,
}));

// The real useSession runs here, over a stubbed Better Auth client.
vi.mock('@/shared/auth', () => ({
  authClient: { useSession: mocks.useSession },
  authFailure: mocks.authFailure,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/page',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('@/features/auth/model/auth-actions', () => ({
  signInWithGoogle: mocks.signInWithGoogle,
  signOut: vi.fn(),
  signOutEverywhere: vi.fn(),
}));

function client(isPending: boolean) {
  mocks.useSession.mockReturnValue({ data: null, error: null, isPending });
}

describe('HeaderProfile when the session is read again', () => {
  beforeEach(() => {
    mocks.useSession.mockReset();
    mocks.authFailure.mockReset();
    mocks.signInWithGoogle.mockReset().mockRejectedValue(new Error('boom'));
    mocks.identify.mockReset();
    mocks.reset.mockReset();
    window.sessionStorage.clear();
  });

  it('keeps the open login modal and its failure text through a new pending read', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    client(false);
    const { rerender } = render(<HeaderProfile />);
    await user.click(screen.getByRole('button', { name: 'Профиль' }));
    const dialog = await screen.findByRole('dialog', { name: 'Вход' });
    await user.click(await screen.findByRole('button', { name: 'Войти через Google' }));
    const alert = await screen.findByRole('alert');
    const text = alert.textContent;
    expect(text).toBeTruthy();

    client(true);
    rerender(<HeaderProfile />);

    expect(screen.getByRole('dialog', { name: 'Вход' })).toBe(dialog);
    expect(screen.getByRole('alert')).toHaveTextContent(text ?? '');
  });

  // Better Auth keeps `data` while it reads an existing session again (the tab regains focus).
  it.each([
    ['pending', { isPending: true, isRefetching: true }],
    ['not pending', { isPending: false, isRefetching: true }],
    ['failed with a non-401 error', { error: { status: 503 }, isRefetching: false }],
  ])('keeps the profile menu and the analytics identity when the read is %s', (_name, flags) => {
    const data = {
      user: { id: 'u1', email: 'anna@example.com', name: 'Анна', image: 'x' },
      session: { token: 't' },
    };
    mocks.useSession.mockReturnValue({ data, error: null, isPending: false });
    const { rerender } = render(<HeaderProfile />);
    expect(mocks.identify).toHaveBeenCalledExactlyOnceWith('u1', { signedIn: false });

    mocks.useSession.mockReturnValue({ data, error: null, isPending: false, ...flags });
    rerender(<HeaderProfile />);

    const trigger = screen.getByRole('button', { name: 'Профиль' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.reset).not.toHaveBeenCalled();
    expect(mocks.identify).toHaveBeenCalledTimes(1);
  });
});
