import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OrderStatus } from '@/shared/ui';

describe('OrderStatus', () => {
  it('reads the title and the date as one paragraph', () => {
    const { container } = render(<OrderStatus title="Доставлен" date="5 октября" />);

    expect(container.querySelector('p')?.textContent).toBe('Доставлен 5 октября');
  });

  it('shows only the title without a date', () => {
    const { container } = render(<OrderStatus title="Оформлен" />);

    expect(container.querySelector('p')?.textContent).toBe('Оформлен');
  });

  it('is primary by default and takes the class of the tone given', () => {
    const primary = render(<OrderStatus title="Доставлен" />);
    expect(screen.getByText('Доставлен')).toHaveClass('primary');
    primary.unmount();

    render(<OrderStatus title="Не выкуплен" tone="warning" />);
    expect(screen.getByText('Не выкуплен')).toHaveClass('warning');
    expect(screen.getByText('Не выкуплен')).not.toHaveClass('primary');
  });
});
