import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CheckboxFilterPanel, type CheckboxFilterOption } from '@/shared/ui';

const options: CheckboxFilterOption[] = [
  { value: 'evening', label: 'Вечерний', count: 10 },
  { value: 'business', label: 'Деловой', count: 20 },
  { value: 'casual', label: 'Повседневный' },
  { value: 'sport', label: 'Спортивный', disabled: true },
];

function Harness({
  initial = [],
  onValueChange,
  searchable = false,
  swatches = false,
}: {
  initial?: string[];
  onValueChange?: (value: string[]) => void;
  searchable?: boolean;
  swatches?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <CheckboxFilterPanel
      label="Стиль"
      options={options}
      value={value}
      searchable={searchable}
      swatches={swatches}
      onValueChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
    />
  );
}

describe('CheckboxFilterPanel', () => {
  it('names the list after its label and shows counts', () => {
    render(<Harness />);

    expect(screen.getByRole('group', { name: 'Стиль' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Вечерний 10' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Повседневный' })).toBeInTheDocument();
  });

  it('shows the ticked values and has no "Применить"', () => {
    render(<Harness initial={['business']} />);

    expect(screen.getByRole('checkbox', { name: /Деловой/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Вечерний/ })).not.toBeChecked();
    expect(screen.queryByRole('button', { name: 'Применить' })).not.toBeInTheDocument();
  });

  it('reports every tick at once, in the order of the options', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Harness onValueChange={onValueChange} />);

    await user.click(screen.getByRole('checkbox', { name: /Повседневный/ }));
    await user.click(screen.getByRole('checkbox', { name: /Вечерний/ }));

    expect(onValueChange).toHaveBeenNthCalledWith(1, ['casual']);
    expect(onValueChange).toHaveBeenNthCalledWith(2, ['evening', 'casual']);
  });

  it('reports an untick', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Harness initial={['evening', 'business']} onValueChange={onValueChange} />);

    await user.click(screen.getByRole('checkbox', { name: /Вечерний/ }));

    expect(onValueChange).toHaveBeenCalledWith(['business']);
  });

  it('does not tick a disabled option', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Harness onValueChange={onValueChange} />);

    await user.click(screen.getByText('Спортивный'));

    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('has no search field unless asked', () => {
    render(<Harness />);

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('narrows the list by search, named after the label, and keeps ticks it hides', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Harness searchable onValueChange={onValueChange} />);

    await user.click(screen.getByRole('checkbox', { name: /Вечерний/ }));
    await user.type(screen.getByRole('searchbox', { name: 'Поиск: Стиль' }), 'ДЕЛ');
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    await user.click(screen.getByRole('checkbox', { name: /Деловой/ }));

    expect(onValueChange).toHaveBeenLastCalledWith(['evening', 'business']);
  });

  it('says so when nothing matches', async () => {
    const user = userEvent.setup();
    render(<Harness searchable />);

    await user.type(screen.getByRole('searchbox'), 'яяя');

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Ничего не найдено');
  });

  it('draws swatches instead of plain boxes when asked', () => {
    render(
      <CheckboxFilterPanel
        label="Цвет"
        swatches
        options={[
          { value: 'blue', label: 'Синий', color: '#3972FC', count: 7 },
          { value: 'print', label: 'С принтом', count: 3 },
        ]}
        value={[]}
        onValueChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('checkbox', { name: 'Синий 7' })).toHaveStyle({
      background: '#3972FC',
    });
    expect(screen.getByRole('checkbox', { name: 'С принтом 3' })).toHaveAttribute('data-bordered');
  });
});
