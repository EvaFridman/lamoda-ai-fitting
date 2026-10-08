import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SizeSelector } from '@/shared/ui';

const options = [
  { value: '40', label: '40' },
  { value: '42', label: '42', soldOut: true },
  { value: '44', label: '44' },
  { value: '46', label: '46' },
];

describe('SizeSelector', () => {
  it('is a radiogroup named by aria-label with a radio per size', () => {
    render(<SizeSelector aria-label="Размер товара" options={options} defaultValue="44" />);

    expect(screen.getByRole('radiogroup', { name: 'Размер товара' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.getByRole('radio', { name: '44' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '40' })).not.toBeChecked();
  });

  it('is named by a visible heading through aria-labelledby', () => {
    render(
      <>
        <p id="heading">Размеры</p>
        <SizeSelector aria-labelledby="heading" options={options} />
      </>,
    );

    expect(screen.getByRole('radiogroup', { name: 'Размеры' })).toBeInTheDocument();
  });

  it('picks one size on a click', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <SizeSelector
        aria-label="Размер товара"
        options={options}
        defaultValue="40"
        onValueChange={onValueChange}
      />,
    );

    await user.click(screen.getByRole('radio', { name: '46' }));

    expect(screen.getByRole('radio', { name: '46' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '40' })).not.toBeChecked();
    expect(onValueChange.mock.calls.at(-1)?.[0]).toBe('46');
  });

  it('announces a sold out size as unavailable', () => {
    render(<SizeSelector aria-label="Размер товара" options={options} />);

    expect(screen.getByRole('radio', { name: '42' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('radio', { name: '44' })).not.toHaveAttribute('aria-disabled');
  });

  it('does not pick a sold out size on a click', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <SizeSelector
        aria-label="Размер товара"
        options={options}
        defaultValue="44"
        onValueChange={onValueChange}
      />,
    );

    await user.click(screen.getByRole('radio', { name: '42' }));

    expect(screen.getByRole('radio', { name: '42' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: '44' })).toBeChecked();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('skips a sold out size with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<SizeSelector aria-label="Размер товара" options={options} defaultValue="40" />);

    await user.tab();
    expect(screen.getByRole('radio', { name: '40' })).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: '44' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '44' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: '42' })).not.toBeChecked();

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: '40' })).toBeChecked();
  });

  it('wraps the arrow keys from the last in-stock size to the first', async () => {
    const user = userEvent.setup();
    render(<SizeSelector aria-label="Размер товара" options={options} defaultValue="46" />);

    await user.tab();
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('radio', { name: '40' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '40' })).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: '46' })).toBeChecked();
  });

  it('leaves the Tab order when every size is sold out', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">До</button>
        <SizeSelector
          aria-label="Размер товара"
          options={[
            { value: '40', label: '40', soldOut: true },
            { value: '42', label: '42', soldOut: true },
          ]}
        />
        <button type="button">После</button>
      </>,
    );

    await user.tab();
    await user.tab();

    expect(screen.getByRole('button', { name: 'После' })).toHaveFocus();
  });

  it('leaves a disabled group out of the Tab order and does not pick in it', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <>
        <button type="button">До</button>
        <SizeSelector
          aria-label="Размер товара"
          options={options}
          defaultValue="44"
          disabled
          onValueChange={onValueChange}
        />
        <button type="button">После</button>
      </>,
    );

    await user.tab();
    await user.tab();
    expect(screen.getByRole('button', { name: 'После' })).toHaveFocus();

    await user.click(screen.getByRole('radio', { name: '46' }));
    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: '44' })).toBeChecked();
  });
});
