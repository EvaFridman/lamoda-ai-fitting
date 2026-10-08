import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { FilterDropdown, PriceFilter, type PriceRange } from '@/shared/ui';

const bounds: PriceRange = [60, 288900];

function Harness({
  initial = bounds,
  onApply,
}: {
  initial?: PriceRange;
  onApply?: (value: PriceRange) => void;
}) {
  const [value, setValue] = useState<PriceRange>(initial);
  return (
    <FilterDropdown title="Цена" onClear={() => setValue(bounds)}>
      <PriceFilter
        min={bounds[0]}
        max={bounds[1]}
        value={value}
        onApply={(next) => {
          setValue(next);
          onApply?.(next);
        }}
      />
    </FilterDropdown>
  );
}

async function open(initial?: PriceRange, onApply?: (value: PriceRange) => void) {
  const user = userEvent.setup();
  render(<Harness initial={initial} onApply={onApply} />);
  await user.click(screen.getByRole('button', { name: 'Цена' }));
  const dialog = screen.getByRole('dialog', { name: 'Цена' });
  return {
    user,
    dialog,
    minThumb: within(dialog).getByRole('slider', { name: 'Мин. цена' }),
    maxThumb: within(dialog).getByRole('slider', { name: 'Макс. цена' }),
    minField: within(dialog).getByRole('textbox', { name: 'Мин. цена' }),
    maxField: within(dialog).getByRole('textbox', { name: 'Макс. цена' }),
    apply: within(dialog).getByRole('button', { name: 'Применить' }),
  };
}

