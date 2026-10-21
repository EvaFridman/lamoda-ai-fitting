import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { formatAmount } from '@/shared/lib';
import { PriceFilterPanel, type PriceRange } from '@/shared/ui';

const bounds: PriceRange = [60, 288900];

function Harness({
  initial = bounds,
  onValueChange,
}: {
  initial?: PriceRange;
  onValueChange?: (value: PriceRange) => void;
}) {
  const [value, setValue] = useState<PriceRange>(initial);
  return (
    <>
      <PriceFilterPanel
        label="Цена"
        min={bounds[0]}
        max={bounds[1]}
        value={value}
        onValueChange={(next) => {
          setValue(next);
          onValueChange?.(next);
        }}
      />
      <button type="button" onClick={() => setValue(bounds)}>
        Сбросить снаружи
      </button>
      <button type="button" onClick={() => setValue([1500, 9000])}>
        Задать снаружи
      </button>
    </>
  );
}

describe('PriceFilterPanel', () => {
  it('starts with empty fields at the bounds, which are the placeholders, and no "Применить"', () => {
    render(<Harness />);

    expect(screen.getByRole('textbox', { name: 'Мин. цена' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Мин. цена' })).toHaveAttribute('placeholder', '60');
    expect(screen.getByRole('textbox', { name: 'Макс. цена' })).toHaveAttribute(
      'placeholder',
      formatAmount(288900),
    );
    expect(screen.getByRole('slider', { name: 'Мин. цена' })).toHaveAttribute(
      'aria-valuenow',
      '60',
    );
    expect(screen.queryByRole('button', { name: 'Применить' })).not.toBeInTheDocument();
  });

  it('shows a given range in the fields and on the thumbs', () => {
    render(<Harness initial={[1500, 9000]} />);

    expect(screen.getByRole('textbox', { name: 'Мин. цена' })).toHaveValue(formatAmount(1500));
    expect(screen.getByRole('textbox', { name: 'Макс. цена' })).toHaveValue(formatAmount(9000));
    expect(screen.getByRole('slider', { name: 'Макс. цена' })).toHaveAttribute(
      'aria-valuenow',
      '9000',
    );
  });

  it('reports a typed price at once, kept within the bounds', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Harness onValueChange={onValueChange} />);

    await user.type(screen.getByRole('textbox', { name: 'Мин. цена' }), '1500');

    expect(onValueChange).toHaveBeenLastCalledWith([1500, 288900]);
    expect(screen.getByRole('slider', { name: 'Мин. цена' })).toHaveAttribute(
      'aria-valuenow',
      '1500',
    );
  });

  it('reports a thumb moved by the keyboard', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Harness onValueChange={onValueChange} />);

    screen.getByRole('slider', { name: 'Мин. цена' }).focus();
    await user.keyboard('{ArrowRight}');

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith([61, 288900]);
  });

  it('rewrites the field texts when the range changes from outside, and back on a reset', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole('textbox', { name: 'Мин. цена' }), '1500');
    expect(screen.getByRole('textbox', { name: 'Мин. цена' })).toHaveValue('1500');

    await user.click(screen.getByRole('button', { name: 'Сбросить снаружи' }));
    expect(screen.getByRole('textbox', { name: 'Мин. цена' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Макс. цена' })).toHaveValue('');
    expect(screen.getByRole('slider', { name: 'Мин. цена' })).toHaveAttribute(
      'aria-valuenow',
      '60',
    );

    await user.click(screen.getByRole('button', { name: 'Задать снаружи' }));
    expect(screen.getByRole('textbox', { name: 'Мин. цена' })).toHaveValue(formatAmount(1500));
    expect(screen.getByRole('textbox', { name: 'Макс. цена' })).toHaveValue(formatAmount(9000));
  });

  it('rewrites the field texts when the bounds change under the same range', () => {
    const range: PriceRange = [5000, 10000];
    const panel = (min: number, max: number) => (
      <PriceFilterPanel label="Цена" min={min} max={max} value={range} onValueChange={vi.fn()} />
    );
    const { rerender } = render(panel(1000, 10000));
    expect(screen.getByRole('textbox', { name: 'Мин. цена' })).toHaveValue(formatAmount(5000));
    expect(screen.getByRole('textbox', { name: 'Макс. цена' })).toHaveValue('');

    rerender(panel(5000, 20000));

    expect(screen.getByRole('textbox', { name: 'Мин. цена' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Макс. цена' })).toHaveValue(formatAmount(10000));
    expect(screen.getByRole('textbox', { name: 'Макс. цена' })).toHaveAttribute(
      'placeholder',
      formatAmount(20000),
    );
  });
});
