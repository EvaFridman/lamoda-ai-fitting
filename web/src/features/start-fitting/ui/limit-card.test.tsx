import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EMPTY_ROOM, fittingRoomKeys, type FittingRoom } from '@/entities/fitting-room';

import { LimitCard } from './limit-card';

const mocks = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock('@/shared/analytics/client', () => ({ track: mocks.track }));
vi.mock('next/navigation', () => ({ usePathname: () => '/products/p' }));

const QUOTA = {
  limit: 20,
  used: 20,
  left: 0,
  renewsAt: '2026-10-31T21:00:00.000Z',
};

function renderCard(room: FittingRoom = EMPTY_ROOM, quota = QUOTA) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(fittingRoomKeys.all, room);
  const onOpenRoom = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <LimitCard quota={quota} historyHref="/customer/fittings" onOpenRoom={onOpenRoom} />
    </QueryClientProvider>,
  );
  return { onOpenRoom };
}

beforeEach(() => {
  mocks.track.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LimitCard', () => {
  it('says the month is spent and when the tries come back (AC19)', () => {
    renderCard();

    expect(
      screen.getByRole('heading', { name: 'Примерки на этот месяц закончились' }),
    ).toBeInTheDocument();
    expect(screen.getByText('1 ноября')).toBeInTheDocument();
    expect(screen.getByText(/Новые 20 примерок появятся/)).toBeInTheDocument();
  });

  it.each([
    [1, /Новая 1 примерка появится/],
    [21, /Новая 21 примерка появится/],
    [22, /Новые 22 примерки появятся/],
    [25, /Новые 25 примерок появятся/],
  ])('agrees the sentence with a limit of %i', (limit, text) => {
    renderCard(EMPTY_ROOM, { ...QUOTA, limit, used: limit });

    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('links to the history and has the fitting room button enabled', () => {
    renderCard();

    expect(screen.getByRole('link', { name: 'Открыть историю примерок' })).toHaveAttribute(
      'href',
      '/customer/fittings',
    );
    expect(screen.getByRole('button', { name: 'Перейти в примерочную' })).toBeEnabled();
  });

  it('asks its placer to open the room and tracks room.open from the limit with the count', async () => {
    const room: FittingRoom = { items: [], count: 3, sum: 0 };
    const { onOpenRoom } = renderCard(room);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Перейти в примерочную' }));

    expect(onOpenRoom).toHaveBeenCalledOnce();
    expect(mocks.track).toHaveBeenCalledExactlyOnceWith('Element Clicked', {
      element: 'room.open',
      zone: 'fitting',
      type: 'interaction',
      source: 'limit',
      items: 3,
    });
  });

  it('on a phone has the short button names and the meter at 0 of the limit', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(width < 600px)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    renderCard();

    expect(screen.getByRole('link', { name: 'История примерок' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Примерочная' })).toBeEnabled();
    expect(screen.getByText('0 из 20')).toBeInTheDocument();
  });

  it('shows no meter on a wide screen', () => {
    renderCard();

    expect(screen.queryByText('0 из 20')).not.toBeInTheDocument();
  });
});
