import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { FilterDropdown, SortFilter, SortFilterPanel } from '@/shared/ui';

const options = [
  { value: 'popularity', label: 'Подобрали для вас' },
  { value: 'new', label: 'Новинки' },
  { value: 'price-desc', label: 'Сначала дороже' },
];

// Tab to the chip and open it with Enter. Base UI moves the focus into the popup after the open
// renders, not within the key press, so wait for it: under load the next key would reach the chip.
async function openWithKeyboard(user: ReturnType<typeof userEvent.setup>) {
  await user.tab();
  await user.keyboard('{Enter}');
  await vi.waitFor(() =>
    expect(screen.getByRole('radio', { name: 'Подобрали для вас' })).toHaveFocus(),
  );
}

function Harness({ onValueChange }: { onValueChange?: (value: string) => void }) {
  const [sort, setSort] = useState('popularity');
  const title = options.find((option) => option.value === sort)!.label;
  return (
    <FilterDropdown title={title} label="Сортировка" applied={sort !== 'popularity'}>
      <SortFilter
        options={options}
        value={sort}
        onValueChange={(next) => {
          setSort(next);
          onValueChange?.(next);
        }}
      />
    </FilterDropdown>
  );
}

describe('SortFilter outside a FilterDropdown', () => {
  it('throws a message naming the component', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() =>
        render(<SortFilter options={options} value="new" onValueChange={vi.fn()} />),
      ).toThrow('SortFilter lives inside a FilterDropdown');
    } finally {
      error.mockRestore();
    }
  });
});

describe('SortFilterPanel', () => {
  function Panel({
    layout,
    onValueChange,
  }: {
    layout?: 'list' | 'sheet';
    onValueChange?: (value: string) => void;
  }) {
    const [sort, setSort] = useState('popularity');
    return (
      <SortFilterPanel
        label="Сортировка"
        layout={layout}
        options={options}
        value={sort}
        onValueChange={(next) => {
          setSort(next);
          onValueChange?.(next);
        }}
      />
    );
  }

  it.each([undefined, 'list', 'sheet'] as const)(
    'in the %s layout names the group, checks the value and picks on a click',
    async (layout) => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      render(<Panel layout={layout} onValueChange={onValueChange} />);

      expect(screen.getByRole('radiogroup', { name: 'Сортировка' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Подобрали для вас' })).toBeChecked();

      await user.click(screen.getByRole('radio', { name: 'Новинки' }));

      expect(onValueChange).toHaveBeenCalledWith('new');
      expect(screen.getByRole('radio', { name: 'Новинки' })).toBeChecked();
      expect(screen.getByRole('radio', { name: 'Подобрали для вас' })).not.toBeChecked();
    },
  );

  it('picks by a click on the label text in the sheet layout', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Panel layout="sheet" onValueChange={onValueChange} />);

    await user.click(screen.getByText('Сначала дороже'));

    expect(onValueChange).toHaveBeenCalledWith('price-desc');
  });
});

describe('SortFilter', () => {
  it('names the dialog and the radio group after the label, and checks the current value', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Подобрали для вас' }));

    expect(screen.getByRole('dialog', { name: 'Сортировка' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Сортировка' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Подобрали для вас' })).toBeChecked();
  });

  it('applies on a click, closes, and the chip shows the order', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Harness onValueChange={onValueChange} />);

    await user.click(screen.getByRole('button', { name: 'Подобрали для вас' }));
    await user.click(screen.getByRole('radio', { name: 'Новинки' }));

    expect(onValueChange).toHaveBeenCalledWith('new');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Новинки' })).toHaveFocus();
  });

  it('applies when the label text is clicked', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Harness onValueChange={onValueChange} />);

    await user.click(screen.getByRole('button', { name: 'Подобрали для вас' }));
    await user.click(screen.getByText('Новинки'));

    expect(onValueChange).toHaveBeenCalledWith('new');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on a click of the already chosen option without a new value', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Harness onValueChange={onValueChange} />);

    await user.click(screen.getByRole('button', { name: 'Подобрали для вас' }));
    await user.click(screen.getByRole('radio', { name: 'Подобрали для вас' }));

    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('moves the focus inside on Enter, arrows pick without closing (D7f), Space closes', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Harness onValueChange={onValueChange} />);

    await openWithKeyboard(user);
    expect(screen.getByRole('dialog', { name: 'Сортировка' })).toBeInTheDocument();

    await user.keyboard('{ArrowDown}');
    expect(onValueChange).toHaveBeenLastCalledWith('new');
    expect(screen.getByRole('radio', { name: 'Новинки' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Новинки' })).toHaveFocus();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{ArrowDown}');
    expect(onValueChange).toHaveBeenLastCalledWith('price-desc');
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('radio', { name: 'Новинки' })).toBeChecked();

    await user.keyboard(' ');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('wraps ArrowUp from the first radio to the last, applies it and stays open', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Harness onValueChange={onValueChange} />);

    await openWithKeyboard(user);
    await user.keyboard('{ArrowUp}');

    expect(onValueChange).toHaveBeenLastCalledWith('price-desc');
    expect(screen.getByRole('radio', { name: 'Сначала дороже' })).toBeChecked();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes on Space on the already checked radio and returns the focus to the chip', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await openWithKeyboard(user);
    await user.keyboard(' ');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Подобрали для вас' })).toHaveFocus();
  });

  it('stays open and changes nothing on a click on the list itself, outside any row', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Harness onValueChange={onValueChange} />);
    await user.click(screen.getByRole('button', { name: 'Подобрали для вас' }));

    // The close is deferred with setTimeout: fake timers, so the test can run it.
    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole('radiogroup', { name: 'Сортировка' }));
      act(() => {
        vi.runAllTimers();
      });

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(onValueChange).not.toHaveBeenCalled();
      expect(screen.getByRole('radio', { name: 'Подобрали для вас' })).toBeChecked();
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes on Enter', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await openWithKeyboard(user);
    await user.keyboard('{ArrowDown}{Enter}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Новинки' })).toHaveFocus();
  });
});
