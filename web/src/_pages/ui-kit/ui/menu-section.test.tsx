import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MenuSection } from './menu-section';
import { sections } from './sections';

describe('MenuSection', () => {
  it('is registered in the page sections', () => {
    const section = sections.find((item) => item.id === 'menu');

    expect(section?.title).toBe('Меню');
    expect(section?.Content).toBe(MenuSection);
  });

  it('shows both triggers collapsed and no menu on load', () => {
    render(<MenuSection />);

    expect(screen.getByRole('button', { name: 'Действия с заказом' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Профиль' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('has the MenuLinkItem example with its trigger collapsed', () => {
    render(<MenuSection />);

    expect(screen.getByRole('button', { name: 'Разделы страницы' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByText('MenuLinkItem')).toBeInTheDocument();
  });
});
