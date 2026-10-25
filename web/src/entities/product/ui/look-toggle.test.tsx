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

  it('is busy: aria-disabled, still focusable, clicks ignored', async () => {
    const onPressedChange = vi.fn();
    render(<LookToggle busy onPressedChange={onPressedChange} />);
    const user = userEvent.setup();

    const button = screen.getByRole('button', { name: 'Добавить к образу' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toBeEnabled();
    await user.tab();
    expect(button).toHaveFocus();
    await user.click(button);

    expect(onPressedChange).not.toHaveBeenCalled();
  });

  it('keeps the same button, focused, when it turns busy', () => {
    const { rerender } = render(<LookToggle />);
    const button = screen.getByRole('button', { name: 'Добавить к образу' });
    button.focus();

    rerender(<LookToggle busy />);

    expect(screen.getByRole('button', { name: 'Добавить к образу' })).toBe(button);
    expect(button).toHaveFocus();
  });

  it('shows the tooltip while busy', async () => {
    const user = userEvent.setup();
    render(<LookToggle busy />);

    await user.hover(screen.getByRole('button'));

    expect(
      await screen.findByText('Добавить к образу', { selector: '[role="tooltip"], div' }),
    ).toBeInTheDocument();
  });

  it('hands the placer’s hover handlers to the button', async () => {
    const onPointerEnter = vi.fn();
    const onPointerLeave = vi.fn();
    render(<LookToggle events={{ onPointerEnter, onPointerLeave }} />);
    const user = userEvent.setup();

    await user.hover(screen.getByRole('button'));
    await user.unhover(screen.getByRole('button'));

    expect(onPointerEnter).toHaveBeenCalled();
    expect(onPointerLeave).toHaveBeenCalled();
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
