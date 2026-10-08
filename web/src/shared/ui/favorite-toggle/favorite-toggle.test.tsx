import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FavoriteToggle } from '@/shared/ui';

describe('FavoriteToggle', () => {
  it('is a button named "В избранное", not pressed at first', () => {
    render(<FavoriteToggle />);

    expect(screen.getByRole('button', { name: 'В избранное' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('presses on click and unpresses on the second click, keeping its name', async () => {
    const user = userEvent.setup();
    render(<FavoriteToggle />);
    const button = screen.getByRole('button', { name: 'В избранное' });

    await user.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'В избранное' })).toBe(button);

    await user.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles with Space and with Enter', async () => {
    const user = userEvent.setup();
    render(<FavoriteToggle />);
    const button = screen.getByRole('button', { name: 'В избранное' });

    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard(' ');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('{Enter}');
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onPressedChange with the new state', async () => {
    const user = userEvent.setup();
    const onPressedChange = vi.fn();
    render(<FavoriteToggle onPressedChange={onPressedChange} />);
    const button = screen.getByRole('button', { name: 'В избранное' });

    await user.click(button);
    await user.click(button);

    expect(onPressedChange).toHaveBeenCalledTimes(2);
    expect(onPressedChange.mock.calls[0]?.[0]).toBe(true);
    expect(onPressedChange.mock.calls[1]?.[0]).toBe(false);
  });

  it('follows the controlled "pressed" and only reports the click', async () => {
    const user = userEvent.setup();
    const onPressedChange = vi.fn();
    render(<FavoriteToggle pressed onPressedChange={onPressedChange} />);
    const button = screen.getByRole('button', { name: 'В избранное' });

    expect(button).toHaveAttribute('aria-pressed', 'true');
    await user.click(button);

    expect(onPressedChange.mock.calls[0]?.[0]).toBe(false);
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('starts pressed with defaultPressed', () => {
    render(<FavoriteToggle defaultPressed />);

    expect(screen.getByRole('button', { name: 'В избранное' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('ignores clicks when disabled', async () => {
    const user = userEvent.setup();
    const onPressedChange = vi.fn();
    render(<FavoriteToggle disabled onPressedChange={onPressedChange} />);
    const button = screen.getByRole('button', { name: 'В избранное' });

    await user.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(onPressedChange).not.toHaveBeenCalled();
  });

  it('takes a custom accessible name', () => {
    render(<FavoriteToggle aria-label="Добавить кардиган в избранное" />);

    expect(
      screen.getByRole('button', { name: 'Добавить кардиган в избранное' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'В избранное' })).toBeNull();
  });

  describe('the beat', () => {
    it('starts when pressed and ends with the animation', async () => {
      const user = userEvent.setup();
      render(<FavoriteToggle />);
      const button = screen.getByRole('button', { name: 'В избранное' });
      expect(button).not.toHaveAttribute('data-beating');

      await user.click(button);
      expect(button).toHaveAttribute('data-beating');

      // The heart (the svg inside the button) is what animates; its event bubbles up.
      const heart = button.querySelector('svg');
      if (!heart) throw new Error('no heart');
      // jsdom has no AnimationEvent, so React listens for the prefixed name.
      fireEvent(heart, new Event('webkitAnimationEnd', { bubbles: true }));
      expect(button).not.toHaveAttribute('data-beating');
      expect(button).toHaveAttribute('aria-pressed', 'true');
    });

    it('never beats without being pressed when the parent refuses the press', async () => {
      const user = userEvent.setup();
      const onPressedChange = vi.fn();
      render(<FavoriteToggle pressed={false} onPressedChange={onPressedChange} />);
      const button = screen.getByRole('button', { name: 'В избранное' });

      await user.click(button);

      expect(onPressedChange.mock.calls[0]?.[0]).toBe(true);
      expect(button).toHaveAttribute('aria-pressed', 'false');
      expect(button).not.toHaveAttribute('data-pressed');
      expect(button.hasAttribute('data-beating') && button.hasAttribute('data-pressed')).toBe(
        false,
      );
    });

    it('does not beat when the parent sets pressed later, after refusing the press', async () => {
      const user = userEvent.setup();
      const onPressedChange = vi.fn();
      const view = render(<FavoriteToggle pressed={false} onPressedChange={onPressedChange} />);
      const button = screen.getByRole('button', { name: 'В избранное' });

      await user.click(button);
      expect(onPressedChange.mock.calls[0]?.[0]).toBe(true);
      view.rerender(<FavoriteToggle pressed={false} onPressedChange={onPressedChange} />);
      expect(button).not.toHaveAttribute('data-beating');

      view.rerender(<FavoriteToggle pressed onPressedChange={onPressedChange} />);
      expect(button).toHaveAttribute('data-pressed');
      expect(button).not.toHaveAttribute('data-beating');
    });

    it('does not start when rendered pressed', () => {
      render(<FavoriteToggle defaultPressed />);

      expect(screen.getByRole('button', { name: 'В избранное' })).not.toHaveAttribute(
        'data-beating',
      );
    });

    it('does not start when unpressed', async () => {
      const user = userEvent.setup();
      render(<FavoriteToggle defaultPressed />);
      const button = screen.getByRole('button', { name: 'В избранное' });

      await user.click(button);

      expect(button).toHaveAttribute('aria-pressed', 'false');
      expect(button).not.toHaveAttribute('data-beating');
    });
  });
});
