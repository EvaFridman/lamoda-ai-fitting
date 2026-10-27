import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fittingRoomKeys, type FittingRoom } from '@/entities/fitting-room';

const mocks = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  reset: vi.fn(),
  track: mocks.track,
}));

import { LookSubject } from './look-subject';

function renderSubject(room: FittingRoom | null) {
  const onChange = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  if (room) queryClient.setQueryData(fittingRoomKeys.all, room);
  else vi.stubGlobal('fetch', () => new Promise(() => undefined));
  render(
    <QueryClientProvider client={queryClient}>
      <LookSubject look={{ items: [], sum: 0 }} onChange={onChange} />
    </QueryClientProvider>,
  );
  return onChange;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LookSubject items (AC11)', () => {
  it('lists one card per item under «Образ · N вещей», with the sum and no strip', () => {
    vi.stubGlobal('fetch', () => new Promise(() => undefined));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <LookSubject
          look={{
            items: [
              {
                productId: 'p1',
                name: 'Рубашка',
                imageUrl: 'https://cdn.example/shirt.jpg',
                price: 5000,
                finalPrice: 4500,
                attributeValueId: 'c1',
                colour: 'Белый',
              },
              {
                productId: 'p2',
                name: 'Кеды',
                imageUrl: null,
                price: 3000,
                finalPrice: 3000,
                attributeValueId: null,
                colour: null,
              },
            ],
            sum: 7500,
          }}
          onChange={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Образ · 2 вещи')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    const shirt = screen.getByText('Рубашка').closest('li') as HTMLElement;
    expect(within(shirt).getByText('Белый')).toBeInTheDocument();
    expect(shirt).toHaveTextContent(/4\s500/);
    expect(shirt).toHaveTextContent(/5\s000/);
    expect(within(shirt).getByRole('button', { name: 'В корзину' })).toBeEnabled();
    expect(within(shirt).getByRole('button', { name: 'В избранное' })).toBeInTheDocument();
    const sneakers = screen.getByText('Кеды').closest('li') as HTMLElement;
    expect(sneakers).toHaveTextContent(/3\s000/);
    expect(within(sneakers).getByRole('button', { name: 'В избранное' })).toBeInTheDocument();
    expect(screen.getByText(/7\s500/)).toBeInTheDocument();
  });
});

describe('LookSubject «Изменить» (A94.4)', () => {
  it('sends room.open from the picker with the room’s count and goes back', async () => {
    const onChange = renderSubject({ items: [], count: 3, sum: 0 });

    await userEvent.setup().click(screen.getByRole('button', { name: 'Изменить' }));

    expect(mocks.track).toHaveBeenCalledWith(
      'Element Clicked',
      expect.objectContaining({ element: 'room.open', source: 'picker', items: 3 }),
    );
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('counts 0 items while the room is unread', async () => {
    const onChange = renderSubject(null);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Изменить' }));

    expect(mocks.track).toHaveBeenCalledWith(
      'Element Clicked',
      expect.objectContaining({ element: 'room.open', source: 'picker', items: 0 }),
    );
    expect(onChange).toHaveBeenCalledOnce();
  });
});
