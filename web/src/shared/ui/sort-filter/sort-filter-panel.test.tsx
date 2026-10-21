import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SortFilterPanel } from '@/shared/ui';

const options = [
  { value: 'popularity', label: 'Подобрали для вас' },
  { value: 'new', label: 'Новинки' },
  { value: 'price-desc', label: 'Сначала дороже' },
];

describe('SortFilterPanel', () => {
  it('lists the options as radios named after the label, the value checked', () => {
    render(
      <SortFilterPanel label="Сортировка" options={options} value="new" onValueChange={vi.fn()} />,
    );

    expect(screen.getByRole('radiogroup', { name: 'Сортировка' })).toBeInTheDocument();
    expect(
      screen.getAllByRole('radio').map((radio) => radio.closest('label')?.textContent),
    ).toEqual(['Подобрали для вас', 'Новинки', 'Сначала дороже']);
    expect(screen.getByRole('radio', { name: 'Новинки' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Сначала дороже' })).not.toBeChecked();
  });

  it('reports a pick and stays on screen: nothing closes', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <SortFilterPanel
        label="Сортировка"
        options={options}
        value="new"
        onValueChange={onValueChange}
      />,
    );

    await user.click(screen.getByRole('radio', { name: 'Сначала дороже' }));

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith('price-desc');
    expect(screen.getByRole('radiogroup', { name: 'Сортировка' })).toBeInTheDocument();
  });
});
