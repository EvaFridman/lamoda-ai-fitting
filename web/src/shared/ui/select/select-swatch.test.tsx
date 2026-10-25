import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Select, type SelectOption } from '@/shared/ui';

const options: SelectOption[] = [
  { value: 'white', label: 'Белый', swatch: '#FFFFFF' },
  { value: 'red', label: 'Красный', swatch: '#FF0000' },
  { value: 'none', label: 'Без цвета', swatch: null },
  { value: 'plain', label: 'Простой' },
];

function dots(root: HTMLElement) {
  return [
    ...root.querySelectorAll<HTMLElement>('span[aria-hidden="true"][style], span[data-bordered]'),
  ];
}

describe('Select option swatches (spec 0019 A90.3)', () => {
  it('draws the colour circle before the label of the chosen option in the field', () => {
    render(<Select aria-label="Цвет" options={options} value="red" />);

    const trigger = screen.getByRole('combobox', { name: 'Цвет' });
    expect(trigger).toHaveTextContent('Красный');
    const dot = trigger.querySelector<HTMLElement>('span[style]');
    expect(dot).toHaveAttribute('aria-hidden', 'true');
    expect(dot?.style.background).toMatch(/rgb\(255, 0, 0\)|#ff0000/i);
  });

  it('draws a circle for each option that has a swatch in the list, and none for a plain one', async () => {
    render(<Select aria-label="Цвет" options={options} defaultOpen />);

    const list = await screen.findAllByRole('option');
    expect(list).toHaveLength(4);
    const [white, red, none, plain] = list as [HTMLElement, HTMLElement, HTMLElement, HTMLElement];
    expect(white.querySelector('span[aria-hidden="true"]')).not.toBeNull();
    expect(red.querySelector('span[aria-hidden="true"]')).not.toBeNull();
    expect(none.querySelector('span[aria-hidden="true"]')).not.toBeNull();
    expect(plain.querySelector('span[aria-hidden="true"]')).toBeNull();
  });

  it('draws an empty bordered circle for a null swatch', async () => {
    render(<Select aria-label="Цвет" options={options} defaultOpen />);

    const none = (await screen.findAllByRole('option'))[2]!;
    const dot = none.querySelector<HTMLElement>('span[aria-hidden="true"]');
    expect(dot).toHaveAttribute('data-bordered', 'true');
    expect(dot?.getAttribute('style')).toBeNull();
  });

  it('borders a near-white colour and not a dark one', async () => {
    render(<Select aria-label="Цвет" options={options} defaultOpen />);

    const [white, red] = await screen.findAllByRole('option');
    expect(white!.querySelector('span[aria-hidden="true"]')).toHaveAttribute(
      'data-bordered',
      'true',
    );
    expect(red!.querySelector('span[aria-hidden="true"]')).not.toHaveAttribute('data-bordered');
  });

  it('keeps the label as the option’s accessible name; the circle is decorative', async () => {
    render(<Select aria-label="Цвет" options={options} defaultOpen />);

    const list = await screen.findAllByRole('option');
    expect(list.map((option) => option.textContent)).toEqual([
      'Белый',
      'Красный',
      'Без цвета',
      'Простой',
    ]);
    expect(within(list[0]!).getByText('Белый')).toBeInTheDocument();
  });

  it('prefers a thumbnail to a swatch', async () => {
    render(
      <Select
        aria-label="Цвет"
        options={[
          { value: 'a', label: 'А', thumbnail: 'https://media.test/a.jpg', swatch: '#FF0000' },
        ]}
        defaultOpen
      />,
    );

    const option = (await screen.findAllByRole('option'))[0]!;
    expect(option.querySelector('img')).toHaveAttribute('src', 'https://media.test/a.jpg');
    expect(option.querySelector('span[aria-hidden="true"]')).toBeNull();
  });

  it('draws no circle when no option has a swatch', () => {
    render(<Select aria-label="Размер" options={[{ value: 's', label: 'S' }]} value="s" />);

    expect(dots(screen.getByRole('combobox', { name: 'Размер' }))).toEqual([]);
  });
});
