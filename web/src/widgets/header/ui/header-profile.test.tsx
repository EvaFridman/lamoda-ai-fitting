import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as renderPlain, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionState } from '@/entities/session';
import { userKeys } from '@/entities/user';

import { HeaderProfile } from './header-profile';

let queryClient = new QueryClient();

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
  identify: vi.fn(),
  reset: vi.fn(),
  track: vi.fn(),
}));

vi.mock('@/shared/analytics/client', () => ({
  identify: mocks.identify,
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

const EMAIL = 'anna.private@example.com';
const NAME = 'Анна Секретная';

function signedIn(name: string | null) {
  mocks.session = { status: 'signed-in', user: { id: 'u1', email: EMAIL, name } };
}

function attributeValues(container: ParentNode): string[] {
  return Array.from(container.querySelectorAll('*')).flatMap((element) =>
    Array.from(element.attributes, (attribute) => attribute.value),
  );
}

async function openMenu() {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  const trigger = screen.getByRole('button', { name: 'Профиль' });
  await vi.waitFor(async () => {
    if (trigger.getAttribute('aria-expanded') !== 'true') await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
  return { user, menu: await screen.findByRole('menu') };
}

describe('HeaderProfile', () => {
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mocks.session = { status: 'pending' };
    mocks.signOut.mockReset().mockResolvedValue(undefined);
    mocks.signOutEverywhere.mockReset().mockResolvedValue(undefined);
    mocks.signInWithGoogle.mockReset().mockResolvedValue(undefined);
    mocks.replace.mockReset();
    mocks.identify.mockReset();
    mocks.reset.mockReset();
    mocks.track.mockReset();
    mocks.params = new URLSearchParams();
    window.sessionStorage.clear();
  });

  it('identifies a signed-in user by the id alone, not the email or name', () => {
    signedIn(NAME);
    render(<HeaderProfile />);
    expect(mocks.identify).toHaveBeenCalledExactlyOnceWith('u1', { signedIn: false });
  });

  it('identifies with signedIn when this tab started the sign-in', () => {
    window.sessionStorage.setItem('sign-in-started', String(Date.now()));
    signedIn(NAME);
    render(<HeaderProfile />);
    expect(mocks.identify).toHaveBeenCalledExactlyOnceWith('u1', { signedIn: true });
  });

  it('does not identify while loading or signed out, and resets only once signed out', () => {
    const { rerender } = render(<HeaderProfile />);
    expect(mocks.reset).not.toHaveBeenCalled();
    mocks.session = { status: 'signed-out', failed: false };
    rerender(<HeaderProfile />);
    expect(mocks.identify).not.toHaveBeenCalled();
    expect(mocks.reset).toHaveBeenCalledTimes(1);
  });

  it('does not reset when signed out because the read failed', () => {
    mocks.session = { status: 'signed-out', failed: true };
    render(<HeaderProfile />);
    expect(mocks.reset).not.toHaveBeenCalled();
    expect(mocks.identify).not.toHaveBeenCalled();
  });

  it('does not reset while signed in', () => {
    signedIn(NAME);
    render(<HeaderProfile />);
    expect(mocks.reset).not.toHaveBeenCalled();
  });

  it('drops a failed sign-in left in the address when signed in, without the modal', () => {
    signedIn(NAME);
    mocks.params = new URLSearchParams('a=1&error=access_denied');
    render(<HeaderProfile />);
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/page?a=1', { scroll: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not touch the address when signed in without an error param', () => {
    signedIn(NAME);
    mocks.params = new URLSearchParams('a=1');
    render(<HeaderProfile />);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('draws an inert icon while the session loads', async () => {
    const user = userEvent.setup();
    render(<HeaderProfile />);
    const button = screen.getByRole('button', { name: 'Профиль' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('type', 'button');
    await user.click(button);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens the login modal when signed out', async () => {
    mocks.session = { status: 'signed-out', failed: false };
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<HeaderProfile />);
    const button = screen.getByRole('button', { name: 'Профиль' });
    expect(button).not.toHaveAttribute('aria-disabled', 'true');
    await user.click(button);
    const dialog = await screen.findByRole('dialog', { name: 'Вход' });
    expect(within(dialog).getByRole('button', { name: 'Войти через Google' })).toBeInTheDocument();
  });

  it('opens the profile menu with the items in order when signed in', async () => {
    signedIn(NAME);
    render(<HeaderProfile />);
    const { menu } = await openMenu();
    expect(
      within(menu)
        .getAllByRole('menuitem')
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
    expect(within(menu).getAllByRole('separator')).toHaveLength(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('links the five sections to the account and leaves every item enabled (0017 AC2)', async () => {
    signedIn(NAME);
    render(<HeaderProfile />);
    const { menu } = await openMenu();
    for (const [name, href] of [
      ['Мои заказы', '/customer/orders'],
      ['Магазины', '/customer/stores'],
      ['Мои данные', '/customer/account'],
      ['Мои примерки', '/customer/fittings'],
      ['Мои фото', '/customer/photos'],
    ]) {
      const item = within(menu).getByRole('menuitem', { name });
      expect(item.tagName).toBe('A');
      expect(item).toHaveAttribute('href', href);
      expect(item).not.toHaveAttribute('aria-disabled');
    }
    for (const name of ['Выйти', 'Выйти со всех устройств']) {
      expect(within(menu).getByRole('menuitem', { name })).not.toHaveAttribute(
        'aria-disabled',
        'true',
      );
    }
  });

  it('sends the click on a section link with its section value', async () => {
    signedIn(NAME);
    render(<HeaderProfile />);
    const { user, menu } = await openMenu();
    await user.click(within(menu).getByRole('menuitem', { name: 'Мои данные' }));
    expect(mocks.track).toHaveBeenCalledExactlyOnceWith('Element Clicked', {
      element: 'profile-menu.section',
      zone: 'auth',
      type: 'navigation',
      section: 'data',
    });
  });

  it('opens from the keyboard, moves over the section links and follows one with Enter', async () => {
    signedIn(NAME);
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<HeaderProfile />);
    const trigger = screen.getByRole('button', { name: 'Профиль' });
    const highlighted = () =>
      screen.queryAllByRole('menuitem').find((item) => item.hasAttribute('data-highlighted'))
        ?.textContent;
    await vi.waitFor(async () => {
      if (trigger.getAttribute('aria-expanded') !== 'true') {
        trigger.focus();
        await user.keyboard('{ArrowDown}');
      }
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });
    await vi.waitFor(() => expect(highlighted()).toBe('Мои заказы'));
    await vi.waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'Мои заказы' })).toHaveFocus(),
    );

    await user.keyboard('{ArrowDown}');
    await vi.waitFor(() => expect(highlighted()).toBe('Магазины'));
    const stores = screen.getByRole('menuitem', { name: 'Магазины' });
    expect(stores).toHaveAttribute('href', '/customer/stores');
    await vi.waitFor(() => expect(stores).toHaveFocus());

    await user.keyboard('{Enter}');
    await vi.waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(mocks.track).toHaveBeenCalledExactlyOnceWith(
      'Element Clicked',
      expect.objectContaining({ element: 'profile-menu.section', section: 'stores' }),
    );
  });

  it.each([
    ['Мои заказы', 'orders'],
    ['Магазины', 'stores'],
    ['Мои примерки', 'fittings'],
  ])('sends the section of "%s" as %s', async (name, section) => {
    signedIn(NAME);
    render(<HeaderProfile />);
    const { user, menu } = await openMenu();
    await user.click(within(menu).getByRole('menuitem', { name }));
    expect(mocks.track).toHaveBeenCalledExactlyOnceWith(
      'Element Clicked',
      expect.objectContaining({ element: 'profile-menu.section', section }),
    );
  });

  it('puts the separator between the pages and the sign-outs', async () => {
    signedIn(NAME);
    render(<HeaderProfile />);
    const { menu } = await openMenu();
    const separator = within(menu).getByRole('separator');
    const items = within(menu).getAllByRole('menuitem');
    const position = (node: Node) =>
      items.filter((item) => node.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_PRECEDING)
        .length;
    expect(position(separator)).toBe(5);
  });

  it('shows the initial and the name in a block the recordings skip', async () => {
    signedIn(NAME);
    render(<HeaderProfile />);
    const { menu } = await openMenu();
    const name = within(menu).getByText(NAME);
    expect(name.closest('.mp-block')).not.toBeNull();
    expect(within(menu).getByText('А')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows the email first letter and "Профиль" for a user without a name', async () => {
    signedIn(null);
    render(<HeaderProfile />);
    const { menu } = await openMenu();
    expect(within(menu).getByText('A')).toBeInTheDocument();
    expect(within(menu).getByText('Профиль')).toBeInTheDocument();
  });

  it.each([NAME, null])(
    'renders neither the email nor the name in an attribute (name %s)',
    async (name) => {
      signedIn(name);
      const { baseElement } = render(<HeaderProfile />);
      const { menu } = await openMenu();
      expect(menu).not.toHaveTextContent(EMAIL);
      expect(baseElement).not.toHaveTextContent('example.com');
      const values = attributeValues(baseElement);
      expect(values.some((value) => value.includes('example.com'))).toBe(false);
      expect(values.some((value) => value.includes('anna.private'))).toBe(false);
      expect(values.some((value) => value.includes('Секретная'))).toBe(false);
    },
  );

  it('runs the matching action for each sign-out item', async () => {
    signedIn(NAME);
    render(<HeaderProfile />);
    const { user, menu } = await openMenu();
    await user.click(within(menu).getByRole('menuitem', { name: 'Выйти со всех устройств' }));
    expect(mocks.signOutEverywhere).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('signs out this browser with "Выйти"', async () => {
    signedIn(NAME);
    render(<HeaderProfile />);
    const { user, menu } = await openMenu();
    await user.click(within(menu).getByRole('menuitem', { name: 'Выйти' }));
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.signOutEverywhere).not.toHaveBeenCalled();
  });

  describe("the current user's cached answers (spec 0017 U22)", () => {
    const cached = { id: 'u1' };

    it('are dropped once the session ends', () => {
      signedIn(NAME);
      queryClient.setQueryData(userKeys.me, cached);
      const { rerender } = render(<HeaderProfile />);
      expect(queryClient.getQueryData(userKeys.me)).toBe(cached);
      mocks.session = { status: 'signed-out', failed: false };
      rerender(<HeaderProfile />);
      expect(queryClient.getQueryData(userKeys.me)).toBeUndefined();
      expect(queryClient.getQueryCache().find({ queryKey: userKeys.me })).toBeUndefined();
    });

    it('stay when signed out because the read failed', () => {
      queryClient.setQueryData(userKeys.me, cached);
      mocks.session = { status: 'signed-out', failed: true };
      render(<HeaderProfile />);
      expect(queryClient.getQueryData(userKeys.me)).toBe(cached);
    });

    it('stay while signed in and while the session loads', () => {
      queryClient.setQueryData(userKeys.me, cached);
      const { rerender } = render(<HeaderProfile />);
      signedIn(NAME);
      rerender(<HeaderProfile />);
      expect(queryClient.getQueryData(userKeys.me)).toBe(cached);
    });
  });

  describe('focus after a sign-out', () => {
    it('returns to the icon when it was left on the page', () => {
      signedIn(NAME);
      const { rerender } = render(<HeaderProfile />);
      expect(document.body).toHaveFocus();
      mocks.session = { status: 'signed-out', failed: false };
      rerender(<HeaderProfile />);
      expect(screen.getByRole('button', { name: 'Профиль' })).toHaveFocus();
    });

    it('stays where it is when it was on another element', () => {
      signedIn(NAME);
      const { rerender } = render(
        <>
          <button type="button">Другая кнопка</button>
          <HeaderProfile />
        </>,
      );
      const other = screen.getByRole('button', { name: 'Другая кнопка' });
      other.focus();
      mocks.session = { status: 'signed-out', failed: false };
      rerender(
        <>
          <button type="button">Другая кнопка</button>
          <HeaderProfile />
        </>,
      );
      expect(other).toHaveFocus();
      expect(screen.getByRole('button', { name: 'Профиль' })).not.toHaveFocus();
    });

    it('is not taken when the visitor was never signed in', () => {
      mocks.session = { status: 'pending' };
      const { rerender } = render(<HeaderProfile />);
      mocks.session = { status: 'signed-out', failed: false };
      rerender(<HeaderProfile />);
      expect(document.body).toHaveFocus();
    });
  });
});
