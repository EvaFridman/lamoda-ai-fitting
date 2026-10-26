import { render, screen, within } from '@testing-library/react';
import { type ComponentType, isValidElement, type ReactElement, Suspense } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionState } from '@/entities/session';

const mocks = vi.hoisted(() => ({
  session: { status: 'signed-out', failed: false } as SessionState,
  read: vi.fn(),
  reportFailure: vi.fn(),
  connection: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: mocks.connection }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/customer/stores',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/shared/analytics/client', () => ({ identify: vi.fn(), track: vi.fn(), reset: vi.fn() }));
vi.mock('@/entities/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/session')>()),
  useSession: () => mocks.session,
}));
vi.mock('@/shared/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api')>()),
  reportFailure: mocks.reportFailure,
}));
vi.mock('@/entities/store/server', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/entities/store/server')>();
  return {
    ...original,
    // The real key, a read the test controls.
    storeListOptions: () => ({
      queryKey: original.storeListOptions().queryKey,
      queryFn: mocks.read,
    }),
  };
});
vi.mock('./stores-view', () => ({
  StoresView: () => <p>Список магазинов</p>,
  StoresSkeleton: () => <p>Заглушка магазинов</p>,
}));

import { storeListOptions } from '@/entities/store/server';
import { ApiError } from '@/shared/api';

import { StoresPage } from './stores-page';
import { StoresSkeleton, StoresView } from './stores-view';

type Server = (props: unknown) => Promise<ReactElement>;

function childrenOf(element: ReactElement): ReactElement[] {
  const children = (element.props as { children: ReactElement | ReactElement[] }).children;
  const list = Array.isArray(children) ? children : [children];
  expect(list.every((child) => isValidElement(child))).toBe(true);
  return list;
}

// The shell's content under Suspense is an async server component, which a jsdom render cannot run:
// the page is rendered without it, and the component is awaited the way Next does.
function suspenseOf(page: ReactElement): ReactElement {
  return childrenOf(page).find((child) => child.type === Suspense) as ReactElement;
}

function renderWithoutContent() {
  const page = StoresPage();
  const props = page.props as { children: ReactElement[] };
  const Shell = page.type as ComponentType<Record<string, unknown>>;
  return render(
    <Shell {...props}>{props.children.filter((child) => child.type !== Suspense)}</Shell>,
  );
}

async function resolveContent(): Promise<ReactElement> {
  const content = childrenOf(suspenseOf(StoresPage()))[0] as ReactElement;
  return (content.type as Server)(content.props);
}

describe('StoresPage', () => {
  beforeEach(() => {
    mocks.session = { status: 'signed-out', failed: false };
    mocks.read.mockReset();
    mocks.read.mockResolvedValue([]);
    mocks.reportFailure.mockReset();
    mocks.connection.mockReset();
    mocks.connection.mockResolvedValue(undefined);
  });

  describe('frame (AC3)', () => {
    it.each([
      ['pending', { status: 'pending' }],
      ['signed out', { status: 'signed-out', failed: false }],
      ['a failed read', { status: 'signed-out', failed: true }],
    ] as [string, SessionState][])(
      'shows the title and the legend and no invitation when %s',
      (_name, session) => {
        mocks.session = session;
        renderWithoutContent();
        expect(
          screen.getByRole('heading', { level: 1, name: 'Магазины Lamoda Sport' }),
        ).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'lamoda sport' })).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'lamoda sport outlet' })).toBeInTheDocument();
        expect(
          screen.getByText('Мультибрендовый розничный магазин спортивной одежды и обуви'),
        ).toBeInTheDocument();
        expect(
          screen.getByText('Спортивная одежда и обувь по сниженным ценам'),
        ).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Войти' })).not.toBeInTheDocument();
        expect(screen.queryByText(/Войдите/)).not.toBeInTheDocument();
        expect(document.querySelector('[aria-busy="true"]')).toBeNull();
      },
    );

    it('pairs each logo with its text in a description list', () => {
      renderWithoutContent();
      const terms = screen.getAllByRole('term');
      const definitions = screen.getAllByRole('definition');
      expect(terms).toHaveLength(2);
      expect(within(terms[0] as HTMLElement).getByRole('img')).toHaveAccessibleName('lamoda sport');
      expect(definitions[1]).toHaveTextContent('Спортивная одежда и обувь по сниженным ценам');
    });

    it('sits inside the account menu with the stores marked when signed in', () => {
      mocks.session = {
        status: 'signed-in',
        user: { id: 'u1', email: 'a@example.com', name: 'Анна' },
      };
      renderWithoutContent();
      const nav = screen.getByRole('navigation', { name: 'Личный кабинет' });
      expect(within(nav).getByRole('link', { name: 'Магазины' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(
        screen.getByRole('heading', { level: 1, name: 'Магазины Lamoda Sport' }),
      ).toBeInTheDocument();
    });
  });

  describe('content', () => {
    it('shows the skeleton in the Suspense fallback and reads nothing yet', () => {
      const fallback = (suspenseOf(StoresPage()).props as { fallback: ReactElement }).fallback;
      expect(fallback.type).toBe(StoresSkeleton);
      expect(mocks.read).not.toHaveBeenCalled();
    });

    it('waits for the request before it reads', async () => {
      await resolveContent();
      expect(mocks.connection).toHaveBeenCalledTimes(1);
    });

    it('hands the list it read to the view in a hydration boundary', async () => {
      mocks.read.mockResolvedValue([{ id: 'store' }]);
      const boundary = await resolveContent();
      const state = (
        boundary.props as {
          state: { queries: { queryKey: unknown[]; state: { data: unknown } }[] };
        }
      ).state;
      expect(state.queries).toHaveLength(1);
      expect(state.queries[0]?.queryKey).toEqual(storeListOptions().queryKey);
      expect(state.queries[0]?.state.data).toEqual([{ id: 'store' }]);
      expect(childrenOf(boundary)[0]?.type).toBe(StoresView);
      expect(mocks.reportFailure).not.toHaveBeenCalled();
    });

    it('reports a failed read, hydrates nothing and still shows the view', async () => {
      const failure = new ApiError('boom', { kind: 'network', template: '/stores', method: 'GET' });
      mocks.read.mockRejectedValue(failure);
      const boundary = await resolveContent();
      expect(mocks.reportFailure).toHaveBeenCalledWith(failure);
      expect((boundary.props as { state: { queries: unknown[] } }).state.queries).toHaveLength(0);
      expect(childrenOf(boundary)[0]?.type).toBe(StoresView);
    });
  });
});
