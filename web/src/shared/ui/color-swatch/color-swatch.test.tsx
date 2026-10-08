import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CheckboxGroup, ColorSwatch, swatchColors, type SwatchColor } from '@/shared/ui';

describe('ColorSwatch', () => {
  it('is a checkbox named by the colour name and the count', () => {
    render(
      <ColorSwatch color="red" count={6129}>
        Красный
      </ColorSwatch>,
    );

    expect(screen.getByRole('checkbox', { name: /Красный/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /6129/ })).toBeInTheDocument();
  });

  it('is named by the colour alone without a count', () => {
    render(<ColorSwatch color="red">Красный</ColorSwatch>);

    expect(screen.getByRole('checkbox', { name: 'Красный' })).toBeInTheDocument();
  });

  it('toggles on a click of the name', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <ColorSwatch color="red" onCheckedChange={onCheckedChange}>
        Красный
      </ColorSwatch>,
    );

    await user.click(screen.getByText('Красный'));
    expect(screen.getByRole('checkbox', { name: 'Красный' })).toBeChecked();
    expect(onCheckedChange.mock.calls.at(-1)?.[0]).toBe(true);

    await user.click(screen.getByText('Красный'));
    expect(screen.getByRole('checkbox', { name: 'Красный' })).not.toBeChecked();
  });

  it('toggles with Space on the focused swatch', async () => {
    const user = userEvent.setup();
    render(<ColorSwatch color="red">Красный</ColorSwatch>);

    await user.tab();
    expect(screen.getByRole('checkbox', { name: 'Красный' })).toHaveFocus();
    await user.keyboard(' ');

    expect(screen.getByRole('checkbox', { name: 'Красный' })).toBeChecked();
  });

  it('does not toggle when disabled', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <ColorSwatch color="red" disabled onCheckedChange={onCheckedChange}>
        Красный
      </ColorSwatch>,
    );

    await user.click(screen.getByText('Красный'));

    expect(screen.getByRole('checkbox', { name: 'Красный' })).not.toBeChecked();
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it.each(swatchColors)('marks the %s swatch light and bordered as designed', (color) => {
    render(<ColorSwatch color={color}>Цвет</ColorSwatch>);
    const swatch = screen.getByRole('checkbox', { name: 'Цвет' });

    const lightColors: SwatchColor[] = [
      'gray',
      'white',
      'beige',
      'pink',
      'orange',
      'yellow',
      'blue',
      'gold',
      'silver',
      'transparent',
    ];
    expect(swatch.hasAttribute('data-light')).toBe(lightColors.includes(color));
    expect(swatch.hasAttribute('data-bordered')).toBe(color === 'white' || color === 'transparent');
  });

  it('paints the swatch with the colour token', () => {
    render(<ColorSwatch color="navy-blue">Синий</ColorSwatch>);

    expect(screen.getByRole('checkbox', { name: 'Синий' }).style.background).toContain(
      '--color-swatch-navy-blue',
    );
  });

  it('picks several colours inside a CheckboxGroup', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <CheckboxGroup aria-label="Цвет" onValueChange={onValueChange}>
        <ColorSwatch value="black" color="black">
          Черный
        </ColorSwatch>
        <ColorSwatch value="beige" color="beige">
          Бежевый
        </ColorSwatch>
      </CheckboxGroup>,
    );

    await user.click(screen.getByText('Бежевый'));
    await user.click(screen.getByText('Черный'));

    expect(onValueChange.mock.calls.at(-1)?.[0]).toEqual(['beige', 'black']);
    expect(screen.getByRole('checkbox', { name: 'Бежевый' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Черный' })).toBeChecked();
  });
});
