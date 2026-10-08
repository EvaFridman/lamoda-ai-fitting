import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { OverlaysSection } from './overlays-section';
import { sections } from './sections';

describe('OverlaysSection', () => {
  it('is registered in the sections list', () => {
    expect(sections.map(({ id }) => id)).toContain('overlays');
  });

  it('renders the triggers with no window open', () => {
    render(<OverlaysSection />);

    for (const name of ['Удалить товар', 'Таблица размеров', 'Корзина', 'Пункты выдачи']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Как считается цена' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the delete modal with its title and closes it with "Отмена"', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<OverlaysSection />);

    const trigger = screen.getByRole('button', { name: 'Удалить товар' });
    await user.click(trigger);
    await screen.findByRole('dialog', { name: 'Удалить товар из корзины?' });
    await vi.waitFor(() =>
      expect(screen.getByRole('dialog')).not.toHaveAttribute('data-starting-style'),
    );

    await user.click(screen.getByRole('button', { name: 'Отмена' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('opens the cart drawer', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<OverlaysSection />);

    const trigger = screen.getByRole('button', { name: 'Корзина' });
    await user.click(trigger);
    await screen.findByRole('dialog', { name: 'Корзина' });
  });
});
