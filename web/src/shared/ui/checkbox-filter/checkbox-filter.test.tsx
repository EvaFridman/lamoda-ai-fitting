import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CheckboxFilter, type CheckboxFilterOption, FilterDropdown } from '@/shared/ui';

const options: CheckboxFilterOption[] = [
  { value: 'evening', label: 'Вечерний', count: 10 },
  { value: 'business', label: 'Деловой', count: 20 },
  { value: 'casual', label: 'Повседневный' },
  { value: 'sport', label: 'Спортивный', disabled: true },
];

function Harness({
  searchable = false,
  onApply,
}: {
  searchable?: boolean;
  onApply?: (value: string[]) => void;
}) {
  const [value, setValue] = useState<string[]>([]);
  const names = options.filter((option) => value.includes(option.value));
  return (
    <FilterDropdown
      title="Стиль"
      value={
        names.length > 0 ? names.map((option) => option.label.toLowerCase()).join(', ') : undefined
      }
      onClear={() => setValue([])}
    >
      <CheckboxFilter
        options={options}
        value={value}
        searchable={searchable}
        onApply={(next) => {
          setValue(next);
          onApply?.(next);
        }}
      />
    </FilterDropdown>
  );
}

describe('CheckboxFilter in a FilterDropdown', () => {
  it('opens on click, picks, applies: the chip shows the choice and the dropdown closes', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<Harness onApply={onApply} />);

    await user.click(screen.getByRole('button', { name: 'Стиль' }));
    const dialog = screen.getByRole('dialog', { name: 'Стиль' });
    await user.click(within(dialog).getByRole('checkbox', { name: /Вечерний/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

    expect(onApply).toHaveBeenCalledWith(['evening']);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Стиль вечерний' })).toBeInTheDocument();
  });

  it('applies the values in the order of the options', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<Harness onApply={onApply} />);

    await user.click(screen.getByRole('button', { name: 'Стиль' }));
    await user.click(screen.getByRole('checkbox', { name: /Повседневный/ }));
    await user.click(screen.getByRole('checkbox', { name: /Вечерний/ }));
    await user.click(screen.getByRole('button', { name: 'Применить' }));

    expect(onApply).toHaveBeenCalledWith(['evening', 'casual']);
  });

  it('shows counts and names the list after the chip', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Стиль' }));

    expect(screen.getByRole('group', { name: 'Стиль' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Вечерний 10' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Повседневный' })).toBeInTheDocument();
  });

  it('does not tick a disabled option', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<Harness onApply={onApply} />);

    await user.click(screen.getByRole('button', { name: 'Стиль' }));
    await user.click(screen.getByText('Спортивный'));
    await user.click(screen.getByRole('button', { name: 'Применить' }));

    expect(onApply).toHaveBeenCalledWith([]);
  });

  it('discards an unapplied pick when closed with Esc', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<Harness onApply={onApply} />);
    const chip = screen.getByRole('button', { name: 'Стиль' });

    await user.click(chip);
    await user.click(screen.getByRole('checkbox', { name: /Деловой/ }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(chip);
    expect(screen.getByRole('checkbox', { name: /Деловой/ })).not.toBeChecked();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('discards an unapplied pick when closed by a click outside', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Снаружи</button>
        <Harness />
      </>,
    );
    const chip = screen.getByRole('button', { name: 'Стиль' });

    await user.click(chip);
    await user.click(screen.getByRole('checkbox', { name: /Деловой/ }));
    await user.click(screen.getByRole('button', { name: 'Снаружи' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(chip);
    expect(screen.getByRole('checkbox', { name: /Деловой/ })).not.toBeChecked();
  });

  it('opens with the applied values ticked, and × clears them', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Стиль' }));
    await user.click(screen.getByRole('checkbox', { name: /Вечерний/ }));
    await user.click(screen.getByRole('button', { name: 'Применить' }));

    await user.click(screen.getByRole('button', { name: 'Стиль вечерний' }));
    expect(screen.getByRole('checkbox', { name: /Вечерний/ })).toBeChecked();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Сбросить «Стиль»' }));
    expect(screen.getByRole('button', { name: 'Стиль' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Сбросить/ })).not.toBeInTheDocument();
  });
});

