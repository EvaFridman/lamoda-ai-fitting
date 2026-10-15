import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { PriceRange } from '@/shared/ui';

import type { ProductSort } from '../model/filters';
import type { FacetAttribute, FacetBrand, FacetSize } from '../model/schemas';

import {
  AttributeFilter,
  BrandFilter,
  ColorFilter,
  DiscountFilter,
  PriceRangeFilter,
  ProductSortFilter,
  SizeFilter,
} from './catalog-filters';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// Spaces of prices are non-breaking; compare with plain ones.
const plain = (text: string | null) => (text ?? '').replace(/\s/g, ' ');

function attribute(name: string, values: [string, string | null, number][], base = 100) {
  return {
    id: id(base),
    name,
    values: values.map(([value, colorHex, count], index) => ({
      id: id(base + index + 1),
      value,
      colorHex,
      count,
    })),
  } as FacetAttribute;
}

const colors = attribute('Цвет', [
  ['Черный', '#000000', 5],
  ['Синий', '#3972FC', 7],
  ['С принтом', null, 3],
]);

// Keeps the applied value, as the page does, so the chip and its × can be checked.
function ListHarness({
  render: renderFilter,
  onApply,
}: {
  render: (value: string[], apply: (value: string[]) => void) => ReactNode;
  onApply?: (value: string[]) => void;
}) {
  const [value, setValue] = useState<string[]>([]);
  return renderFilter(value, (next) => {
    setValue(next);
    onApply?.(next);
  });
}

