import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LoadingButtonDemo } from './loading-button-demo';

describe('LoadingButtonDemo', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // fireEvent, not userEvent: Testing Library's async wrapper waits on a timer that fake timers
  // freeze under Vitest.
  it('is busy for two seconds after a click, then idle again', () => {
    vi.useFakeTimers();
    render(<LoadingButtonDemo />);
    const button = screen.getByRole('button', { name: 'Добавить в корзину' });
    expect(button).not.toHaveAttribute('aria-busy');

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-busy', 'true');

    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(button).toHaveAttribute('aria-busy', 'true');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(button).not.toHaveAttribute('aria-busy');
  });

  it('can be started from the keyboard', async () => {
    const user = userEvent.setup();
    render(<LoadingButtonDemo />);

    await user.tab();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });
});
