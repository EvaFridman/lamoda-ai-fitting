import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CheckboxFilter, FilterChip, FilterDropdown } from '@/shared/ui';

const options = [
  { value: 'evening', label: 'Вечерний' },
  { value: 'business', label: 'Деловой' },
];

describe('FilterChip', () => {
  it('is a toggle button that reports its state', async () => {
    const user = userEvent.setup();
    const onPressedChange = vi.fn();
    render(<FilterChip title="Только со скидкой" onPressedChange={onPressedChange} />);
    const chip = screen.getByRole('button', { name: 'Только со скидкой' });

    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await user.click(chip);

    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(onPressedChange).toHaveBeenCalledWith(true, expect.anything());
    await user.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'false');
  });

  it('can be pressed from the start and toggled by the keyboard', async () => {
    const user = userEvent.setup();
    render(<FilterChip title="Только со скидкой" defaultPressed />);
    const chip = screen.getByRole('button', { name: 'Только со скидкой' });

    expect(chip).toHaveAttribute('aria-pressed', 'true');
    await user.tab();
    await user.keyboard('{Enter}');
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await user.keyboard(' ');
    expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not toggle when disabled', async () => {
    const user = userEvent.setup();
    render(<FilterChip title="Только со скидкой" disabled />);
    const chip = screen.getByRole('button', { name: 'Только со скидкой' });

    await user.click(chip);

    expect(chip).toBeDisabled();
    expect(chip).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('chip of a FilterDropdown', () => {
  it('shows the title and the value in its name', () => {
    render(
      <FilterDropdown title="Стиль" value="вечерний" onClear={vi.fn()}>
        <CheckboxFilter options={options} value={['evening']} onApply={vi.fn()} />
      </FilterDropdown>,
    );

    expect(screen.getByRole('button', { name: 'Стиль вечерний' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сбросить «Стиль»' })).toBeInTheDocument();
  });

  it('has no × when not applied, or when there is no onClear', () => {
    const { rerender } = render(
      <FilterDropdown title="Стиль" onClear={vi.fn()}>
        <CheckboxFilter options={options} value={[]} onApply={vi.fn()} />
      </FilterDropdown>,
    );
    expect(screen.queryByRole('button', { name: /Сбросить/ })).not.toBeInTheDocument();

    rerender(
      <FilterDropdown title="Стиль" value="вечерний">
        <CheckboxFilter options={options} value={['evening']} onApply={vi.fn()} />
      </FilterDropdown>,
    );
    expect(screen.queryByRole('button', { name: /Сбросить/ })).not.toBeInTheDocument();
  });

  it('calls onClear from the × and keeps the focus on the chip', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(
      <FilterDropdown title="Стиль" value="вечерний" onClear={onClear}>
        <CheckboxFilter options={options} value={['evening']} onApply={vi.fn()} />
      </FilterDropdown>,
    );

    await user.click(screen.getByRole('button', { name: 'Сбросить «Стиль»' }));

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Стиль вечерний' })).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