describe('ColorFilter', () => {
  const harness = (onApply?: (value: string[]) => void) => (
    <ListHarness
      onApply={onApply}
      render={(value, apply) => <ColorFilter attribute={colors} value={value} onApply={apply} />}
    />
  );

  it('titles the chip with the attribute name and lists name and count per row', async () => {
    const user = userEvent.setup();
    render(harness());

    await user.click(screen.getByRole('button', { name: 'Цвет' }));

    expect(screen.getByRole('checkbox', { name: 'Черный 5' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Синий 7' })).toHaveStyle({
      background: '#3972FC',
    });
    expect(screen.getByRole('checkbox', { name: 'С принтом 3' })).toBeInTheDocument();
  });

  it('lists a value without a colour as an empty circle', async () => {
    const user = userEvent.setup();
    render(harness());
    await user.click(screen.getByRole('button', { name: 'Цвет' }));

    const empty = screen.getByRole('checkbox', { name: 'С принтом 3' });
    expect(empty).toHaveAttribute('data-bordered');
    expect(empty.style.background).toBe('');
  });

  it('searches with "Найдите цвет"', async () => {
    const user = userEvent.setup();
    render(harness());
    await user.click(screen.getByRole('button', { name: 'Цвет' }));

    await user.type(screen.getByPlaceholderText('Найдите цвет'), 'син');

    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  });

  it('applies two picks in the order of the options; the chip then shows their number', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(harness(onApply));

    await user.click(screen.getByRole('button', { name: 'Цвет' }));
    await user.click(screen.getByRole('checkbox', { name: 'С принтом 3' }));
    await user.click(screen.getByRole('checkbox', { name: 'Черный 5' }));
    await user.click(screen.getByRole('button', { name: 'Применить' }));

    expect(onApply).toHaveBeenCalledWith([
      colors.values.find((item) => item.value === 'Черный')?.id,
      colors.values.find((item) => item.value === 'С принтом')?.id,
    ]);
    expect(screen.getByRole('button', { name: 'Цвет 2' })).toBeInTheDocument();
  });

  it('shows the one chosen name on the chip, and × reports an empty choice', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(harness(onApply));

    await user.click(screen.getByRole('button', { name: 'Цвет' }));
    await user.click(screen.getByRole('checkbox', { name: 'Синий 7' }));
    await user.click(screen.getByRole('button', { name: 'Применить' }));
    expect(screen.getByRole('button', { name: 'Цвет Синий' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Сбросить «Цвет»' }));

    expect(onApply).toHaveBeenLastCalledWith([]);
    expect(screen.getByRole('button', { name: 'Цвет' })).toBeInTheDocument();
  });
});

describe('AttributeFilter', () => {
  it('works for any attribute: "Материал" and "Сезон" with counts', async () => {
    const user = userEvent.setup();
    const material = attribute('Материал', [
      ['Хлопок', null, 12],
      ['Шерсть', null, 4],
    ]);
    const season = attribute(
      'Сезон',
      [
        ['Лето', null, 9],
        ['Зима', null, 2],
      ],
      200,
    );
    render(
      <>
        <AttributeFilter attribute={material} value={[]} onApply={vi.fn()} />
        <AttributeFilter attribute={season} value={[]} onApply={vi.fn()} />
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'Материал' }));
    expect(screen.getByRole('checkbox', { name: 'Хлопок 12' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Сезон' }));
    expect(screen.getByRole('checkbox', { name: 'Лето 9' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Зима 2' })).toBeInTheDocument();
  });

  it('reports the ids of the picks on "Применить"', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const material = attribute('Материал', [
      ['Хлопок', null, 12],
      ['Шерсть', null, 4],
    ]);
    render(<AttributeFilter attribute={material} value={[]} onApply={onApply} />);

    await user.click(screen.getByRole('button', { name: 'Материал' }));
    await user.click(screen.getByRole('checkbox', { name: 'Шерсть 4' }));
    await user.click(screen.getByRole('button', { name: 'Применить' }));

    expect(onApply).toHaveBeenCalledWith([
      material.values.find((item) => item.value === 'Шерсть')?.id,
    ]);
  });

  it.each([
    [8, true],
    [7, false],
  ])('with %i values the search field is present: %s', async (count, searchable) => {
    const user = userEvent.setup();
    const many = attribute(
      'Фасон',
      Array.from({ length: count }, (_, index) => [`Фасон ${index + 1}`, null, index + 1]),
    );
    render(<AttributeFilter attribute={many} value={[]} onApply={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Фасон' }));

    if (searchable) {
      expect(screen.getByPlaceholderText('Введите наименование')).toBeInTheDocument();
    } else {
      expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    }
  });
});

describe('BrandFilter', () => {
  const brands: FacetBrand[] = [
    { id: id(1), name: 'Adidas Originals', count: 8 },
    { id: id(2), name: 'Nike', count: 12 },
    { id: id(3), name: 'Puma', count: 5 },
  ];
  const harness = (onApply?: (value: string[]) => void) => (
    <ListHarness
      onApply={onApply}
      render={(value, apply) => <BrandFilter brands={brands} value={value} onApply={apply} />}
    />
  );

  it('finds a brand by part of its name, ignoring case', async () => {
    const user = userEvent.setup();
    render(harness());
    await user.click(screen.getByRole('button', { name: 'Бренд' }));

    await user.type(screen.getByPlaceholderText('Найдите бренд'), 'ORIGIN');

    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: 'Adidas Originals 8' })).toBeInTheDocument();
  });

  it('reports the ids and clears through the chip', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(harness(onApply));

    await user.click(screen.getByRole('button', { name: 'Бренд' }));
    await user.click(screen.getByRole('checkbox', { name: 'Puma 5' }));
    await user.click(screen.getByRole('checkbox', { name: 'Nike 12' }));
    await user.click(screen.getByRole('button', { name: 'Применить' }));
    expect(onApply).toHaveBeenCalledWith([id(2), id(3)]);

    await user.click(screen.getByRole('button', { name: 'Сбросить «Бренд»' }));
    expect(onApply).toHaveBeenLastCalledWith([]);
  });
});

describe('SizeFilter', () => {
  const sizes: FacetSize[] = ['L', '30', 'XS', 'M', '26', 'XL', 'S', '34'].map((size, index) => ({
    size,
    count: index + 1,
  }));
  const harness = (onApply?: (value: string[]) => void) => (
    <ListHarness
      onApply={onApply}
      render={(value, apply) => <SizeFilter sizes={sizes} value={value} onApply={apply} />}
    />
  );

  it('lists clothing sizes first, then numeric ones in numeric order, with counts', async () => {
    const user = userEvent.setup();
    render(harness());

    await user.click(screen.getByRole('button', { name: 'Размер' }));

    const names = ['XS 3', 'S 7', 'M 4', 'L 1', 'XL 6', '26 5', '30 2', '34 8'];
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(names.length);
    names.forEach((name, index) => {
      expect(screen.getByRole('checkbox', { name })).toBe(boxes[index]);
    });
  });

  it('reports the size strings and clears through the chip', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(harness(onApply));

    await user.click(screen.getByRole('button', { name: 'Размер' }));
    await user.click(screen.getByRole('checkbox', { name: '30 2' }));
    await user.click(screen.getByRole('checkbox', { name: 'M 4' }));
    await user.click(screen.getByRole('button', { name: 'Применить' }));
    expect(onApply).toHaveBeenCalledWith(['M', '30']);

    await user.click(screen.getByRole('button', { name: 'Сбросить «Размер»' }));
    expect(onApply).toHaveBeenLastCalledWith([]);
  });
});

describe('PriceRangeFilter', () => {
  const price = { min: 1000, max: 10000 };

  function PriceHarness({
    value: initial,
    onApply,
  }: {
    value?: PriceRange;
    onApply?: (value: PriceRange | undefined) => void;
  }) {
    const [value, setValue] = useState(initial);
    return (
      <PriceRangeFilter
        price={price}
        value={value}
        onApply={(next) => {
          setValue(next);
          onApply?.(next);
        }}
      />
    );
  }

  it('renders nothing when there are no products', () => {
    const { container } = render(<PriceRangeFilter price={null} onApply={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('opens with empty fields showing the bounds as placeholders', async () => {
    const user = userEvent.setup();
    render(<PriceRangeFilter price={price} onApply={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Цена' }));

    const from = screen.getByRole('textbox', { name: 'Мин. цена' });
    const to = screen.getByRole('textbox', { name: 'Макс. цена' });
    expect(from).toHaveValue('');
    expect(to).toHaveValue('');
    expect(plain(from.getAttribute('placeholder'))).toBe('1 000');
    expect(plain(to.getAttribute('placeholder'))).toBe('10 000');
    expect(screen.getByRole('button', { name: 'Применить' })).toBeDisabled();
  });

  it('reports a moved range and shows it on the chip', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<PriceHarness onApply={onApply} />);

    await user.click(screen.getByRole('button', { name: 'Цена' }));
    await user.type(screen.getByRole('textbox', { name: 'Мин. цена' }), '1500');
    await user.type(screen.getByRole('textbox', { name: 'Макс. цена' }), '9000');
    await user.click(screen.getByRole('button', { name: 'Применить' }));

    expect(onApply).toHaveBeenCalledWith([1500, 9000]);
    const chip = screen.getByRole('button', { name: /^Цена от/ });
    expect(plain(chip.textContent)).toContain('Цена от 1 500 до 9 000 ₽');
  });

  it('reports undefined when the applied range is moved back to the whole bounds', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<PriceHarness value={[2000, 8000]} onApply={onApply} />);

    await user.click(screen.getByRole('button', { name: /^Цена/ }));
    await user.clear(screen.getByRole('textbox', { name: 'Мин. цена' }));
    await user.clear(screen.getByRole('textbox', { name: 'Макс. цена' }));
    await user.click(screen.getByRole('button', { name: 'Применить' }));

    expect(onApply).toHaveBeenCalledWith(undefined);
  });

  it('× on an applied chip reports undefined', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<PriceHarness value={[1500, 9000]} onApply={onApply} />);

    await user.click(screen.getByRole('button', { name: 'Сбросить «Цена»' }));

    expect(onApply).toHaveBeenCalledWith(undefined);
    expect(screen.getByRole('button', { name: 'Цена' })).toBeInTheDocument();
  });

  it.each([
    [[500, 9000], 'Цена от 500 до 9 000 ₽'],
    [[1000, 5000], 'Цена от 1 000 до 5 000 ₽'],
  ] as [PriceRange, string][])(
    'names an applied range as it is, whatever the current bounds: %j',
    (value, text) => {
      render(<PriceRangeFilter price={{ min: 2000, max: 3000 }} value={value} onApply={vi.fn()} />);

      expect(plain(screen.getByRole('button', { name: /^Цена/ }).textContent)).toBe(text);
      expect(screen.getByRole('button', { name: 'Сбросить «Цена»' })).toBeInTheDocument();
    },
  );

  it('keeps a range below the bounds as applied', () => {
    render(
      <PriceRangeFilter price={{ min: 2000, max: 3000 }} value={[100, 200]} onApply={vi.fn()} />,
    );

    expect(plain(screen.getByRole('button', { name: /^Цена/ }).textContent)).toBe(
      'Цена от 100 до 200 ₽',
    );
  });

  it('shows a value equal to the bounds as applied, with ×', () => {
    render(
      <PriceRangeFilter price={{ min: 2000, max: 3000 }} value={[2000, 3000]} onApply={vi.fn()} />,
    );

    expect(plain(screen.getByRole('button', { name: /^Цена/ }).textContent)).toBe(
      'Цена от 2 000 до 3 000 ₽',
    );
    expect(screen.getByRole('button', { name: 'Сбросить «Цена»' })).toBeInTheDocument();
  });

  it('is not applied when all products cost the same and no value is given', () => {
    render(<PriceRangeFilter price={{ min: 3000, max: 3000 }} onApply={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Цена' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Сбросить «Цена»' })).not.toBeInTheDocument();
  });
});

describe('a chosen value missing from the options', () => {
  const brands: FacetBrand[] = [
    { id: id(1), name: 'Nike', count: 12 },
    { id: id(2), name: 'Puma', count: 5 },
  ];

  it.each([
    [[id(99)], 'Бренд 1'],
    [[id(1), id(99)], 'Бренд 2'],
  ])('shows the count of the value %j on an applied chip', async (value, name) => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<BrandFilter brands={brands} value={value} onApply={onApply} />);

    expect(screen.getByRole('button', { name })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Сбросить «Бренд»' }));

    expect(onApply).toHaveBeenCalledWith([]);
  });
});