describe('PriceFilter fields and thumbs', () => {
  it('starts with empty fields showing the bounds as placeholders, and the thumbs at the bounds', async () => {
    const { minThumb, maxThumb, minField, maxField } = await open();

    expect(minField).toHaveValue('');
    expect(maxField).toHaveValue('');
    expect(minField).toHaveAttribute('placeholder', '60');
    expect(maxField).toHaveAttribute('placeholder', '288 900');
    expect(minThumb).toHaveAttribute('aria-valuenow', '60');
    expect(maxThumb).toHaveAttribute('aria-valuenow', '288900');
  });

  it('names the thumbs and reads their value as a price', async () => {
    const { minThumb, maxThumb } = await open();

    expect(minThumb).toHaveAttribute('aria-valuetext', '60 ₽');
    expect(maxThumb).toHaveAttribute('aria-valuetext', '288 900 ₽');
  });

  it('opens with the applied range in the fields and thumbs', async () => {
    const { minThumb, maxThumb, minField, maxField } = await open([1500, 9000]);

    expect(minField).toHaveValue('1 500');
    expect(maxField).toHaveValue('9 000');
    expect(minThumb).toHaveAttribute('aria-valuenow', '1500');
    expect(maxThumb).toHaveAttribute('aria-valuenow', '9000');
  });

  it('moves the field text with a thumb moved by the keyboard', async () => {
    const { user, minThumb, minField, maxField } = await open([1500, 9000]);

    minThumb.focus();
    await user.keyboard('{ArrowRight}');
    expect(minThumb).toHaveAttribute('aria-valuenow', '1501');
    expect(minField).toHaveValue('1 501');

    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(minThumb).toHaveAttribute('aria-valuenow', '1499');
    expect(minField).toHaveValue('1 499');
    expect(maxField).toHaveValue('9 000');
  });

  it('empties the field when a thumb comes back to its bound', async () => {
    const { user, minThumb, minField } = await open([61, 288900]);
    expect(minField).toHaveValue('61');

    minThumb.focus();
    await user.keyboard('{ArrowLeft}');

    expect(minThumb).toHaveAttribute('aria-valuenow', '60');
    expect(minField).toHaveValue('');
  });

  it('keeps the min thumb from passing the max', async () => {
    const { user, minThumb } = await open([5000, 5000]);

    minThumb.focus();
    await user.keyboard('{ArrowRight}');

    expect(minThumb).toHaveAttribute('aria-valuenow', '5000');
  });

  it('moves a thumb at once for a typed price in the bounds', async () => {
    const { user, minThumb, maxThumb, minField, maxField, apply } = await open();

    await user.type(minField, '1500');
    await user.type(maxField, '9000');

    expect(minThumb).toHaveAttribute('aria-valuenow', '1500');
    expect(maxThumb).toHaveAttribute('aria-valuenow', '9000');
    expect(apply).toBeEnabled();
  });

  it('ignores non-digit characters', async () => {
    const { user, minThumb, minField } = await open();

    await user.type(minField, 'a1б5-0.0');

    expect(minThumb).toHaveAttribute('aria-valuenow', '1500');
    await user.tab();
    expect(minField).toHaveValue('1 500');
  });

  it('sends the thumb back to the bound when the field is emptied', async () => {
    const { user, minThumb, minField } = await open([1500, 9000]);

    await user.clear(minField);

    expect(minThumb).toHaveAttribute('aria-valuenow', '60');
  });

  it('a min typed above the max puts the thumb on the max at once; blur corrects the text', async () => {
    const { user, minThumb, minField } = await open([1500, 9000]);

    await user.clear(minField);
    await user.type(minField, '20000');
    expect(minThumb).toHaveAttribute('aria-valuenow', '9000');
    expect(minField).toHaveValue('20000');

    await user.tab();
    expect(minThumb).toHaveAttribute('aria-valuenow', '9000');
    expect(minField).toHaveValue('9 000');
  });

  it('sends the min thumb to the bound when the typed price is erased below it', async () => {
    const { user, minThumb, minField } = await open([1500, 9000]);

    await user.clear(minField);
    await user.type(minField, '1500');
    expect(minThumb).toHaveAttribute('aria-valuenow', '1500');
    await user.keyboard('{Backspace}{Backspace}');

    expect(minField).toHaveValue('15');
    expect(minThumb).toHaveAttribute('aria-valuenow', '60');
  });

  it('puts the max thumb on the bound at once for an out-of-bounds max', async () => {
    const { user, maxThumb, maxField } = await open([1500, 9000]);

    await user.clear(maxField);
    await user.type(maxField, '999999');

    expect(maxThumb).toHaveAttribute('aria-valuenow', '288900');
    expect(maxField).toHaveValue('999999');
  });

  it('puts a max typed below the min on the min thumb at once', async () => {
    const { user, maxThumb, maxField } = await open([1500, 9000]);

    await user.clear(maxField);
    await user.type(maxField, '100');

    expect(maxThumb).toHaveAttribute('aria-valuenow', '1500');
    expect(maxField).toHaveValue('100');
  });

  it('sends a thumb to its bound when its field holds only spaces', async () => {
    const { user, minThumb, maxThumb, minField, maxField } = await open([1500, 9000]);

    await user.clear(minField);
    await user.type(minField, '   ');
    await user.clear(maxField);
    await user.type(maxField, '   ');

    expect(minThumb).toHaveAttribute('aria-valuenow', '60');
    expect(maxThumb).toHaveAttribute('aria-valuenow', '288900');
  });

  it('makes a max below the min the min on blur', async () => {
    const { user, maxThumb, maxField } = await open([1500, 9000]);

    await user.clear(maxField);
    await user.type(maxField, '100');
    await user.tab();

    expect(maxThumb).toHaveAttribute('aria-valuenow', '1500');
    expect(maxField).toHaveValue('1 500');
  });

  it('corrects an out-of-bounds price to the bound on blur', async () => {
    const { user, maxThumb, maxField, minThumb, minField } = await open([1500, 9000]);

    await user.clear(maxField);
    await user.type(maxField, '999999');
    await user.tab();
    expect(maxThumb).toHaveAttribute('aria-valuenow', '288900');
    expect(maxField).toHaveValue('');

    await user.clear(minField);
    await user.type(minField, '5');
    await user.tab();
    expect(minThumb).toHaveAttribute('aria-valuenow', '60');
    expect(minField).toHaveValue('');
  });

  it('corrects on Enter', async () => {
    const { user, minThumb, minField } = await open([1500, 9000]);

    await user.clear(minField);
    await user.type(minField, '20000{Enter}');

    expect(minThumb).toHaveAttribute('aria-valuenow', '9000');
    expect(minField).toHaveValue('9 000');
  });
});

