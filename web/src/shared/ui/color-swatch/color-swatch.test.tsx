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

  describe('hex colour', () => {
    function renderHex(color: `#${string}`) {
      render(<ColorSwatch color={color}>Цвет</ColorSwatch>);
      return screen.getByRole('checkbox', { name: 'Цвет' });
    }

    it.each(['#0000FF', '#000000', '#743D02'])('%s: white tick, no border', (hex) => {
      const swatch = renderHex(hex as `#${string}`);

      expect(swatch.style.background).not.toBe('');
      expect(swatch).not.toHaveAttribute('data-light');
      expect(swatch).not.toHaveAttribute('data-bordered');
    });

    it.each(['#FFEC1C', '#8BCDFF', '#DFBD93', '#B6B6B6', '#3972FC'])(
      '%s: black tick, no border',
      (hex) => {
        const swatch = renderHex(hex as `#${string}`);

        expect(swatch).toHaveAttribute('data-light');
        expect(swatch).not.toHaveAttribute('data-bordered');
      },
    );

    it.each(['#FFFFFF', '#ffffff'])('%s: black tick and a border', (hex) => {
      const swatch = renderHex(hex as `#${string}`);

      expect(swatch).toHaveAttribute('data-light');
      expect(swatch).toHaveAttribute('data-bordered');
    });

    // Black and white contrast equally at luminance about 0.179: #767676 is 0.181, #757575 is 0.178.
    it('flips the tick to black just above the equal-contrast luminance', () => {
      const { unmount } = render(<ColorSwatch color="#767676">Выше</ColorSwatch>);
      expect(screen.getByRole('checkbox', { name: 'Выше' })).toHaveAttribute('data-light');
      unmount();

      render(<ColorSwatch color="#757575">Ниже</ColorSwatch>);
      expect(screen.getByRole('checkbox', { name: 'Ниже' })).not.toHaveAttribute('data-light');
    });

    it('paints the swatch with the hex itself', () => {
      const swatch = renderHex('#3972FC');

      expect(swatch.style.background).toBe('rgb(57, 114, 252)');
    });

    it('borders a near-white hex above luminance 0.9, not one below', () => {
      const { unmount } = render(<ColorSwatch color="#F5F5F5">Светлый</ColorSwatch>);
      expect(screen.getByRole('checkbox', { name: 'Светлый' })).toHaveAttribute('data-bordered');
      unmount();

      render(<ColorSwatch color="#E0E0E0">Серый</ColorSwatch>);
      expect(screen.getByRole('checkbox', { name: 'Серый' })).not.toHaveAttribute('data-bordered');
    });

    it('treats the hex case alike', () => {
      const swatch = renderHex('#ffEC1c');

      expect(swatch).toHaveAttribute('data-light');
      expect(swatch).not.toHaveAttribute('data-bordered');
      expect(swatch.style.background).toBe('rgb(255, 236, 28)');
    });
  });

  describe('no colour', () => {
    it('is an empty bordered circle with a black tick', () => {
      render(<ColorSwatch>Без цвета</ColorSwatch>);
      const swatch = screen.getByRole('checkbox', { name: 'Без цвета' });

      expect(swatch.style.background).toBe('');
      expect(swatch).toHaveAttribute('data-bordered');
      expect(swatch).toHaveAttribute('data-light');
    });

    it('keeps the black tick and the border when checked', () => {
      render(<ColorSwatch defaultChecked>Без цвета</ColorSwatch>);
      const swatch = screen.getByRole('checkbox', { name: 'Без цвета' });

      expect(swatch).toBeChecked();
      expect(swatch).toHaveAttribute('data-bordered');
      expect(swatch).toHaveAttribute('data-light');
    });

    it('still toggles', async () => {
      const user = userEvent.setup();
      render(<ColorSwatch>Без цвета</ColorSwatch>);

      await user.click(screen.getByText('Без цвета'));

      expect(screen.getByRole('checkbox', { name: 'Без цвета' })).toBeChecked();
    });

    it.each(['#fff', '#GGGGGG', '#1234567'])('%s is treated as no colour', (hex) => {
      render(<ColorSwatch color={hex as `#${string}`}>Цвет</ColorSwatch>);
      const swatch = screen.getByRole('checkbox', { name: 'Цвет' });

      expect(swatch.style.background).toBe('');
      expect(swatch).toHaveAttribute('data-bordered');
      expect(swatch).toHaveAttribute('data-light');
    });

    it.each(['red);position:fixed', 'no-such-token', ''])(
      'the string %j, neither a hex nor a token, is treated as no colour',
      (value) => {
        render(<ColorSwatch color={value as SwatchColor}>Цвет</ColorSwatch>);
        const swatch = screen.getByRole('checkbox', { name: 'Цвет' });

        expect(swatch.style.background).toBe('');
        expect(swatch).toHaveAttribute('data-bordered');
        expect(swatch).toHaveAttribute('data-light');
      },
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