describe('DiscountFilter', () => {
  it('reflects checked in aria-pressed', () => {
    const { rerender } = render(<DiscountFilter checked={false} onCheckedChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Только со скидкой' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    rerender(<DiscountFilter checked onCheckedChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Только со скидкой' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('reports the opposite of the current state on click', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    const { rerender } = render(
      <DiscountFilter checked={false} onCheckedChange={onCheckedChange} />,
    );

    await user.click(screen.getByRole('button', { name: 'Только со скидкой' }));
    expect(onCheckedChange.mock.lastCall?.[0]).toBe(true);

    rerender(<DiscountFilter checked onCheckedChange={onCheckedChange} />);
    await user.click(screen.getByRole('button', { name: 'Только со скидкой' }));
    expect(onCheckedChange.mock.lastCall?.[0]).toBe(false);
  });
});

describe('ProductSortFilter', () => {
  it('titles the chip with the current sort and names the dropdown "Сортировка"', async () => {
    const user = userEvent.setup();
    render(<ProductSortFilter value="price_asc" onValueChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Сначала дешевле' }));

    expect(screen.getByRole('dialog', { name: 'Сортировка' })).toBeInTheDocument();
  });

  it('lists the five sorts in order, the current one selected', async () => {
    const user = userEvent.setup();
    render(<ProductSortFilter value="new" onValueChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Новинки' }));

    const radios = screen.getAllByRole('radio');
    const labels = [
      'Новинки',
      'Сначала дороже',
      'Сначала дешевле',
      'По величине скидки',
      'По рейтингу',
    ];
    expect(radios).toHaveLength(5);
    labels.forEach((label, index) => {
      expect(screen.getByRole('radio', { name: label })).toBe(radios[index]);
    });
    expect(screen.getByRole('radio', { name: 'Новинки' })).toBeChecked();
  });

  it('reports the key of the picked sort', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn<(value: ProductSort) => void>();
    render(<ProductSortFilter value="new" onValueChange={onValueChange} />);

    await user.click(screen.getByRole('button', { name: 'Новинки' }));
    await user.click(screen.getByRole('radio', { name: 'Сначала дешевле' }));

    expect(onValueChange).toHaveBeenCalledWith('price_asc');
  });
});
