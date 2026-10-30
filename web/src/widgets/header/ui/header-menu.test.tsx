import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as renderPlain, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionState } from '@/entities/session';
import type { City } from '@/entities/store';
import { errorText } from '@/shared/api';

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

const cities: City[] = [
  { name: 'Москва', points: [[37.62, 55.75]] },
  { name: 'Казань', points: [[49.1, 55.79]] },
];
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
  render(<HeaderMenu categories={categories} cities={cities} />);
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
    window.localStorage.clear();
  });

  it('is closed until the burger is pressed', () => {
    render(<HeaderMenu categories={categories} cities={cities} />);
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
    render(<HeaderMenu categories={categories} cities={cities} />);
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

  describe('the catalog heading', () => {
    const follows = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

    it('names the section and the list, after the sign-outs and before «Все товары», signed in', async () => {
      signedIn();
      const { dialog } = await openMenu();
      const heading = within(dialog).getByRole('heading', { name: 'Каталог' });
      expect(within(dialog).getByRole('region', { name: 'Каталог' })).toContainElement(heading);
      expect(within(dialog).getByRole('list', { name: 'Каталог' })).toHaveAccessibleName('Каталог');
      expect(follows(within(dialog).getByRole('button', { name: 'Выйти' }), heading)).toBe(true);
      expect(
        follows(within(dialog).getByRole('button', { name: 'Выйти со всех устройств' }), heading),
      ).toBe(true);
      expect(follows(heading, within(dialog).getByRole('link', { name: 'Все товары' }))).toBe(true);
    });

    it.each([false, true])(
      'stands between «Войти» and «Все товары» signed out (failed %s)',
      async (failed) => {
        mocks.session = { status: 'signed-out', failed };
        const { dialog } = await openMenu();
        const heading = within(dialog).getByRole('heading', { name: 'Каталог' });
        expect(follows(within(dialog).getByRole('button', { name: 'Войти' }), heading)).toBe(true);
        expect(follows(heading, within(dialog).getByRole('link', { name: 'Все товары' }))).toBe(
          true,
        );
      },
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
      render(<HeaderMenu categories={[]} cities={cities} />);
      await user.click(screen.getByRole('button', { name: 'Меню' }));
      const dialog = await screen.findByRole('dialog', { name: 'Меню' });
      expect(
        within(dialog)
          .getAllByRole('link')
          .map((l) => l.textContent),
      ).toEqual(['Все товары']);
    });
  });

  describe('the city', () => {
    it('puts the city row alone in its own list before the catalog list', async () => {
      const { dialog } = await openMenu();
      const city = within(dialog).getByRole('list', { name: 'Город' });
      const catalog = within(dialog).getByRole('list', { name: 'Каталог' });
      expect(
        within(city)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['Укажите ваш населенный пункт']);
      expect(
        within(catalog)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['Все товары', 'Платья', 'Пальто']);
      expect(city.compareDocumentPosition(catalog) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('reads «Город: Москва» with a stored city of the list', async () => {
      window.localStorage.setItem('city', 'Москва');
      const { dialog } = await openMenu();
      expect(within(dialog).getByRole('button', { name: 'Город: Москва' })).toBeInTheDocument();
    });

    it('reads a stored city that is not among the cities as none', async () => {
      window.localStorage.setItem('city', 'Атлантида');
      const { dialog } = await openMenu();
      expect(
        within(dialog).getByRole('button', { name: 'Укажите ваш населенный пункт' }),
      ).toBeInTheDocument();
      expect(dialog).not.toHaveTextContent('Атлантида');
    });

    it('closes the drawer, opens «Ваш город» and sends city.open with source burger', async () => {
      window.localStorage.setItem('city', 'Москва');
      const { user, dialog } = await openMenu();
      mocks.track.mockClear();
      await user.click(within(dialog).getByRole('button', { name: 'Город: Москва' }));

      expect(await screen.findByRole('dialog', { name: 'Ваш город' })).toBeInTheDocument();
      await vi.waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Меню' })).not.toBeInTheDocument(),
      );
      expect(mocks.track).toHaveBeenCalledExactlyOnceWith(
        'Element Clicked',
        expect.objectContaining({ element: 'city.open', source: 'burger', had_city: true }),
      );
    });

    it('stores a picked city, returns the focus to the burger and shows it in the row', async () => {
      const { user, dialog } = await openMenu();
      await user.click(
        within(dialog).getByRole('button', { name: 'Укажите ваш населенный пункт' }),
      );
      const modal = await screen.findByRole('dialog', { name: 'Ваш город' });
      await user.click(within(modal).getByRole('button', { name: 'Казань' }));

      expect(window.localStorage.getItem('city')).toBe('Казань');
      await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await vi.waitFor(() => expect(document.getElementById(BURGER_ID)).toHaveFocus());

      await user.click(screen.getByRole('button', { name: 'Меню' }));
      const reopened = await screen.findByRole('dialog', { name: 'Меню' });
      expect(within(reopened).getByRole('button', { name: 'Город: Казань' })).toBeInTheDocument();
    });

    it('says the read failed, with no list, when the cities are null', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      render(<HeaderMenu categories={categories} cities={null} />);
      await user.click(screen.getByRole('button', { name: 'Меню' }));
      const dialog = await screen.findByRole('dialog', { name: 'Меню' });
      await user.click(
        within(dialog).getByRole('button', { name: 'Укажите ваш населенный пункт' }),
      );
      const modal = await screen.findByRole('dialog', { name: 'Ваш город' });
      expect(within(modal).queryByRole('list')).not.toBeInTheDocument();
      expect(within(modal).queryByRole('button', { name: 'Москва' })).not.toBeInTheDocument();
      expect(modal).toHaveTextContent(errorText(undefined));
    });
  });

  describe('the results not yet seen (spec 0024 AC30)', () => {
    const fetchMock = vi.fn();

    function quotaWith(unseen: number) {
      fetchMock.mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              limit: 20,
              used: 3,
              left: 17,
              renewsAt: '2026-10-31T21:00:00.000Z',
              unseen,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        ),
      );
      vi.stubGlobal('fetch', fetchMock);
    }

    beforeEach(() => {
      queryClient.clear();
      fetchMock.mockReset();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('draws the count on the burger and says it in its name', async () => {
      quotaWith(3);
      signedIn();
      render(<HeaderMenu categories={categories} cities={cities} />);

      const burger = await screen.findByRole('button', { name: 'Меню, 3 новые примерки' });
      expect(burger).toHaveAttribute('id', BURGER_ID);
      expect(within(burger).getByText('3')).toHaveAttribute('aria-hidden', 'true');
    });

    it('draws «9+» past nine', async () => {
      quotaWith(14);
      signedIn();
      render(<HeaderMenu categories={categories} cities={cities} />);

      const burger = await screen.findByRole('button', {
        name: 'Меню, больше 9 новых примерок',
      });
      expect(burger).toHaveTextContent('9+');
    });

    it('draws no badge with nothing unseen', async () => {
      quotaWith(0);
      signedIn();
      render(<HeaderMenu categories={categories} cities={cities} />);

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      expect(screen.getByRole('button', { name: 'Меню' }).textContent).toBe('');
    });

    it('counts «Мои примерки» in the drawer and no other row', async () => {
      quotaWith(3);
      signedIn();
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      render(<HeaderMenu categories={categories} cities={cities} />);
      await user.click(await screen.findByRole('button', { name: 'Меню, 3 новые примерки' }));
      const dialog = await screen.findByRole('dialog', { name: 'Меню' });

      const row = within(dialog).getByRole('link', { name: 'Мои примерки, 3 новые примерки' });
      expect(row).toHaveTextContent('Мои примерки3');
      expect(row).toHaveAttribute('href', '/customer/fittings');
      expect(within(dialog).getByRole('link', { name: 'Мои данные' })).toHaveTextContent(
        /^Мои данные$/,
      );
    });

    it('shows «9+» on the drawer’s row past nine', async () => {
      quotaWith(30);
      signedIn();
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      render(<HeaderMenu categories={categories} cities={cities} />);
      await user.click(
        await screen.findByRole('button', { name: 'Меню, больше 9 новых примерок' }),
      );
      const dialog = await screen.findByRole('dialog', { name: 'Меню' });

      expect(
        within(dialog).getByRole('link', { name: 'Мои примерки, больше 9 новых примерок' }),
      ).toHaveTextContent('Мои примерки9+');
    });

    it('draws nothing and reads no quota when signed out', async () => {
      quotaWith(3);
      mocks.session = { status: 'signed-out', failed: false };
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      render(<HeaderMenu categories={categories} cities={cities} />);
      const burger = screen.getByRole('button', { name: 'Меню' });
      expect(burger.textContent).toBe('');
      await user.click(burger);
      const dialog = await screen.findByRole('dialog', { name: 'Меню' });

      expect(within(dialog).queryByRole('link', { name: /Мои примерки/ })).not.toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it('closes on Esc and returns the focus to the burger', async () => {
    const { user } = await openMenu();
    await user.keyboard('{Escape}');
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Меню' })).toHaveFocus();
  });
});
