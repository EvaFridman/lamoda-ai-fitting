import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { sections } from './sections';
import { UiKitPage } from './ui-kit-page';

function renderRegion() {
  render(<UiKitPage />);
  return screen.getByRole('region', { name: 'Размеры и цвета' });
}

describe('sizes and colors section', () => {
  it('is in the sections list and rendered as a region', () => {
    expect(sections.map((section) => [section.id, section.title])).toContainEqual([
      'sizes-colors',
      'Размеры и цвета',
    ]);
    expect(renderRegion()).toBeInTheDocument();
  });

  it('shows the four SizePicker states', () => {
    const region = renderRegion();

    const expected = {
      'по умолчанию': [false, false],
      checked: [true, false],
      disabled: [false, true],
      'disabled · checked': [true, true],
    } as const;
    for (const [props, [checked, disabled]] of Object.entries(expected)) {
      const group = within(region).getByRole('group', { name: `Размер: ${props}` });
      const cell = within(group).getByRole('checkbox', { name: '44' });
      expect(cell.getAttribute('aria-checked')).toBe(String(checked));
      expect(cell.hasAttribute('data-disabled')).toBe(disabled);
    }
  });

  it('shows the four SizeSelector states', () => {
    const region = renderRegion();

    const expected = {
      'по умолчанию': ['false', false, false],
      checked: ['true', false, false],
      soldOut: ['false', true, false],
      disabled: ['false', false, true],
    } as const;
    for (const [props, [checked, soldOut, disabled]] of Object.entries(expected)) {
      const group = within(region).getByRole('radiogroup', { name: `Размер товара: ${props}` });
      const radio = within(group).getByRole('radio', { name: '44' });
      expect(radio).toHaveAttribute('aria-checked', checked);
      expect(radio.getAttribute('aria-disabled') === 'true').toBe(soldOut);
      expect(radio.hasAttribute('data-disabled')).toBe(disabled);
    }
  });

  it('shows the four ColorSwatch states', () => {
    const region = renderRegion();
    const swatches = within(region).getAllByRole('checkbox', { name: /^(Черный|Белый|Красный)$/ });

    const [plain, checked, light, disabled] = swatches;
    expect(plain).not.toBeChecked();
    expect(checked).toBeChecked();
    expect(light).toBeChecked();
    expect(light).toHaveAttribute('data-light');
    expect(light).toHaveAttribute('data-bordered');
    expect(disabled).toHaveAttribute('data-disabled');
    expect(disabled).not.toBeChecked();
  });
});

describe('SizePicker demo', () => {
  it('starts with 44 and lists the picked sizes', async () => {
    const user = userEvent.setup();
    const region = renderRegion();
    const group = within(region).getByRole('group', { name: 'Размер' });
    // the demo's own block: the "Выбрано" line of the SizeSelector demo says the same
    const demo = within(group.parentElement!);

    expect(within(group).getByRole('checkbox', { name: '44' })).toBeChecked();
    expect(demo.getByText('Выбрано: 44')).toBeInTheDocument();

    await user.click(within(group).getByRole('checkbox', { name: '50' }));
    expect(demo.getByText('Выбрано: 44, 50')).toBeInTheDocument();

    await user.click(within(group).getByRole('checkbox', { name: '44' }));
    await user.click(within(group).getByRole('checkbox', { name: '50' }));
    expect(demo.getByText('Ничего не выбрано')).toBeInTheDocument();
  });
});

describe('SizeSelector demo', () => {
  it('starts with 44, moves past sold out sizes and shows the pick', async () => {
    const user = userEvent.setup();
    const region = renderRegion();
    const group = within(region).getByRole('radiogroup', { name: 'Размер' });
    const demo = within(group.parentElement!);

    expect(within(group).getByRole('radio', { name: '44' })).toBeChecked();
    expect(demo.getByText('Выбрано: 44')).toBeInTheDocument();

    await user.click(within(group).getByRole('radio', { name: '42' }));
    expect(within(group).getByRole('radio', { name: '44' })).toBeChecked();
    expect(demo.getByText('Выбрано: 44')).toBeInTheDocument();

    await user.click(within(group).getByRole('radio', { name: '40' }));
    expect(demo.getByText('Выбрано: 40')).toBeInTheDocument();

    await user.keyboard('{ArrowRight}');
    expect(demo.getByText('Выбрано: 44')).toBeInTheDocument();
    expect(within(group).getByRole('radio', { name: '44' })).toHaveFocus();
  });
});

describe('ColorSwatch demo', () => {
  it('starts with beige and lists the picked colours', async () => {
    const user = userEvent.setup();
    const region = renderRegion();
    const group = within(region).getByRole('group', { name: 'Цвет' });

    expect(within(group).getByRole('checkbox', { name: /Бежевый/ })).toBeChecked();
    expect(within(region).getByText('Выбрано: beige')).toBeInTheDocument();

    await user.click(within(group).getByText('Красный'));
    expect(within(region).getByText('Выбрано: beige, red')).toBeInTheDocument();

    await user.click(within(group).getByText('Черный'));
    expect(within(region).getByText('Выбрано: black, beige, red')).toBeInTheDocument();

    await user.click(within(group).getByText('Бежевый'));
    await user.click(within(group).getByText('Красный'));
    await user.click(within(group).getByText('Черный'));
    expect(within(region).getByText('Ничего не выбрано')).toBeInTheDocument();
  });
});