describe('PriceFilter apply', () => {
  it('disables "Применить" until the range differs, and again when it returns', async () => {
    const { user, minThumb, apply } = await open([1500, 9000]);
    expect(apply).toBeDisabled();

    minThumb.focus();
    await user.keyboard('{ArrowRight}');
    expect(apply).toBeEnabled();

    await user.keyboard('{ArrowLeft}');
    expect(apply).toBeDisabled();
  });

  it('applies the draft, closes and returns the focus to the chip', async () => {
    const onApply = vi.fn();
    const { user, minField, maxField, apply } = await open(undefined, onApply);

    await user.type(minField, '1500');
    await user.type(maxField, '9000');
    await user.click(apply);

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith([1500, 9000]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Цена/ })).toHaveFocus();
  });

  it('applies a range moved with the keyboard', async () => {
    const onApply = vi.fn();
    const { user, maxThumb, apply } = await open(undefined, onApply);

    maxThumb.focus();
    await user.keyboard('{ArrowLeft}');
    await user.click(apply);

    expect(onApply).toHaveBeenCalledWith([60, 288899]);
  });

  it('loses the draft when closed with Esc', async () => {
    const onApply = vi.fn();
    const { user, minField } = await open(undefined, onApply);
    const chip = screen.getByRole('button', { name: 'Цена' });

    await user.type(minField, '1500');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(chip);
    expect(screen.getByRole('textbox', { name: 'Мин. цена' })).toHaveValue('');
    expect(screen.getByRole('slider', { name: 'Мин. цена' })).toHaveAttribute(
      'aria-valuenow',
      '60',
    );
    expect(onApply).not.toHaveBeenCalled();
  });
});

describe('PriceFilter typed prices that need correction', () => {
  it('enables "Применить" before blur for a min above the max; Tab corrects the field and reaches it', async () => {
    const onApply = vi.fn();
    const { user, minField, maxField, apply } = await open([1500, 9000], onApply);

    await user.tripleClick(minField);
    await user.paste('20000');
    expect(minField).toHaveValue('20000');
    expect(apply).toBeEnabled();

    await user.tab();
    expect(maxField).toHaveFocus();
    expect(minField).toHaveValue('9 000');
    expect(apply).toBeEnabled();
    expect(screen.getByRole('dialog', { name: 'Цена' })).toBeInTheDocument();

    await user.tab();
    expect(apply).toHaveFocus();

    await user.click(apply);
    expect(onApply).toHaveBeenCalledWith([9000, 9000]);
  });

  it('enables "Применить" before blur for a max above the bound; it applies the bound', async () => {
    const onApply = vi.fn();
    const { user, maxField, apply } = await open([1500, 9000], onApply);

    await user.tripleClick(maxField);
    await user.paste('999999999');
    expect(maxField).toHaveValue('999999999');
    expect(apply).toBeEnabled();

    await user.tab();
    expect(apply).toHaveFocus();
    await user.click(apply);
    expect(onApply).toHaveBeenCalledWith([1500, 288900]);
  });
});

describe('PriceFilter typing characters', () => {
  it('keeps only digits and spaces in the field while typing', async () => {
    const { user, minField } = await open();

    await user.type(minField, '12abc 3,4.5₽');

    expect(minField).toHaveValue('12 345');

    await user.tab();
    expect(minField).toHaveValue(`12${String.fromCodePoint(0xa0)}345`);
  });
});

describe('PriceFilter context', () => {
  it('throws outside a FilterDropdown', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() =>
        render(<PriceFilter min={60} max={288900} value={bounds} onApply={vi.fn()} />),
      ).toThrow('PriceFilter lives inside a FilterDropdown');
    } finally {
      error.mockRestore();
    }
  });
});
