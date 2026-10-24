import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LimitCard } from './limit-card';

const QUOTA = {
  limit: 20,
  used: 20,
  left: 0,
  renewsAt: '2026-10-31T21:00:00.000Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LimitCard', () => {
  it('says the month is spent and when the tries come back (AC19)', () => {
    render(<LimitCard quota={QUOTA} historyHref="/customer/fittings" />);

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
    render(<LimitCard quota={{ ...QUOTA, limit, used: limit }} historyHref="/customer/fittings" />);

    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('links to the history and keeps the fitting room off', () => {
    render(<LimitCard quota={QUOTA} historyHref="/customer/fittings" />);

    expect(screen.getByRole('link', { name: 'Открыть историю примерок' })).toHaveAttribute(
      'href',
      '/customer/fittings',
    );
    expect(screen.getByRole('button', { name: 'Перейти в примерочную' })).toBeDisabled();
  });

  it('on a phone has the short button names and the meter at 0 of the limit', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(width < 600px)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    render(<LimitCard quota={QUOTA} historyHref="/customer/fittings" />);

    expect(screen.getByRole('link', { name: 'История примерок' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Примерочная' })).toBeDisabled();
    expect(screen.getByText('0 из 20')).toBeInTheDocument();
  });

  it('shows no meter on a wide screen', () => {
    render(<LimitCard quota={QUOTA} historyHref="/customer/fittings" />);

    expect(screen.queryByText('0 из 20')).not.toBeInTheDocument();
  });
});
