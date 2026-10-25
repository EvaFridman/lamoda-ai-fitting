import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionState } from '@/entities/session';

import { FittingComparePage } from './fitting-compare-page';

const mocks = vi.hoisted(() => ({
  session: { status: 'pending' } as SessionState,
  params: new URLSearchParams(),
}));

vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  track: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('@/entities/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/session')>()),
  useSession: () => mocks.session,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/customer/fittings/compare',
  useSearchParams: () => mocks.params,
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('@/features/auth/model/auth-actions', () => ({
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
  signOutEverywhere: vi.fn(),
}));

// The compare itself is tested with its widget: here only what the page hands it.
vi.mock('@/widgets/fitting-compare', () => ({
  FittingCompare: ({ a, b }: { a?: string; b?: string }) => (
    <p data-testid="compare">{`a=${a ?? '-'} b=${b ?? '-'}`}</p>
  ),
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

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-0000000000AB';

function signedIn() {
  mocks.session = { status: 'signed-in', user: { id: 'u1', email: 'u@example.com', name: 'Анна' } };
}

beforeEach(() => {
  mocks.session = { status: 'pending' };
  mocks.params = new URLSearchParams();
});

describe('FittingComparePage', () => {
  it('is titled «Сравнение» under «Мои примерки» with a way back to the history', () => {
    signedIn();
    render(<FittingComparePage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Сравнение' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← История примерок' })).toHaveAttribute(
      'href',
      '/customer/fittings',
    );
    expect(screen.getByRole('link', { name: 'Мои примерки' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('hands the compare the two uuids of the address', () => {
    signedIn();
    mocks.params = new URLSearchParams({ a: A, b: B });
    render(<FittingComparePage />);

    expect(screen.getByTestId('compare')).toHaveTextContent(`a=${A} b=${B}`);
  });

  it('takes the first value of a repeated parameter', () => {
    signedIn();
    mocks.params = new URLSearchParams(
      `a=${A}&b=${B}&b=00000000-0000-4000-8000-000000000003&a=not-an-id`,
    );
    render(<FittingComparePage />);

    expect(screen.getByTestId('compare')).toHaveTextContent(`a=${A} b=${B}`);
  });

  it.each([
    ['a missing b', { a: A }, `a=${A} b=-`],
    ['a non-uuid a', { a: 'not-an-id', b: B }, `a=- b=${B}`],
    ['an id with a path in it', { a: A, b: `${B}/../x` }, `a=${A} b=-`],
    ['nothing', {}, 'a=- b=-'],
  ])('leaves out an id that is not a uuid: %s', (_, query, handed) => {
    signedIn();
    mocks.params = new URLSearchParams(query);
    render(<FittingComparePage />);

    expect(screen.getByTestId('compare')).toHaveTextContent(handed);
  });

  it('shows the invitation and not the compare when signed out', () => {
    mocks.session = { status: 'signed-out', failed: false };
    mocks.params = new URLSearchParams({ a: A, b: B });
    render(<FittingComparePage />);

    expect(screen.getByRole('button', { name: 'Войти' })).toBeInTheDocument();
    expect(screen.queryByTestId('compare')).not.toBeInTheDocument();
  });
});
