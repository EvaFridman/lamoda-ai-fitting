import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/shared/api';

import { LoginModal } from './login-modal';

const mocks = vi.hoisted(() => ({
  signInWithGoogle: vi.fn(),
  reportFailure: vi.fn(),
  replace: vi.fn(),
  navigation: { pathname: '/catalog', params: new URLSearchParams() },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.navigation.pathname,
  useSearchParams: () => mocks.navigation.params,
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('../model/auth-actions', () => ({ signInWithGoogle: mocks.signInWithGoogle }));

vi.mock('@/shared/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api')>()),
  reportFailure: mocks.reportFailure,
}));

function httpError(status: number, code?: string): ApiError {
  return new ApiError('m', {
    kind: 'http',
    template: '/api/auth/sign-in/social',
    method: 'POST',
    status,
    code,
  });
}

function setup() {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  render(<LoginModal trigger={<button type="button">Профиль</button>} />);
  return user;
}

async function openModal(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Профиль' }));
  return screen.findByRole('dialog', { name: 'Вход' });
}

describe('LoginModal', () => {
  beforeEach(() => {
    mocks.signInWithGoogle.mockReset().mockResolvedValue(undefined);
    mocks.reportFailure.mockReset();
    mocks.replace.mockReset();
    mocks.navigation.pathname = '/catalog';
    mocks.navigation.params = new URLSearchParams();
  });

  it('is closed until the trigger is used, then shows "Войти через Google"', async () => {
    const user = setup();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await openModal(user);
    expect(screen.getByRole('button', { name: 'Войти через Google' })).toBeEnabled();
  });

  it('signs in with the current path and query as the return address', async () => {
    mocks.navigation.pathname = '/catalog/shoes';
    mocks.navigation.params = new URLSearchParams('a=1&b=2');
    const user = setup();
    await openModal(user);
    await user.click(screen.getByRole('button', { name: 'Войти через Google' }));
    expect(mocks.signInWithGoogle).toHaveBeenCalledExactlyOnceWith('/catalog/shoes?a=1&b=2');
  });

  it('never takes the return address from the query', async () => {
    mocks.navigation.pathname = '//evil.example';
    mocks.navigation.params = new URLSearchParams({ next: '//evil.example' });
    const user = setup();
    await openModal(user);
    await user.click(screen.getByRole('button', { name: 'Войти через Google' }));
    expect(mocks.signInWithGoogle).toHaveBeenCalledWith('/evil.example?next=%2F%2Fevil.example');
  });

  it('waits while the page leaves for Google', async () => {
    mocks.signInWithGoogle.mockReturnValue(new Promise(() => {}));
    const user = setup();
    await openModal(user);
    await user.click(screen.getByRole('button', { name: 'Войти через Google' }));
    expect(screen.getByRole('button', { name: 'Войти через Google' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  describe('when the page comes back with "Back"', () => {
    function pageshow(persisted: boolean) {
      act(() => {
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted }));
      });
    }

    async function startWaiting() {
      mocks.signInWithGoogle.mockReturnValue(new Promise(() => {}));
      const user = setup();
      await openModal(user);
      await user.click(screen.getByRole('button', { name: 'Войти через Google' }));
      expect(screen.getByRole('button', { name: 'Войти через Google' })).toHaveAttribute(
        'aria-busy',
        'true',
      );
    }

    it('stops waiting after a page restored from the cache', async () => {
      await startWaiting();
      pageshow(true);
      expect(screen.getByRole('button', { name: 'Войти через Google' })).not.toHaveAttribute(
        'aria-busy',
        'true',
      );
    });

    it('keeps waiting after a pageshow of a fresh load', async () => {
      await startWaiting();
      pageshow(false);
      expect(screen.getByRole('button', { name: 'Войти через Google' })).toHaveAttribute(
        'aria-busy',
        'true',
      );
    });

    it('stops listening when unmounted', () => {
      const remove = vi.spyOn(window, 'removeEventListener');
      try {
        const { unmount } = render(<LoginModal trigger={<button type="button">Профиль</button>} />);
        unmount();
        expect(remove).toHaveBeenCalledWith('pageshow', expect.any(Function));
      } finally {
        remove.mockRestore();
      }
    });
  });

  it('shows the too-many-requests text for a 429 and reports the failure', async () => {
    const failure = httpError(429, 'TOO_MANY_REQUESTS');
    mocks.signInWithGoogle.mockRejectedValue(failure);
    const user = setup();
    await openModal(user);
    await user.click(screen.getByRole('button', { name: 'Войти через Google' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Слишком много запросов, подождите немного',
    );
    expect(mocks.reportFailure).toHaveBeenCalledExactlyOnceWith(failure);
  });

  it('shows the unavailable text for a 503, and the button works again', async () => {
    mocks.signInWithGoogle.mockRejectedValue(httpError(503, 'SERVICE_UNAVAILABLE'));
    const user = setup();
    await openModal(user);
    await user.click(screen.getByRole('button', { name: 'Войти через Google' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Сервис временно недоступен, попробуйте позже',
    );
    expect(screen.getByRole('button', { name: 'Войти через Google' })).not.toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('shows the general text for a failure that is not an ApiError', async () => {
    mocks.signInWithGoogle.mockRejectedValue(new Error('boom'));
    const user = setup();
    await openModal(user);
    await user.click(screen.getByRole('button', { name: 'Войти через Google' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Что-то пошло не так, попробуйте позже',
    );
  });

  it('clears the error when the modal is closed and opened again', async () => {
    mocks.signInWithGoogle.mockRejectedValue(httpError(503, 'SERVICE_UNAVAILABLE'));
    const user = setup();
    await openModal(user);
    await user.click(screen.getByRole('button', { name: 'Войти через Google' }));
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Закрыть' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await openModal(user);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  describe('after a sign-in that failed at Google', () => {
    it('does not touch the address or report anything without an error param', () => {
      mocks.navigation.params = new URLSearchParams('a=1');
      setup();
      expect(mocks.replace).not.toHaveBeenCalled();
      expect(mocks.reportFailure).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('opens with the cancelled text for access_denied and does not report it', async () => {
      mocks.navigation.params = new URLSearchParams('error=access_denied');
      setup();
      const dialog = await screen.findByRole('dialog', { name: 'Вход' });
      expect(within(dialog).getByRole('alert')).toHaveTextContent('Вход отменён');
      expect(mocks.reportFailure).not.toHaveBeenCalled();
    });

    it('opens with the failed text for another code and reports a SignInFailed error', async () => {
      mocks.navigation.params = new URLSearchParams('error=server_error');
      setup();
      const dialog = await screen.findByRole('dialog', { name: 'Вход' });
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        'Не удалось войти, попробуйте ещё раз',
      );
      expect(mocks.reportFailure).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          name: 'SignInFailed',
          message: 'sign-in came back with server_error',
        }),
      );
    });

    it('treats a value that is not a code as "unknown"', async () => {
      mocks.navigation.params = new URLSearchParams({ error: '<b>x</b>' });
      setup();
      await screen.findByRole('dialog', { name: 'Вход' });
      expect(mocks.reportFailure).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ message: 'sign-in came back with unknown' }),
      );
    });

    it('shows a script-like value as no markup: only the fixed text, no element', async () => {
      mocks.navigation.params = new URLSearchParams({
        error: '<script>alert(1)</script>',
        error_description: '<script>alert(2)</script>',
      });
      setup();
      const dialog = await screen.findByRole('dialog', { name: 'Вход' });
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        /^Не удалось войти, попробуйте ещё раз$/,
      );
      expect(document.querySelector('script')).toBeNull();
      expect(dialog).not.toHaveTextContent('alert(');
    });

    it('replaces the address with the path alone when nothing else remains', async () => {
      mocks.navigation.params = new URLSearchParams('error=access_denied&error_description=no');
      setup();
      await screen.findByRole('dialog');
      expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/catalog', { scroll: false });
    });

    it('replaces the address with the path and the rest of the query', async () => {
      mocks.navigation.params = new URLSearchParams(
        'a=1&error=access_denied&error_description=no&b=2',
      );
      setup();
      await screen.findByRole('dialog');
      expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/catalog?a=1&b=2', {
        scroll: false,
      });
    });

    it('retries with a return address that has no error params', async () => {
      mocks.navigation.params = new URLSearchParams('a=1&error=server_error&error_description=x');
      const user = setup();
      await screen.findByRole('dialog');
      await user.click(screen.getByRole('button', { name: 'Войти через Google' }));
      expect(mocks.signInWithGoogle).toHaveBeenCalledExactlyOnceWith('/catalog?a=1');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('clears the text when the modal is closed', async () => {
      mocks.navigation.params = new URLSearchParams('error=access_denied');
      const user = setup();
      await screen.findByRole('alert');
      await user.click(screen.getByRole('button', { name: 'Закрыть' }));
      await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await openModal(user);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
