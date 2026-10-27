import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ChipStates, ChipsDemo } from './chips-demo';

describe('ChipsDemo', () => {
  it('starts with "Тренч" pressed, in a group named by its question', () => {
    render(<ChipsDemo />);
    expect(screen.getByRole('group', { name: 'Какая именно?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Тренч' })).toHaveAttribute('aria-pressed', 'true');
    for (const name of ['Рубашка', 'Юбка', 'Ботильоны']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
    }
    expect(screen.getByText('Выбрано: trench')).toBeInTheDocument();
  });

  it('replaces the choice when another chip is pressed', async () => {
    const user = userEvent.setup();
    render(<ChipsDemo />);
    await user.click(screen.getByRole('button', { name: 'Рубашка' }));
    expect(screen.getByText('Выбрано: shirt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Рубашка' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Тренч' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('releases the pressed chip and shows nothing chosen', async () => {
    const user = userEvent.setup();
    render(<ChipsDemo />);
    await user.click(screen.getByRole('button', { name: 'Тренч' }));
    expect(screen.getByText('Выбрано: ничего')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Тренч' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('ChipStates', () => {
  it('shows a plain, a pressed and a disabled chip', () => {
    render(<ChipStates />);
    expect(screen.getByRole('button', { name: 'Рубашка' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Тренч' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Юбка' })).toBeDisabled();
  });
});
