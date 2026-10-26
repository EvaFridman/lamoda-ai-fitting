import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { sections } from './sections';
import { UiKitPage } from './ui-kit-page';

describe('soon section', () => {
  it('is in the sections list with its title', () => {
    expect(sections.find((section) => section.id === 'soon')?.title).toBe('Скоро');
  });

  it('shows the chip alone and over two inert plain icons that keep their names', () => {
    render(<UiKitPage />);
    const region = screen.getByRole('region', { name: 'Скоро' });

    expect(within(region).getAllByText('скоро')).toHaveLength(3);
    for (const name of ['Избранное', 'Корзина']) {
      const button = within(region).getByRole('button', { name });
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveClass('plain');
      expect(button).toHaveTextContent('скоро');
    }
  });
});