describe('CheckboxFilter status and context', () => {
  it('throws outside a FilterDropdown', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() =>
        render(<CheckboxFilter options={options} value={[]} onApply={vi.fn()} />),
      ).toThrow('CheckboxFilter lives inside a FilterDropdown');
    } finally {
      error.mockRestore();
    }
  });

  it('has no status element unless searchable', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Стиль' }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps an empty status mounted when searchable, filled only when nothing matches', async () => {
    const user = userEvent.setup();
    render(<Harness searchable />);
    await user.click(screen.getByRole('button', { name: 'Стиль' }));

    const status = screen.getByRole('status');
    expect(status).toBeEmptyDOMElement();

    await user.type(screen.getByRole('searchbox'), 'яяя');
    expect(screen.getByRole('status')).toBe(status);
    expect(status).toHaveTextContent('Ничего не найдено');

    await user.clear(screen.getByRole('searchbox'));
    expect(screen.getByRole('status')).toBe(status);
    expect(status).toBeEmptyDOMElement();
  });
});

describe('CheckboxFilter extra scenarios', () => {
  it('calls onApply once on a double click of "Применить" and stays closed', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<Harness onApply={onApply} />);

    await user.click(screen.getByRole('button', { name: 'Стиль' }));
    await user.click(screen.getByRole('checkbox', { name: /Вечерний/ }));
    await user.dblClick(screen.getByRole('button', { name: 'Применить' }));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on Tab from "Применить"', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Стиль' }));
    screen.getByRole('button', { name: 'Применить' }).focus();
    await user.tab();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on Esc from the search input; reopening shows an empty search and applied ticks', async () => {
    const user = userEvent.setup();
    render(<Harness searchable />);
    const chip = screen.getByRole('button', { name: 'Стиль' });

    await user.click(chip);
    await user.click(screen.getByRole('checkbox', { name: /Вечерний/ }));
    await user.click(screen.getByRole('button', { name: 'Применить' }));

    const applied = screen.getByRole('button', { name: 'Стиль вечерний' });
    await user.click(applied);
    await user.type(screen.getByRole('searchbox'), 'дел');
    expect(screen.getByRole('searchbox')).toHaveFocus();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(applied).toHaveFocus();

    await user.click(applied);
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(screen.getByRole('checkbox', { name: /Вечерний/ })).toBeChecked();
  });
});

describe('two dropdowns', () => {
  it('opening one by click closes the other: one dialog at a time', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Harness />
        <FilterDropdown title="Бренд">
          <CheckboxFilter options={options} value={[]} onApply={vi.fn()} />
        </FilterDropdown>
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'Стиль' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Бренд' }));

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Бренд' })).toBeInTheDocument();
  });

  it('× of an open applied dropdown calls onClear', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(
      <FilterDropdown title="Стиль" value="вечерний" onClear={onClear}>
        <CheckboxFilter options={options} value={['evening']} onApply={vi.fn()} />
      </FilterDropdown>,
    );

    await user.click(screen.getByRole('button', { name: 'Стиль вечерний' }));
    await user.click(screen.getByRole('button', { name: 'Сбросить «Стиль»' }));

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('CheckboxFilter search', () => {
  async function openSearchable() {
    const user = userEvent.setup();
    render(<Harness searchable />);
    await user.click(screen.getByRole('button', { name: 'Стиль' }));
    return { user, input: screen.getByRole('searchbox', { name: 'Поиск: Стиль' }) };
  }

  it('has no search field unless asked', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Стиль' }));

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('narrows the list, ignoring case', async () => {
    const { user, input } = await openSearchable();

    await user.type(input, 'ДЕЛ');

    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: /Деловой/ })).toBeInTheDocument();
  });

  it('says so when nothing matches', async () => {
    const { user, input } = await openSearchable();

    await user.type(input, 'яяя');

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Ничего не найдено');
  });

  it('keeps ticks of options hidden by the search', async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    render(<Harness searchable onApply={onApply} />);
    await user.click(screen.getByRole('button', { name: 'Стиль' }));

    await user.click(screen.getByRole('checkbox', { name: /Вечерний/ }));
    await user.type(screen.getByRole('searchbox'), 'дел');
    await user.click(screen.getByRole('checkbox', { name: /Деловой/ }));
    await user.click(screen.getByRole('button', { name: 'Применить' }));

    expect(onApply).toHaveBeenCalledWith(['evening', 'business']);
  });

  it('resets with "Очистить" and returns the focus to the input', async () => {
    const { user, input } = await openSearchable();
    expect(screen.queryByRole('button', { name: 'Очистить' })).not.toBeInTheDocument();

    await user.type(input, 'дел');
    await user.click(screen.getByRole('button', { name: 'Очистить' }));

    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
    expect(screen.getAllByRole('checkbox')).toHaveLength(options.length);
    expect(screen.queryByRole('button', { name: 'Очистить' })).not.toBeInTheDocument();
  });
});
