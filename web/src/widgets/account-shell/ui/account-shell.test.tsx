import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionState } from '@/entities/session';

import { AccountShell } from './account-shell';

const mocks = vi.hoisted(() => ({
  session: { status: 'pending' } as SessionState,
  track: vi.fn(),
  params: new URLSearchParams(),
}));

vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  track: mocks.track,
  reset: vi.fn(),
}));

vi.mock('@/entities/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/session')>()),
  useSession: () => mocks.session,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/customer/orders',
  useSearchParams: () => mocks.params,
  useRouter: () => ({ replace: vi.fn() }),
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
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
  signOutEverywhere: vi.fn(),
}));

const EMAIL = 'anna.private@example.com';
const NAME = 'Анна Секретная';
const CHILD = 'Содержимое раздела';
const INVITE = 'Войдите, чтобы открыть личный кабинет';

function signedIn() {
  mocks.session = { status: 'signed-in', user: { id: 'u1', email: EMAIL, name: NAME } };
}

// The back link is hidden on wide screens by CSS, which jsdom applies without a media query, so it
// has no accessible name here: it is found by its address.
function backLink() {
  return screen
    .queryAllByRole('link', { hidden: true })
    .find((link) => link.getAttribute('href') === '/customer');
}

describe('AccountShell', () => {
  beforeEach(() => {
    mocks.session = { status: 'pending' };
    mocks.track.mockReset();
    mocks.params = new URLSearchParams();
  });

  describe('content by session', () => {
    it('shows the title and a busy placeholder while the session loads', () => {
      render(<AccountShell section="orders">{CHILD}</AccountShell>);
      expect(screen.getByRole('heading', { level: 1, name: 'Мои заказы' })).toBeInTheDocument();
      expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
      expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
      expect(screen.queryByText(INVITE)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Войти' })).not.toBeInTheDocument();
    });

    it.each([false, true])(
      'replaces the content with the invitation when signed out (failed: %s)',
      (failed) => {
        mocks.session = { status: 'signed-out', failed };
        render(<AccountShell section="data">{CHILD}</AccountShell>);
        expect(screen.getByRole('heading', { level: 1, name: 'Мои данные' })).toBeInTheDocument();
        expect(screen.getByText(INVITE)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Войти' })).toBeInTheDocument();
        expect(screen.queryByText(CHILD)).not.toBeInTheDocument();
        expect(document.querySelector('[aria-busy="true"]')).toBeNull();
      },
    );

    it('opens the login modal from the invitation and reports the click and the opening', async () => {
      mocks.session = { status: 'signed-out', failed: false };
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      render(<AccountShell section="orders">{CHILD}</AccountShell>);
      await user.click(screen.getByRole('button', { name: 'Войти' }));
      const dialog = await screen.findByRole('dialog', { name: 'Вход' });
      expect(
        within(dialog).getByRole('button', { name: 'Войти через Google' }),
      ).toBeInTheDocument();
      expect(mocks.track).toHaveBeenCalledWith('Element Clicked', {
        element: 'account-invite.sign-in',
        zone: 'account',
        type: 'interaction',
      });
      expect(mocks.track).toHaveBeenCalledWith('Login Opened', expect.anything());
    });

    // The header's modal handles a sign-in error in the address; a second dialog would open twice.
    it('keeps the invitation modal closed when the address carries a sign-in error', () => {
      mocks.session = { status: 'signed-out', failed: false };
      mocks.params = new URLSearchParams('error=access_denied');
      render(<AccountShell section="orders">{CHILD}</AccountShell>);
      expect(screen.getByRole('button', { name: 'Войти' })).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('shows the children and no invitation when signed in', () => {
      signedIn();
      render(<AccountShell section="stores">{CHILD}</AccountShell>);
      expect(screen.getByRole('heading', { level: 1, name: 'Магазины' })).toBeInTheDocument();
      expect(screen.getByText(CHILD)).toBeInTheDocument();
      expect(screen.queryByText(INVITE)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Войти' })).not.toBeInTheDocument();
    });

    it('renders no user data when signed in', () => {
      signedIn();
      const { baseElement } = render(<AccountShell section="data" />);
      expect(baseElement).not.toHaveTextContent('example.com');
      expect(baseElement).not.toHaveTextContent('Секретная');
      const values = Array.from(baseElement.querySelectorAll('*')).flatMap((element) =>
        Array.from(element.attributes, (attribute) => attribute.value),
      );
      expect(values.some((value) => /anna|example\.com|Секретная/.test(value))).toBe(false);
    });
  });

  describe('aside', () => {
    const ASIDE = 'Лимит под меню';

    it('shows the block under the menu when signed in', () => {
      signedIn();
      render(
        <AccountShell section="fittings" aside={<p>{ASIDE}</p>}>
          {CHILD}
        </AccountShell>,
      );
      expect(screen.getByText(ASIDE)).toBeInTheDocument();
    });

    it('shows nothing while the session loads', () => {
      render(
        <AccountShell section="fittings" aside={<p>{ASIDE}</p>}>
          {CHILD}
        </AccountShell>,
      );
      expect(screen.queryByText(ASIDE)).not.toBeInTheDocument();
    });

    it.each([false, true])('shows nothing when signed out (failed: %s)', (failed) => {
      mocks.session = { status: 'signed-out', failed };
      render(
        <AccountShell section="fittings" aside={<p>{ASIDE}</p>}>
          {CHILD}
        </AccountShell>,
      );
      expect(screen.queryByText(ASIDE)).not.toBeInTheDocument();
    });
  });

  describe('title and back', () => {
    it('shows its own title in place of the section title', () => {
      signedIn();
      render(
        <AccountShell section="fittings" title="Сравнение">
          {CHILD}
        </AccountShell>,
      );
      expect(screen.getByRole('heading', { level: 1, name: 'Сравнение' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Мои примерки' })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Мои примерки' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    });

    it('shows its own back in place of «Личный кабинет»', () => {
      signedIn();
      render(
        <AccountShell section="fittings" back={<a href="/customer/fittings">← История</a>}>
          {CHILD}
        </AccountShell>,
      );
      expect(screen.getByRole('link', { name: '← История' })).toBeInTheDocument();
      expect(backLink()).toBeUndefined();
    });

    it('keeps the section title and the back to the list without them', () => {
      render(<AccountShell section="fittings" />);
      expect(screen.getByRole('heading', { level: 1, name: 'Мои примерки' })).toBeInTheDocument();
      expect(backLink()).toBeDefined();
    });
  });

  describe('menu', () => {
    it('lists the five sections in order with their links', () => {
      signedIn();
      render(<AccountShell section="orders" />);
      const nav = screen.getByRole('navigation', { name: 'Личный кабинет' });
      const links = within(nav).getAllByRole('link');
      expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
        ['Мои заказы', '/customer/orders'],
        ['Магазины', '/customer/stores'],
        ['Мои данные', '/customer/account'],
        ['Мои примерки', '/customer/fittings'],
        ['Мои фото', '/customer/photos'],
      ]);
    });

    it.each([
      ['orders', 'Мои заказы'],
      ['stores', 'Магазины'],
      ['data', 'Мои данные'],
      ['fittings', 'Мои примерки'],
      ['photos', 'Мои фото'],
    ] as const)('marks only the link of the %s section as current', (section, title) => {
      render(<AccountShell section={section} />);
      const nav = screen.getByRole('navigation', { name: 'Личный кабинет' });
      for (const link of within(nav).getAllByRole('link')) {
        if (link.textContent === title) expect(link).toHaveAttribute('aria-current', 'page');
        else expect(link).not.toHaveAttribute('aria-current');
      }
    });

    it('has no current link, a title and no back link without a section', () => {
      render(<AccountShell />);
      const nav = screen.getByRole('navigation', { name: 'Личный кабинет' });
      for (const link of within(nav).getAllByRole('link')) {
        expect(link).not.toHaveAttribute('aria-current');
      }
      expect(screen.getByRole('heading', { level: 1, name: 'Личный кабинет' })).toBeInTheDocument();
      expect(backLink()).toBeUndefined();
    });

    it('has a back link to the list beside a section', () => {
      render(<AccountShell section="fittings" />);
      const back = backLink();
      expect(back).toHaveTextContent('Личный кабинет');
      expect(back).toHaveAttribute('href', '/customer');
    });

    it('sends the clicked section with its value', async () => {
      const user = userEvent.setup();
      render(<AccountShell section="orders" />);
      await user.click(screen.getByRole('link', { name: 'Мои примерки' }));
      expect(mocks.track).toHaveBeenCalledExactlyOnceWith('Element Clicked', {
        element: 'account-menu.section',
        zone: 'account',
        type: 'navigation',
        section: 'fittings',
      });
    });

    it('sends the click on the back link', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      render(<AccountShell section="orders" />);
      const back = backLink();
      expect(back).toBeDefined();
      await user.click(back as HTMLElement);
      expect(mocks.track).toHaveBeenCalledExactlyOnceWith('Element Clicked', {
        element: 'account-menu.back',
        zone: 'account',
        type: 'navigation',
      });
    });
  });
});
