import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CheckboxFilter, FilterDropdown } from '@/shared/ui';

const options = [
  { value: 'evening', label: 'Вечерний' },
  { value: 'business', label: 'Деловой' },
];

function Dropdown(props: Partial<React.ComponentProps<typeof FilterDropdown>>) {
  return (
    <FilterDropdown title="Стиль" {...props}>
      <CheckboxFilter options={options} value={[]} onApply={vi.fn()} />
    </FilterDropdown>
  );
}

describe('FilterDropdown', () => {
  it('is closed at first', () => {
    render(<Dropdown />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens on a click and reports it', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Dropdown onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole('button', { name: 'Стиль' }));

    expect(screen.getByRole('dialog', { name: 'Стиль' })).toBeInTheDocument();
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it.each([['{Enter}'], [' ']])('opens on %j and moves the focus inside', async (key) => {
    const user = userEvent.setup();
    render(<Dropdown />);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Стиль' })).toHaveFocus();
    await user.keyboard(key);

    const dialog = screen.getByRole('dialog', { name: 'Стиль' });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(screen.getByRole('button', { name: 'Стиль' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes on Esc and returns the focus to the chip', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Dropdown onOpenChange={onOpenChange} />);

    await user.tab();
    await user.keyboard('{Enter}');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Стиль' })).toHaveFocus();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('names the dialog and the list after label rather than title', async () => {
    const user = userEvent.setup();
    render(<Dropdown title="Вечерний" label="Стиль одежды" />);

    await user.click(screen.getByRole('button', { name: 'Вечерний' }));

    expect(screen.getByRole('dialog', { name: 'Стиль одежды' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Стиль одежды' })).toBeInTheDocument();
  });

  it('is applied by value, or by the applied prop', () => {
    const { rerender } = render(<Dropdown />);
    expect(screen.getByRole('button', { name: 'Стиль' })).toBeInTheDocument();

    rerender(<Dropdown value="вечерний" onClear={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Сбросить «Стиль»' })).toBeInTheDocument();

    rerender(<Dropdown applied onClear={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Сбросить «Стиль»' })).toBeInTheDocument();

    rerender(<Dropdown value="вечерний" applied={false} onClear={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Сбросить/ })).not.toBeInTheDocument();
  });

  it('is not applied with an empty value: no ×, the chevron stays', () => {
    render(<Dropdown value="" onClear={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /Сбросить/ })).not.toBeInTheDocument();
    const chip = screen.getByRole('button', { name: 'Стиль' });
    expect(chip.querySelector('svg')).not.toBeNull();
  });

  describe('defaultOpen', () => {
    it('renders open without taking the focus', () => {
      render(
        <>
          <button type="button">До</button>
          <Dropdown defaultOpen />
        </>,
      );

      expect(screen.getByRole('dialog', { name: 'Стиль' })).toBeInTheDocument();
      const dialog = screen.getByRole('dialog');
      expect(dialog).not.toContainElement(document.activeElement as HTMLElement);
    });

    it('moves the focus inside when opened again later', async () => {
      const user = userEvent.setup();
      render(<Dropdown defaultOpen />);

      await user.keyboard('{Escape}');
      await user.click(screen.getByRole('button', { name: 'Стиль' }));
      await user.keyboard('{Escape}');
      await user.tab({ shift: true });
      await user.tab();
      await user.keyboard('{Enter}');

      const dialog = screen.getByRole('dialog', { name: 'Стиль' });
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    });
  });
});
