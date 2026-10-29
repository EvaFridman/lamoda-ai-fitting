import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { City } from '@/entities/store';
import { track } from '@/shared/analytics/client';

import { HeaderCity } from './header-city';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('@/shared/analytics/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/analytics/client')>()),
  track: vi.fn(),
}));

const cities: City[] = [
  { name: 'Москва', points: [[37.62, 55.75]] },
  { name: 'Казань', points: [[49.1, 55.79]] },
];

const PLACEHOLDER = 'Укажите ваш населенный пункт';

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(track).mockClear();
});

describe('HeaderCity', () => {
  it('shows the placeholder with no stored city, as a live button', () => {
    render(<HeaderCity cities={cities} />);
    const button = screen.getByRole('button', { name: PLACEHOLDER });
    expect(button).not.toHaveAttribute('aria-disabled');
    expect(button).toHaveAttribute('type', 'button');
  });

  it('shows the name of a stored city', () => {
    window.localStorage.setItem('city', 'Москва');
    render(<HeaderCity cities={cities} />);
    expect(screen.getByRole('button', { name: 'Москва' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: PLACEHOLDER })).not.toBeInTheDocument();
  });

  it('shows the placeholder for a stored city that is not among the cities', () => {
    window.localStorage.setItem('city', 'Атлантида');
    render(<HeaderCity cities={cities} />);
    expect(screen.getByRole('button', { name: PLACEHOLDER })).toBeInTheDocument();
  });

  it('opens «Ваш город» and sends city.open with source header', async () => {
    window.localStorage.setItem('city', 'Москва');
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<HeaderCity cities={cities} />);
    await user.click(screen.getByRole('button', { name: 'Москва' }));

    expect(await screen.findByRole('dialog', { name: 'Ваш город' })).toBeInTheDocument();
    expect(track).toHaveBeenCalledExactlyOnceWith(
      'Element Clicked',
      expect.objectContaining({ element: 'city.open', source: 'header', had_city: true }),
    );
  });

  it('sends had_city false with no city', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<HeaderCity cities={cities} />);
    await user.click(screen.getByRole('button', { name: PLACEHOLDER }));
    expect(track).toHaveBeenCalledExactlyOnceWith(
      'Element Clicked',
      expect.objectContaining({ element: 'city.open', source: 'header', had_city: false }),
    );
  });

  it('shows a picked city, closes the window and returns the focus to the button', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<HeaderCity cities={cities} />);
    await user.click(screen.getByRole('button', { name: PLACEHOLDER }));
    const modal = await screen.findByRole('dialog', { name: 'Ваш город' });
    await user.click(within(modal).getByRole('button', { name: 'Казань' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const button = screen.getByRole('button', { name: 'Казань' });
    expect(window.localStorage.getItem('city')).toBe('Казань');
    await vi.waitFor(() => expect(button).toHaveFocus());
  });

  it('takes a city chosen in another tab from the storage event (AC2)', () => {
    render(<HeaderCity cities={cities} />);
    expect(screen.getByRole('button', { name: PLACEHOLDER })).toBeInTheDocument();

    act(() => {
      window.localStorage.setItem('city', 'Казань');
      window.dispatchEvent(new StorageEvent('storage', { key: 'city', newValue: 'Казань' }));
    });

    expect(screen.getByRole('button', { name: 'Казань' })).toBeInTheDocument();
  });
});
