import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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
