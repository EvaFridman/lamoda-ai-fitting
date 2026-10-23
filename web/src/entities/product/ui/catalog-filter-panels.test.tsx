import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  AttributeFilterPanel,
  BrandFilterPanel,
  ColorFilterPanel,
  DiscountFilterPanel,
  PriceRangeFilterPanel,
  ProductSortFilterPanel,
  SizeFilterPanel,
} from '@/entities/product';

import type { PriceRange } from '@/shared/ui';

import type { FacetAttribute } from '../model/schemas';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const colour: FacetAttribute = {
  id: id(100),
  name: 'Цвет',
  values: [
    { id: id(101), value: 'Черный', colorHex: '#000000', count: 5 },
    { id: id(102), value: 'Синий', colorHex: '#3972FC', count: 7 },
  ],
};

const material: FacetAttribute = {
  id: id(200),
  name: 'Материал',
  values: [
    { id: id(201), value: 'Хлопок', colorHex: null, count: 9 },
    { id: id(202), value: 'Шерсть', colorHex: null, count: 4 },
  ],
};

const manyValues: FacetAttribute = {
  id: id(300),
  name: 'Сезон',
  values: Array.from({ length: 8 }, (_, index) => ({
    id: id(301 + index),
    value: `Значение ${index + 1}`,
    colorHex: null,
    count: index + 1,
  })),
};

describe('ColorFilterPanel', () => {
  it('draws the swatches, named after the attribute, with a colour search', () => {
    render(<ColorFilterPanel attribute={colour} value={[]} onValueChange={vi.fn()} />);

    expect(screen.getByRole('group', { name: 'Цвет' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Синий 7' })).toHaveStyle({
      background: '#3972FC',
    });
    expect(screen.getByRole('searchbox', { name: 'Поиск: Цвет' })).toHaveAttribute(
      'placeholder',
      'Найдите цвет',
    );
  });

  it('reports the ticked ids in the order of the values', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<ColorFilterPanel attribute={colour} value={[id(102)]} onValueChange={onValueChange} />);

    expect(screen.getByRole('checkbox', { name: 'Синий 7' })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Черный 5' }));

    expect(onValueChange).toHaveBeenCalledWith([id(101), id(102)]);
  });
});

describe('ColorFilterPanel in the sheet layout', () => {
  it('says "Поиск" in the search, not "Найдите цвет"', () => {
    render(
      <ColorFilterPanel attribute={colour} value={[]} onValueChange={vi.fn()} layout="sheet" />,
    );

    expect(screen.getByRole('searchbox', { name: 'Поиск: Цвет' })).toHaveAttribute(
      'placeholder',
      'Поиск',
    );
  });

  it('shows the chip "Выбрать все" with selectAll, and a click ticks every shown value', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <ColorFilterPanel
        attribute={colour}
        value={[]}
        onValueChange={onValueChange}
        layout="sheet"
        selectAll
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Выбрать все' }));

    expect(onValueChange).toHaveBeenCalledWith([id(101), id(102)]);
  });

  it('has no chip without selectAll', () => {
    render(
      <ColorFilterPanel attribute={colour} value={[]} onValueChange={vi.fn()} layout="sheet" />,
    );

    expect(screen.queryByRole('button', { name: 'Выбрать все' })).not.toBeInTheDocument();
  });
});

// The kit's class is the only sign of the layout: the rows keep their roles and names.
describe('the sheet layout of the list panels', () => {
  const brands = [{ id: id(1), name: 'Nike', count: 12 }];
  const sizes = [{ size: 'M', count: 3 }];

  it('puts the kit panel in its sheet form', () => {
    render(
      <>
        <ColorFilterPanel attribute={colour} value={[]} onValueChange={vi.fn()} layout="sheet" />
        <AttributeFilterPanel
          attribute={material}
          value={[]}
          onValueChange={vi.fn()}
          layout="sheet"
        />
        <BrandFilterPanel brands={brands} value={[]} onValueChange={vi.fn()} layout="sheet" />
        <SizeFilterPanel sizes={sizes} value={[]} onValueChange={vi.fn()} layout="sheet" />
        <ProductSortFilterPanel value="new" onValueChange={vi.fn()} layout="sheet" />
      </>,
    );

    for (const name of ['Цвет', 'Материал', 'Бренд', 'Размер']) {
      expect(screen.getByRole('group', { name }).parentElement, name).toHaveClass('sheet');
    }
    expect(screen.getByRole('radiogroup', { name: 'Сортировка' })).toHaveClass('sheet');
  });

  it('keeps the list form by default', () => {
    render(
      <>
        <ColorFilterPanel attribute={colour} value={[]} onValueChange={vi.fn()} />
        <AttributeFilterPanel attribute={material} value={[]} onValueChange={vi.fn()} />
        <BrandFilterPanel brands={brands} value={[]} onValueChange={vi.fn()} />
        <SizeFilterPanel sizes={sizes} value={[]} onValueChange={vi.fn()} />
        <ProductSortFilterPanel value="new" onValueChange={vi.fn()} />
      </>,
    );

    for (const name of ['Цвет', 'Материал', 'Бренд', 'Размер']) {
      expect(screen.getByRole('group', { name }).parentElement, name).not.toHaveClass('sheet');
    }
    expect(screen.getByRole('radiogroup', { name: 'Сортировка' })).not.toHaveClass('sheet');
  });
});

