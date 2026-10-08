import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SizePicker } from '@/shared/ui';

const options = [
  { value: '42', label: '42' },
  { value: '44', label: '44' },
  { value: '46', label: '46', disabled: true },
  { value: '48', label: '48' },
];

describe('SizePicker', () => {
  it('is a group named by aria-label with a checkbox per size', () => {
    render(<SizePicker aria-label="Размер" options={options} defaultValue={['44']} />);

    expect(screen.getByRole('group', { name: 'Размер' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
    expect(screen.getByRole('checkbox', { name: '44' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '42' })).not.toBeChecked();
  });

  it('is named by a visible heading through aria-labelledby', () => {
    render(
      <>
        <p id="heading">Размеры</p>
        <SizePicker aria-labelledby="heading" options={options} />
      </>,
    );

    expect(screen.getByRole('group', { name: 'Размеры' })).toBeInTheDocument();
  });

  it('picks several sizes and reports the whole list', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<SizePicker aria-label="Размер" options={options} onValueChange={onValueChange} />);

    await user.click(screen.getByRole('checkbox', { name: '42' }));
    await user.click(screen.getByRole('checkbox', { name: '48' }));

    expect(screen.getByRole('checkbox', { name: '42' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '48' })).toBeChecked();
    expect(onValueChange.mock.calls.at(-1)?.[0]).toEqual(['42', '48']);

    await user.click(screen.getByRole('checkbox', { name: '42' }));
    expect(screen.getByRole('checkbox', { name: '42' })).not.toBeChecked();
    expect(onValueChange.mock.calls.at(-1)?.[0]).toEqual(['48']);
  });

  it('reports the picked sizes in the order of the options, not of the clicks', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<SizePicker aria-label="Размер" options={options} onValueChange={onValueChange} />);

    await user.click(screen.getByRole('checkbox', { name: '48' }));
    await user.click(screen.getByRole('checkbox', { name: '42' }));
    await user.click(screen.getByRole('checkbox', { name: '44' }));

    expect(onValueChange.mock.calls.at(-1)?.[0]).toEqual(['42', '44', '48']);
  });

  it('moves with Tab from cell to cell and toggles with Space', async () => {
    const user = userEvent.setup();
    render(<SizePicker aria-label="Размер" options={options} />);

    await user.tab();
    expect(screen.getByRole('checkbox', { name: '42' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('checkbox', { name: '44' })).toHaveFocus();

    await user.keyboard(' ');
    expect(screen.getByRole('checkbox', { name: '44' })).toBeChecked();
    await user.keyboard(' ');
    expect(screen.getByRole('checkbox', { name: '44' })).not.toBeChecked();
  });

  it('does not toggle a disabled cell and Tab skips it', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <>
        <SizePicker aria-label="Размер" options={options} onValueChange={onValueChange} />
        <button type="button">После</button>
      </>,
    );

    await user.click(screen.getByRole('checkbox', { name: '46' }));
    expect(screen.getByRole('checkbox', { name: '46' })).not.toBeChecked();
    expect(onValueChange).not.toHaveBeenCalled();

    await user.tab();
    await user.tab();
    await user.tab();
    expect(screen.getByRole('checkbox', { name: '48' })).toHaveFocus();
  });

  it('shows a checked disabled cell as checked', () => {
    render(<SizePicker aria-label="Размер" options={options} defaultValue={['46']} />);

    expect(screen.getByRole('checkbox', { name: '46' })).toBeChecked();
  });

  it('follows the value prop when controlled', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <SizePicker
        aria-label="Размер"
        options={options}
        value={['42']}
        onValueChange={onValueChange}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: '44' }));

    expect(onValueChange.mock.calls.at(-1)?.[0]).toEqual(['42', '44']);
    expect(screen.getByRole('checkbox', { name: '44' })).not.toBeChecked();
  });
});
