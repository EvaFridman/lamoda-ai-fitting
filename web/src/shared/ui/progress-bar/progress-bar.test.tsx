import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProgressBar } from './progress-bar';

describe('ProgressBar', () => {
  it('is a progressbar with the given name', () => {
    render(<ProgressBar value={64} aria-label="Примерка" />);
    expect(screen.getByRole('progressbar', { name: 'Примерка' })).toBeInTheDocument();
  });

  it.each([NaN, Infinity, -Infinity])('shows %s as aria-valuenow 0', (value) => {
    render(<ProgressBar value={value} aria-label="Примерка" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it.each([
    [64, '64'],
    [0, '0'],
    [100, '100'],
    [-5, '0'],
    [150, '100'],
  ])('shows %s as aria-valuenow %s', (value, now) => {
    render(<ProgressBar value={value} aria-label="Примерка" />);
    const bar = screen.getByRole('progressbar', { name: 'Примерка' });
    expect(bar).toHaveAttribute('aria-valuenow', now);
  });

  it("adds the page's class to the bar", () => {
    render(<ProgressBar value={10} aria-label="Примерка" className="mine" />);
    expect(screen.getByRole('progressbar')).toHaveClass('mine');
  });
});