describe('ColorFilterPanel selectAll in the list layout', () => {
  it('has no chip by default and ticks all shown values with selectAll', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { rerender } = render(
      <ColorFilterPanel attribute={colour} value={[]} onValueChange={onValueChange} />,
    );
    expect(screen.queryByRole('button', { name: 'Выбрать все' })).not.toBeInTheDocument();

    rerender(
      <ColorFilterPanel attribute={colour} value={[]} onValueChange={onValueChange} selectAll />,
    );
    await user.click(screen.getByRole('button', { name: 'Выбрать все' }));

    expect(onValueChange).toHaveBeenCalledWith([id(101), id(102)]);
  });
});

describe('AttributeFilterPanel', () => {
  it('has no search for a short list and reports the ticked id', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<AttributeFilterPanel attribute={material} value={[]} onValueChange={onValueChange} />);

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Шерсть 4' }));

    expect(onValueChange).toHaveBeenCalledWith([id(202)]);
  });

  it('searches a long list', () => {
    render(<AttributeFilterPanel attribute={manyValues} value={[]} onValueChange={vi.fn()} />);

    expect(screen.getByRole('searchbox', { name: 'Поиск: Сезон' })).toHaveAttribute(
      'placeholder',
      'Введите наименование',
    );
  });
});

describe('BrandFilterPanel', () => {
  const brands = [
    { id: id(1), name: 'Nike', count: 12 },
    { id: id(2), name: 'Puma', count: 5 },
  ];

  it('lists brands with counts and finds one by search', async () => {
    const user = userEvent.setup();
    render(<BrandFilterPanel brands={brands} value={[]} onValueChange={vi.fn()} />);

    await user.type(screen.getByRole('searchbox', { name: 'Поиск: Бренд' }), 'pum');

    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: 'Puma 5' })).toBeInTheDocument();
  });

  it('reports brand ids', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<BrandFilterPanel brands={brands} value={[id(1)]} onValueChange={onValueChange} />);

    await user.click(screen.getByRole('checkbox', { name: 'Puma 5' }));

    expect(onValueChange).toHaveBeenCalledWith([id(1), id(2)]);
  });
});

describe('SizeFilterPanel', () => {
  it('lists sizes in clothing order and reports the sizes themselves', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <SizeFilterPanel
        sizes={[
          { size: 'L', count: 2 },
          { size: 'S', count: 1 },
          { size: 'M', count: 3 },
        ]}
        value={[]}
        onValueChange={onValueChange}
      />,
    );

    expect(
      screen.getAllByRole('checkbox').map((box) => box.closest('label')?.textContent?.[0]),
    ).toEqual(['S', 'M', 'L']);
    await user.click(screen.getByRole('checkbox', { name: 'M 3' }));

    expect(onValueChange).toHaveBeenCalledWith(['M']);
  });
});

describe('PriceRangeFilterPanel', () => {
  const price = { min: 1000, max: 10000 };

  it('shows nothing when there are no products to price', () => {
    const { container } = render(<PriceRangeFilterPanel price={null} onValueChange={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('starts at the whole bounds when no range is chosen', () => {
    render(<PriceRangeFilterPanel price={price} onValueChange={vi.fn()} />);

    expect(screen.getByRole('slider', { name: 'Мин. цена' })).toHaveAttribute(
      'aria-valuenow',
      '1000',
    );
    expect(screen.getByRole('slider', { name: 'Макс. цена' })).toHaveAttribute(
      'aria-valuenow',
      '10000',
    );
  });

  it('keeps a chosen range within the current bounds', () => {
    render(<PriceRangeFilterPanel price={price} value={[500, 4000]} onValueChange={vi.fn()} />);

    expect(screen.getByRole('slider', { name: 'Мин. цена' })).toHaveAttribute(
      'aria-valuenow',
      '1000',
    );
    expect(screen.getByRole('slider', { name: 'Макс. цена' })).toHaveAttribute(
      'aria-valuenow',
      '4000',
    );
  });

  it('reports a chosen range, and undefined when it is the whole of the bounds', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    // Keeps the choice as the drawer does: the panel rewrites its texts from `value`.
    function Held() {
      const [value, setValue] = useState<PriceRange | undefined>();
      return (
        <PriceRangeFilterPanel
          price={price}
          value={value}
          onValueChange={(next) => {
            setValue(next);
            onValueChange(next);
          }}
        />
      );
    }
    render(<Held />);
    const min = screen.getByRole('textbox', { name: 'Мин. цена' });

    await user.type(min, '2000');
    expect(onValueChange).toHaveBeenLastCalledWith([2000, 10000]);

    await user.clear(min);
    expect(onValueChange).toHaveBeenLastCalledWith(undefined);
  });
});

describe('DiscountFilterPanel', () => {
  it('is a switch named "Только со скидкой" that reports a change', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<DiscountFilterPanel checked={false} onCheckedChange={onCheckedChange} />);

    const toggle = screen.getByRole('switch', { name: 'Только со скидкой' });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);

    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('shows it on and reports turning it off', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<DiscountFilterPanel checked onCheckedChange={onCheckedChange} />);

    await user.click(screen.getByRole('switch', { name: 'Только со скидкой' }));

    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });
});

describe('ProductSortFilterPanel', () => {
  it('lists the five sorts, the current one checked, and reports a pick', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<ProductSortFilterPanel value="new" onValueChange={onValueChange} />);

    expect(screen.getByRole('radiogroup', { name: 'Сортировка' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    expect(screen.getByRole('radio', { name: 'Новинки' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Сначала дешевле' }));

    expect(onValueChange).toHaveBeenCalledWith('price_asc');
  });
});
