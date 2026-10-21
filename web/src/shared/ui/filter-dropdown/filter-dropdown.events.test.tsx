import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CheckboxFilter, FilterDropdown } from '@/shared/ui';

const options = [
  { value: 'evening', label: 'Вечерний' },
  { value: 'business', label: 'Деловой' },
];

function setup(applied = false) {
  const chipEvents = { onClick: vi.fn(), onPointerEnter: vi.fn(), onPointerLeave: vi.fn() };
  const onClear = vi.fn();
  render(
    <FilterDropdown
      title="Стиль"
      value={applied ? 'вечерний' : undefined}
      onClear={onClear}
      chipEvents={chipEvents}
    >
      <CheckboxFilter options={options} value={applied ? ['evening'] : []} onApply={vi.fn()} />
    </FilterDropdown>,
  );
  return { chipEvents, onClear };
}

describe('FilterDropdown with chipEvents', () => {
  it('opens on a click and calls the click handler', async () => {
    const user = userEvent.setup();
    const { chipEvents } = setup();

    await user.click(screen.getByRole('button', { name: 'Стиль' }));

    expect(screen.getByRole('dialog', { name: 'Стиль' })).toBeInTheDocument();
    expect(chipEvents.onClick).toHaveBeenCalledTimes(1);
  });

  it.each([['{Enter}'], [' ']])('opens on %j and moves the focus inside', async (key) => {
    const user = userEvent.setup();
    setup();

    await user.tab();
    await user.keyboard(key);

    const dialog = screen.getByRole('dialog', { name: 'Стиль' });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(screen.getByRole('button', { name: 'Стиль' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps the focus on the chip after the ×, which calls no chip handler', async () => {
    const user = userEvent.setup();
    const { chipEvents, onClear } = setup(true);

    await user.click(screen.getByRole('button', { name: 'Сбросить «Стиль»' }));

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(chipEvents.onClick).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Стиль вечерний' })).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
