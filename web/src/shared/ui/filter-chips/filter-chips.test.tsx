import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { FilterChip, FilterChips } from '@/shared/ui';

describe('FilterChips', () => {
  it('renders its chips', () => {
    render(
      <FilterChips>
        <FilterChip title="Первый" />
        <FilterChip title="Второй" />
      </FilterChips>,
    );

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Первый',
      'Второй',
    ]);
  });

  it('has no "Очистить фильтры" without onClearAll', () => {
    render(
      <FilterChips>
        <FilterChip title="Первый" />
      </FilterChips>,
    );

    expect(screen.queryByRole('button', { name: 'Очистить фильтры' })).not.toBeInTheDocument();
  });

  it('calls onClearAll and moves the focus to the first chip once the button is gone', async () => {
    const user = userEvent.setup();
    const onClearAll = vi.fn();

    function Row() {
      const [pressed, setPressed] = useState(true);
      return (
        <FilterChips
          onClearAll={
            pressed
              ? () => {
                  onClearAll();
                  setPressed(false);
                }
              : undefined
          }
        >
          <FilterChip title="Первый" pressed={pressed} onPressedChange={setPressed} />
          <FilterChip title="Второй" />
        </FilterChips>
      );
    }
    render(<Row />);

    await user.click(screen.getByRole('button', { name: 'Очистить фильтры' }));

    expect(onClearAll).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Очистить фильтры' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Первый' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Первый' })).toHaveAttribute('aria-pressed', 'false');
  });
});
