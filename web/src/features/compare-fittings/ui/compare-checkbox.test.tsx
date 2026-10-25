import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CompareCheckbox } from './compare-checkbox';

describe('CompareCheckbox', () => {
  it('is an unchecked checkbox that calls onToggle on a click', async () => {
    const onToggle = vi.fn();
    render(<CompareCheckbox checked={false} disabled={false} onToggle={onToggle} />);
    const box = screen.getByRole('checkbox', { name: 'Выбрать для сравнения' });
    expect(box).not.toBeChecked();
    await userEvent.setup().click(box);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('shows the chosen state', () => {
    render(<CompareCheckbox checked disabled={false} onToggle={vi.fn()} />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('does not call onToggle when disabled', async () => {
    const onToggle = vi.fn();
    render(<CompareCheckbox checked={false} disabled onToggle={onToggle} />);
    const box = screen.getByRole('checkbox');
    expect(box).toBeDisabled();
    await userEvent.setup().click(box);
    expect(onToggle).not.toHaveBeenCalled();
  });
});
