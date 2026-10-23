import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  CheckboxFilter,
  type CheckboxFilterOption,
  CheckboxFilterPanel,
  FilterDropdown,
} from '@/shared/ui';

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

describe('CheckboxFilterPanel', () => {
  const panelOptions: CheckboxFilterOption[] = [
    { value: 'evening', label: 'Вечерний', count: 10, color: '#112233' },
    { value: 'business', label: 'Деловой', count: 20, color: '#FFFFFF' },
    { value: 'casual', label: 'Повседневный' },
    { value: 'sport', label: 'Спортивный', disabled: true },
  ];

  function Panel({
    initial = [],
    onValueChange,
    ...props
  }: {
    initial?: string[];
    onValueChange?: (value: string[]) => void;
  } & Partial<ComponentProps<typeof CheckboxFilterPanel>>) {
    const [value, setValue] = useState(initial);
    return (
      <CheckboxFilterPanel
        label="Стиль"
        options={panelOptions}
        {...props}
        value={value}
        onValueChange={(next) => {
          setValue(next);
          onValueChange?.(next);
        }}
      />
    );
  }

  describe('sheet layout', () => {
    it('names each row by its label and count, with or without a swatch dot', () => {
      const { rerender } = render(<Panel layout="sheet" />);
      expect(screen.getByRole('checkbox', { name: 'Вечерний 10' })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Повседневный' })).toBeInTheDocument();

      rerender(<Panel layout="sheet" swatches />);
      expect(screen.getByRole('checkbox', { name: 'Вечерний 10' })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Деловой 20' })).toBeInTheDocument();
    });

    it('draws a decorative dot, not a swatch checkbox, when swatches is set', () => {
      render(<Panel layout="sheet" swatches />);

      const dots = document.querySelectorAll('[aria-hidden="true"][style*="background"]');
      expect(dots).toHaveLength(2);
      expect(screen.getAllByRole('checkbox')).toHaveLength(panelOptions.length);
      for (const box of screen.getAllByRole('checkbox')) {
        expect(box).not.toHaveAttribute('data-bordered');
        expect(box.style.background).toBe('');
      }
    });

    it('draws no dot without swatches', () => {
      render(<Panel layout="sheet" />);

      expect(document.querySelectorAll('[aria-hidden="true"][style*="background"]')).toHaveLength(
        0,
      );
    });

    it('ticks and unticks, reporting the values in the order of the options', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      render(<Panel layout="sheet" swatches onValueChange={onValueChange} />);

      await user.click(screen.getByRole('checkbox', { name: 'Повседневный' }));
      await user.click(screen.getByRole('checkbox', { name: 'Вечерний 10' }));
      expect(onValueChange).toHaveBeenLastCalledWith(['evening', 'casual']);
      expect(screen.getByRole('checkbox', { name: 'Вечерний 10' })).toBeChecked();

      await user.click(screen.getByRole('checkbox', { name: 'Вечерний 10' }));
      expect(onValueChange).toHaveBeenLastCalledWith(['casual']);
    });

    it('ticks by a click on the label text', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      render(<Panel layout="sheet" onValueChange={onValueChange} />);

      await user.click(screen.getByText('Деловой'));

      expect(onValueChange).toHaveBeenCalledWith(['business']);
    });

    it('does not tick a disabled option', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      render(<Panel layout="sheet" onValueChange={onValueChange} />);

      await user.click(screen.getByText('Спортивный'));

      expect(onValueChange).not.toHaveBeenCalled();
    });
  });

  describe('selectAll', () => {
    it('has no "Выбрать все" by default', () => {
      render(<Panel />);

      expect(screen.queryByRole('button', { name: 'Выбрать все' })).not.toBeInTheDocument();
    });

    it('ticks every option that is not disabled, in the order of the options', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      render(<Panel selectAll initial={['casual']} onValueChange={onValueChange} />);

      await user.click(screen.getByRole('button', { name: 'Выбрать все' }));

      expect(onValueChange).toHaveBeenLastCalledWith(['evening', 'business', 'casual']);
      expect(screen.getByRole('checkbox', { name: 'Спортивный' })).not.toBeChecked();
    });

    it('works in the sheet layout too', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      render(<Panel selectAll layout="sheet" swatches onValueChange={onValueChange} />);

      await user.click(screen.getByRole('button', { name: 'Выбрать все' }));

      expect(onValueChange).toHaveBeenLastCalledWith(['evening', 'business', 'casual']);
    });

    it('with a search ticks only the shown options and keeps the hidden ticks', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      render(<Panel selectAll searchable initial={['evening']} onValueChange={onValueChange} />);

      await user.type(screen.getByRole('searchbox'), 'дел');
      await user.click(screen.getByRole('button', { name: 'Выбрать все' }));

      expect(onValueChange).toHaveBeenLastCalledWith(['evening', 'business']);
      await user.click(screen.getByRole('button', { name: 'Очистить' }));
      expect(screen.getByRole('checkbox', { name: 'Вечерний 10' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Деловой 20' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Повседневный' })).not.toBeChecked();
    });

    it('never unticks: a fully ticked list is not reported at all, however often it is pressed', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      render(
        <Panel
          selectAll
          initial={['evening', 'business', 'casual']}
          onValueChange={onValueChange}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Выбрать все' }));
      await user.click(screen.getByRole('button', { name: 'Выбрать все' }));

      expect(onValueChange).not.toHaveBeenCalled();
      expect(
        screen
          .getAllByRole('checkbox')
          .filter((box) => box.getAttribute('aria-checked') === 'true'),
      ).toHaveLength(3);
    });

    it('reports once after a press that ticks something, then nothing on the next press', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      render(<Panel selectAll initial={['casual']} onValueChange={onValueChange} />);

      await user.click(screen.getByRole('button', { name: 'Выбрать все' }));
      await user.click(screen.getByRole('button', { name: 'Выбрать все' }));

      expect(onValueChange).toHaveBeenCalledTimes(1);
    });

    it('does not report when the shown options are ticked and only hidden ones are not', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      render(<Panel selectAll searchable initial={['business']} onValueChange={onValueChange} />);

      await user.type(screen.getByRole('searchbox'), 'дел');
      await user.click(screen.getByRole('button', { name: 'Выбрать все' }));

      expect(onValueChange).not.toHaveBeenCalled();
    });

    it('is hidden while the shown options are all disabled', async () => {
      const user = userEvent.setup();
      render(<Panel selectAll searchable />);

      await user.type(screen.getByRole('searchbox'), 'спорт');
      expect(screen.getByRole('checkbox', { name: 'Спортивный' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Выбрать все' })).not.toBeInTheDocument();

      await user.clear(screen.getByRole('searchbox'));
      expect(screen.getByRole('button', { name: 'Выбрать все' })).toBeInTheDocument();
    });

    it('is hidden when every option is disabled', () => {
      render(
        <Panel
          selectAll
          options={[
            { value: 'a', label: 'А', disabled: true },
            { value: 'b', label: 'Б', disabled: true },
          ]}
        />,
      );

      expect(screen.queryByRole('button', { name: 'Выбрать все' })).not.toBeInTheDocument();
    });

    it('is hidden while the search finds nothing and back when it does', async () => {
      const user = userEvent.setup();
      render(<Panel selectAll searchable />);

      await user.type(screen.getByRole('searchbox'), 'яяя');
      expect(screen.queryByRole('button', { name: 'Выбрать все' })).not.toBeInTheDocument();

      await user.clear(screen.getByRole('searchbox'));
      expect(screen.getByRole('button', { name: 'Выбрать все' })).toBeInTheDocument();
    });
  });
});

