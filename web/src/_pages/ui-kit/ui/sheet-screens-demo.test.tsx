import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SheetScreensDemo } from './sheet-screens-demo';

// See drawer.test.tsx: the styles that give pointer events back to the sheet are not loaded in jsdom.
const setup = () => userEvent.setup({ pointerEventsCheck: 0 });

async function openColorScreen(user: ReturnType<typeof setup>) {
  await user.click(screen.getByRole('button', { name: 'Шторка с экранами' }));
  await user.click(await screen.findByRole('button', { name: 'Цвет' }));
  return screen.findByRole('dialog', { name: 'Цвет' });
}

describe('sheet screens demo', () => {
  it('opens on the list with the ×, no "‹" and the footer button', async () => {
    const user = setup();
    render(<SheetScreensDemo />);

    await user.click(screen.getByRole('button', { name: 'Шторка с экранами' }));

    expect(await screen.findByRole('dialog', { name: 'Фильтры' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Закрыть' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Назад/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Показать 128 товаров' })).toBeInTheDocument();
  });

  it('the colour screen has "‹", "Сбросить" and "Применить" and no ×, and the focus is on "‹"', async () => {
    const user = setup();
    render(<SheetScreensDemo />);

    await openColorScreen(user);

    const back = screen.getByRole('button', { name: 'Назад к фильтрам' });
    expect(back).toHaveAccessibleDescription('Цвет');
    await vi.waitFor(() => expect(back).toHaveFocus());
    expect(screen.queryByRole('button', { name: 'Закрыть' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сбросить' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Применить' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Поиск: Цвет' })).toBeInTheDocument();
  });

  it('"Сбросить" clears the ticked colours', async () => {
    const user = setup();
    render(<SheetScreensDemo />);
    await openColorScreen(user);

    await user.click(screen.getByRole('checkbox', { name: 'Черный 48210' }));
    expect(screen.getByRole('checkbox', { name: 'Черный 48210' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Сбросить' }));

    expect(screen.getByRole('checkbox', { name: 'Черный 48210' })).not.toBeChecked();
  });

  it('"‹" goes back to the list, keeps the colours and returns the focus to the "Цвет" button', async () => {
    const user = setup();
    render(<SheetScreensDemo />);
    await openColorScreen(user);

    await user.click(screen.getByRole('checkbox', { name: 'Синий 9318' }));
    await user.click(screen.getByRole('button', { name: 'Назад к фильтрам' }));

    const row = await screen.findByRole('button', { name: 'Цвет: 1' });
    await vi.waitFor(() => expect(row).toHaveFocus());
    expect(screen.getByRole('dialog', { name: 'Фильтры' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Закрыть' })).toBeInTheDocument();
  });

  it('"Применить" goes back to the list too', async () => {
    const user = setup();
    render(<SheetScreensDemo />);
    await openColorScreen(user);

    await user.click(screen.getByRole('button', { name: 'Применить' }));

    expect(await screen.findByRole('dialog', { name: 'Фильтры' })).toBeInTheDocument();
  });

  it('Esc closes it even without the ×, and reopening starts on the list', async () => {
    const user = setup();
    render(<SheetScreensDemo />);
    await openColorScreen(user);

    await user.keyboard('{Escape}');
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const trigger = screen.getByRole('button', { name: 'Шторка с экранами' });
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    expect(await screen.findByRole('dialog', { name: 'Фильтры' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Назад/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Закрыть' })).toBeInTheDocument();
  });
});
