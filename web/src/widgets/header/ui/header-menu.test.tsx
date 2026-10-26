import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as renderPlain, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionState } from '@/entities/session';

import { BURGER_ID, HeaderMenu } from './header-menu';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function render(ui: ReactElement) {
  return renderPlain(ui, { wrapper: Wrapper });
}

const mocks = vi.hoisted(() => ({
  session: { status: 'pending' } as SessionState,
  signOut: vi.fn(),
  signOutEverywhere: vi.fn(),
  signInWithGoogle: vi.fn(),
  replace: vi.fn(),
  params: new URLSearchParams(),
  reset: vi.fn(),
  track: vi.fn(),
}));

vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  track: mocks.track,
  reset: mocks.reset,
}));

vi.mock('@/entities/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/session')>()),
  useSession: () => mocks.session,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/page',
  useSearchParams: () => mocks.params,
  useRouter: () => ({ replace: mocks.replace }),
}));

// jsdom cannot navigate: the link is a plain anchor whose click is cancelled.
vi.mock('next/link', async () => {
  const { createElement } = await import('react');
  return {
    default: ({
      onClick,
      ...props
    }: {
      href: string;
      onClick?: (event: { preventDefault: () => void }) => void;
    }) =>
      createElement('a', {
        ...props,
        onClick: (event: { preventDefault: () => void }) => {
          onClick?.(event);
          event.preventDefault();
        },
      }),
  };
});

vi.mock('@/features/auth/model/auth-actions', () => ({
  signInWithGoogle: mocks.signInWithGoogle,
  signOut: mocks.signOut,
  signOutEverywhere: mocks.signOutEverywhere,
}));

const NAME = 'Анна Секретная';
const categories = [
  { id: 'c1', slug: 'dresses', name: 'Платья' },
  { id: 'c2', slug: 'пальто & куртки', name: 'Пальто' },
];

function signedIn() {
  mocks.session = {
    status: 'signed-in',
    user: { id: 'u1', email: 'anna.private@example.com', name: NAME },
  };
}

function click(element: string, extra: Record<string, unknown> = {}) {
  return ['Element Clicked', { element, zone: 'header', type: 'interaction', ...extra }] as const;
}

async function openMenu() {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  render(<HeaderMenu categories={categories} />);
  await user.click(screen.getByRole('button', { name: 'Меню' }));
  const dialog = await screen.findByRole('dialog', { name: 'Меню' });
  return { user, dialog };
}

