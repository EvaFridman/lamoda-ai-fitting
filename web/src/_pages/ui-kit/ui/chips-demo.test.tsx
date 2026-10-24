import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ChipsDemo } from './chips-demo';

describe('ChipsDemo', () => {
  it('starts with "Вещь" pressed, in a group named by its question', () => {
    render(<ChipsDemo />);
    expect(screen.getByRole('group', { name: 'Что поменять?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Вещь' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Выбрано: item')).toBeInTheDocument();
  });

  it('shows the choice as chips are pressed and released', async () => {
    const user = userEvent.setup();
    render(<ChipsDemo />);
    await user.click(screen.getByRole('button', { name: 'Лицо' }));
    expect(screen.getByText('Выбрано: item, face')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Вещь' }));
    await user.click(screen.getByRole('button', { name: 'Лицо' }));
    expect(screen.getByText('Выбрано: ничего')).toBeInTheDocument();
  });
});
