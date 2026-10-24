import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LookToggle } from './look-toggle';

describe('LookToggle', () => {
  it('offers to add to the look when not pressed', () => {
    render(<LookToggle />);

    const button = screen.getByRole('button', { name: 'Добавить к образу' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toBeEnabled();
  });

  it('offers to remove from the fitting room when pressed', () => {
    render(<LookToggle pressed />);

    const button = screen.getByRole('button', { name: 'В примерочной — убрать' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it.each([
    [false, true],
    [true, false],
  ])('calls onPressedChange with the opposite of pressed=%s', async (pressed, expected) => {
    const onPressedChange = vi.fn();
    render(<LookToggle pressed={pressed} onPressedChange={onPressedChange} />);

    await userEvent.setup().click(screen.getByRole('button'));

    expect(onPressedChange).toHaveBeenCalledExactlyOnceWith(expected);
  });

  it('is a disabled button that sends nothing when disabled', async () => {
    const onPressedChange = vi.fn();
    render(<LookToggle disabled onPressedChange={onPressedChange} />);

    const button = screen.getByRole('button', { name: 'Добавить к образу' });
    expect(button).toBeDisabled();
    await userEvent.setup().click(button);

    expect(onPressedChange).not.toHaveBeenCalled();
  });

  it('shows the tooltip on hover when enabled', async () => {
    const user = userEvent.setup();
    render(<LookToggle />);

    await user.hover(screen.getByRole('button'));

    expect(
      await screen.findByText('Добавить к образу', { selector: '[role="tooltip"], div' }),
    ).toBeInTheDocument();
  });

  it('has no tooltip when disabled', async () => {
    const user = userEvent.setup();
    render(<LookToggle disabled />);

    await user.hover(screen.getByRole('button'));

    expect(screen.queryByText('Добавить к образу')).not.toBeInTheDocument();
  });
});
