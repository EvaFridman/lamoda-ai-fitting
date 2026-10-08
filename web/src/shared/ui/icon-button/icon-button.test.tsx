import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { HeartIcon, IconButton } from '@/shared/ui';

describe('IconButton', () => {
  it('is a button named by its aria-label', () => {
    render(
      <IconButton aria-label="Добавить в избранное">
        <HeartIcon />
      </IconButton>,
    );

    expect(screen.getByRole('button', { name: 'Добавить в избранное' })).toHaveAttribute(
      'type',
      'button',
    );
  });

  it('is reached by Tab and activated by click, Enter and Space', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <IconButton aria-label="Добавить в избранное" onClick={onClick}>
        <HeartIcon />
      </IconButton>,
    );

    await user.tab();
    expect(screen.getByRole('button')).toHaveFocus();

    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    await user.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('when disabled is skipped by Tab and ignores clicks', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <IconButton disabled aria-label="Добавить в избранное" onClick={onClick}>
        <HeartIcon />
      </IconButton>,
    );

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    await user.tab();
    expect(button).not.toHaveFocus();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('has a class per size and merges className', () => {
    const { rerender } = render(
      <IconButton aria-label="A">
        <HeartIcon />
      </IconButton>,
    );
    expect(screen.getByRole('button')).toHaveClass('size48');

    rerender(
      <IconButton aria-label="A" size={56} className="mine">
        <HeartIcon />
      </IconButton>,
    );
    expect(screen.getByRole('button')).toHaveClass('size56', 'mine');
    expect(screen.getByRole('button')).not.toHaveClass('size48');
  });
});