describe('CheckboxFilter with swatches', () => {
  const colors: CheckboxFilterOption[] = [
    { value: 'black', label: 'Черный', color: '#000000', count: 5 },
    { value: 'blue', label: 'Синий', color: '#3972FC', count: 7 },
    { value: 'print', label: 'С принтом', count: 3 },
    { value: 'gold', label: 'Золотой', color: '#FFD700', disabled: true },
  ];

  function SwatchHarness({
    swatches = true,
    onApply,
  }: {
    swatches?: boolean;
    onApply?: (value: string[]) => void;
  }) {
    return (
      <FilterDropdown title="Цвет">
        <CheckboxFilter
          options={colors}
          value={[]}
          swatches={swatches}
          searchable
          onApply={(next) => onApply?.(next)}
        />
      </FilterDropdown>
    );
  }

  async function open(props: Parameters<typeof SwatchHarness>[0] = {}) {
    const user = userEvent.setup();
    render(<SwatchHarness {...props} />);
    await user.click(screen.getByRole('button', { name: 'Цвет' }));
    return user;
  }

  it('renders each option as a swatch checkbox named by label and count', async () => {
    await open();

    expect(screen.getByRole('checkbox', { name: 'Черный 5' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Синий 7' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'С принтом 3' })).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('paints a hex option and leaves an option with no colour as an empty bordered circle', async () => {
    await open();

    expect(screen.getByRole('checkbox', { name: 'Синий 7' })).toHaveStyle({
      background: '#3972FC',
    });
    const empty = screen.getByRole('checkbox', { name: 'С принтом 3' });
    expect(empty).toHaveAttribute('data-bordered');
    expect(empty.style.background).toBe('');
  });

  it('disables a disabled option: it cannot be ticked', async () => {
    const user = await open();
    const gold = screen.getByRole('checkbox', { name: 'Золотой' });

    expect(gold).toHaveAttribute('aria-disabled', 'true');
    await user.click(gold);
    expect(gold).not.toBeChecked();
  });

  it('applies two picks in the order of the options and closes', async () => {
    const onApply = vi.fn();
    const user = await open({ onApply });

    await user.click(screen.getByRole('checkbox', { name: 'С принтом 3' }));
    await user.click(screen.getByRole('checkbox', { name: 'Черный 5' }));
    expect(screen.getByRole('checkbox', { name: 'Черный 5' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Применить' }));

    expect(onApply).toHaveBeenCalledWith(['black', 'print']);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('drops the draft when closed without applying', async () => {
    const onApply = vi.fn();
    const user = await open({ onApply });

    await user.click(screen.getByRole('checkbox', { name: 'Синий 7' }));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Цвет' }));

    expect(screen.getByRole('checkbox', { name: 'Синий 7' })).not.toBeChecked();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('narrows the swatch rows by search and says when nothing matches', async () => {
    const user = await open();

    await user.type(screen.getByRole('searchbox'), 'син');
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: 'Синий 7' })).toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'яяя');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Ничего не найдено');
  });

  it('keeps a tick hidden by the search after "Очистить", and applies it', async () => {
    const onApply = vi.fn();
    const user = await open({ onApply });

    await user.click(screen.getByRole('checkbox', { name: 'Черный 5' }));
    await user.type(screen.getByRole('searchbox'), 'син');
    expect(screen.queryByRole('checkbox', { name: 'Черный 5' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Очистить' }));

    expect(screen.getByRole('checkbox', { name: 'Черный 5' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Применить' }));
    expect(onApply).toHaveBeenCalledWith(['black']);
  });

  it('keeps the focus in the search field after "Очистить"', async () => {
    const user = await open();
    const input = screen.getByRole('searchbox');

    await user.type(input, 'син');
    await user.click(screen.getByRole('button', { name: 'Очистить' }));

    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
  });

  it('reaches the first swatch with Tab from the search field and ticks it with Space', async () => {
    const user = await open();
    screen.getByRole('searchbox').focus();

    await user.tab();
    const black = screen.getByRole('checkbox', { name: 'Черный 5' });
    expect(black).toHaveFocus();
    expect(black).toHaveAttribute('aria-checked', 'false');
    await user.keyboard(' ');

    expect(black).toHaveAttribute('aria-checked', 'true');
  });

  describe('applied state', () => {
    function StatefulHarness() {
      const [value, setValue] = useState<string[]>([]);
      const names = colors.filter((color) => value.includes(color.value));
      return (
        <FilterDropdown
          title="Цвет"
          value={
            names.length > 0
              ? names.map((color) => color.label.toLowerCase()).join(', ')
              : undefined
          }
          onClear={() => setValue([])}
        >
          <CheckboxFilter options={colors} value={value} swatches onApply={setValue} />
        </FilterDropdown>
      );
    }

    it('reopens with the applied swatches ticked, and after × with none', async () => {
      const user = userEvent.setup();
      render(<StatefulHarness />);

      await user.click(screen.getByRole('button', { name: 'Цвет' }));
      await user.click(screen.getByRole('checkbox', { name: 'Черный 5' }));
      await user.click(screen.getByRole('checkbox', { name: 'Синий 7' }));
      await user.click(screen.getByRole('button', { name: 'Применить' }));

      await user.click(screen.getByRole('button', { name: 'Цвет черный, синий' }));
      expect(screen.getByRole('checkbox', { name: 'Черный 5' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Синий 7' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'С принтом 3' })).not.toBeChecked();
      await user.keyboard('{Escape}');

      await user.click(screen.getByRole('button', { name: 'Сбросить «Цвет»' }));
      await user.click(screen.getByRole('button', { name: 'Цвет' }));
      expect(
        screen
          .getAllByRole('checkbox')
          .filter((box) => box.getAttribute('aria-checked') === 'true'),
      ).toEqual([]);
    });
  });

  it('ignores the colour without swatches: a plain checkbox, no swatch look', async () => {
    await open({ swatches: false });

    const box = screen.getByRole('checkbox', { name: 'Синий 7' });
    expect(box).not.toHaveAttribute('data-bordered');
    expect(box.style.background).toBe('');
  });
});