describe('HeaderMenu', () => {
  beforeEach(() => {
    mocks.session = { status: 'pending' };
    mocks.signOut.mockReset().mockResolvedValue(undefined);
    mocks.signOutEverywhere.mockReset().mockResolvedValue(undefined);
    mocks.signInWithGoogle.mockReset().mockResolvedValue(undefined);
    mocks.replace.mockReset();
    mocks.reset.mockReset();
    mocks.track.mockReset();
    mocks.params = new URLSearchParams();
    window.sessionStorage.clear();
  });

  it('is closed until the burger is pressed', () => {
    render(<HeaderMenu categories={categories} />);
    expect(screen.getByRole('button', { name: 'Меню' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each([
    ['signed out', { status: 'signed-out', failed: false } as SessionState, false],
    ['signed out by a failed read', { status: 'signed-out', failed: true } as SessionState, false],
  ])('sends the burger click with signed_in false when %s', async (_name, session, expected) => {
    mocks.session = session;
    await openMenu();
    expect(mocks.track).toHaveBeenCalledExactlyOnceWith(
      ...click('header.burger', { signed_in: expected }),
    );
  });

  it('sends no burger click while the session loads, and still opens', async () => {
    await openMenu();
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('gives the burger the id the login modal returns the focus to', () => {
    render(<HeaderMenu categories={categories} />);
    expect(screen.getByRole('button', { name: 'Меню' })).toHaveAttribute('id', BURGER_ID);
  });

  it('sends the burger click with signed_in true when signed in', async () => {
    signedIn();
    await openMenu();
    expect(mocks.track).toHaveBeenCalledExactlyOnceWith(
      ...click('header.burger', { signed_in: true }),
    );
  });

  describe('signed out', () => {
    it.each([false, true])('offers «Войти» and none of the account (failed %s)', async (failed) => {
      mocks.session = { status: 'signed-out', failed };
      const { dialog } = await openMenu();
      expect(within(dialog).getByRole('button', { name: 'Войти' })).toBeInTheDocument();
      expect(within(dialog).queryByRole('button', { name: 'Выйти' })).not.toBeInTheDocument();
      expect(within(dialog).queryByRole('link', { name: 'Мои данные' })).not.toBeInTheDocument();
    });

    it('opens the login modal with «Войти»', async () => {
      mocks.session = { status: 'signed-out', failed: false };
      const { user, dialog } = await openMenu();
      await user.click(within(dialog).getByRole('button', { name: 'Войти' }));
      const login = await screen.findByRole('dialog', { name: 'Вход' });
      expect(within(login).getByRole('button', { name: 'Войти через Google' })).toBeInTheDocument();
    });

    it('does not open by itself for a failed sign-in in the address: only the header’s modal does', async () => {
      mocks.session = { status: 'signed-out', failed: false };
      mocks.params = new URLSearchParams('error=access_denied');
      await openMenu();
      expect(screen.queryByRole('dialog', { name: 'Вход' })).not.toBeInTheDocument();
      expect(mocks.replace).not.toHaveBeenCalled();
    });
  });

  it('shows a skeleton and no «Войти» while the session loads', async () => {
    const { dialog } = await openMenu();
    expect(within(dialog).queryByRole('button', { name: 'Войти' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Выйти' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'Мои заказы' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Все товары' })).toBeInTheDocument();
  });

  describe('signed in', () => {
    beforeEach(signedIn);

    it('shows the name in a block the recordings skip, and no «Войти»', async () => {
      const { dialog } = await openMenu();
      expect(within(dialog).getByText(NAME).closest('.mp-block')).not.toBeNull();
      expect(dialog).not.toHaveTextContent('example.com');
      expect(within(dialog).queryByRole('button', { name: 'Войти' })).not.toBeInTheDocument();
    });

    it('links the five account sections', async () => {
      const { dialog } = await openMenu();
      for (const [name, href] of [
        ['Мои заказы', '/customer/orders'],
        ['Магазины', '/customer/stores'],
        ['Мои данные', '/customer/account'],
        ['Мои примерки', '/customer/fittings'],
        ['Мои фото', '/customer/photos'],
      ]) {
        expect(within(dialog).getByRole('link', { name })).toHaveAttribute('href', href);
      }
    });

    it('offers both sign-outs after the sections', async () => {
      const { dialog } = await openMenu();
      const account = within(dialog).getByRole('list', { name: 'Личный кабинет' });
      expect(
        within(account)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual([
        'Мои заказы',
        'Магазины',
        'Мои данные',
        'Мои примерки',
        'Мои фото',
        'Выйти',
        'Выйти со всех устройств',
      ]);
    });

    it.each([
      ['Мои данные', 'data'],
      ['Мои заказы', 'orders'],
    ])('sends the click on «%s» with surface burger and closes', async (name, section) => {
      const { user, dialog } = await openMenu();
      mocks.track.mockClear();
      await user.click(within(dialog).getByRole('link', { name }));
      expect(mocks.track).toHaveBeenCalledExactlyOnceWith(
        'Element Clicked',
        expect.objectContaining({
          element: 'profile-menu.section',
          zone: 'auth',
          type: 'navigation',
          section,
          surface: 'burger',
        }),
      );
      await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    // The mocked next/link cancels its click, as the real one does to navigate on the client; a
    // plain anchor leaves it to the browser (spec 0022 X16).
    it('links «Магазины» as a plain anchor, sends its click with surface burger and closes', async () => {
      const { user, dialog } = await openMenu();
      mocks.track.mockClear();
      const cancelled: boolean[] = [];
      const listener = (event: Event) => {
        cancelled.push(event.defaultPrevented);
        event.preventDefault();
      };
      document.addEventListener('click', listener);
      await user.click(within(dialog).getByRole('link', { name: 'Магазины' }));
      document.removeEventListener('click', listener);

      expect(cancelled).toEqual([false]);
      expect(mocks.track).toHaveBeenCalledExactlyOnceWith(
        'Element Clicked',
        expect.objectContaining({
          element: 'profile-menu.section',
          section: 'stores',
          surface: 'burger',
        }),
      );
      await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('keeps next/link for the other sections', async () => {
      const { user, dialog } = await openMenu();
      const cancelled: boolean[] = [];
      const listener = (event: Event) => {
        cancelled.push(event.defaultPrevented);
        event.preventDefault();
      };
      document.addEventListener('click', listener);
      await user.click(within(dialog).getByRole('link', { name: 'Мои фото' }));
      document.removeEventListener('click', listener);

      expect(cancelled).toEqual([true]);
    });

    it.each([
      ['Выйти', 'signOut', 'profile-menu.sign-out'],
      ['Выйти со всех устройств', 'signOutEverywhere', 'profile-menu.sign-out-everywhere'],
    ] as const)(
      'signs out by «%s», sending the click with surface burger, then Signed Out',
      async (name, action, element) => {
        const { user, dialog } = await openMenu();
        mocks.track.mockClear();
        await user.click(within(dialog).getByRole('button', { name }));
        await vi.waitFor(() => expect(mocks.reset).toHaveBeenCalledTimes(1), { timeout: 5000 });
        expect(mocks[action]).toHaveBeenCalledTimes(1);
        expect(mocks.track.mock.calls).toEqual([
          ['Element Clicked', { element, zone: 'auth', type: 'interaction', surface: 'burger' }],
          ['Signed Out', {}],
        ]);
        await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      },
      15_000,
    );
  });

  describe('the catalog', () => {
    it('links «Все товары» to /catalog and each category to its encoded slug', async () => {
      const { dialog } = await openMenu();
      const catalog = within(dialog).getByRole('list', { name: 'Каталог' });
      expect(
        within(catalog)
          .getAllByRole('link')
          .map((link) => [link.textContent, link.getAttribute('href')]),
      ).toEqual([
        ['Все товары', '/catalog'],
        ['Платья', '/catalog/dresses'],
        ['Пальто', `/catalog/${encodeURIComponent('пальто & куртки')}`],
      ]);
    });

    it.each([
      ['Все товары', true],
      ['Платья', false],
    ])('sends the click on «%s» with all %s and closes the drawer', async (name, all) => {
      const { user, dialog } = await openMenu();
      mocks.track.mockClear();
      await user.click(within(dialog).getByRole('link', { name }));
      expect(mocks.track).toHaveBeenCalledExactlyOnceWith('Element Clicked', {
        element: 'burger.category',
        zone: 'header',
        type: 'navigation',
        all,
      });
      await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('lists only «Все товары» when there are no categories', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      render(<HeaderMenu categories={[]} />);
      await user.click(screen.getByRole('button', { name: 'Меню' }));
      const dialog = await screen.findByRole('dialog', { name: 'Меню' });
      expect(
        within(dialog)
          .getAllByRole('link')
          .map((l) => l.textContent),
      ).toEqual(['Все товары']);
    });
  });

  it('closes on Esc and returns the focus to the burger', async () => {
    const { user } = await openMenu();
    await user.keyboard('{Escape}');
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Меню' })).toHaveFocus();
  });
});
