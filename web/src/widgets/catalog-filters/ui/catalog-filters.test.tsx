import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { ProductFacets } from '@/entities/product';

import type { CatalogFilterValue } from '../lib/filter-value';
import { CatalogFilters } from './catalog-filters';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const BRAND_NIKE = id(1);
const BRAND_PUMA = id(2);
const BLACK = id(101);
const BLUE = id(102);
const COTTON = id(201);
const WOOL = id(202);

const facets: ProductFacets = {
  total: 20,
  discounted: 4,
  price: { min: 1000, max: 10000 },
  categories: [],
  brands: [
    { id: BRAND_NIKE, name: 'Nike', count: 12 },
    { id: BRAND_PUMA, name: 'Puma', count: 5 },
  ],
  sizes: [
    { size: 'M', count: 3 },
    { size: 'L', count: 2 },
  ],
  attributes: [
    {
      id: id(100),
      name: 'Цвет',
      values: [
        { id: BLACK, value: 'Черный', colorHex: '#000000', count: 5 },
        { id: BLUE, value: 'Синий', colorHex: '#3972FC', count: 7 },
      ],
    },
    {
      id: id(200),
      name: 'Материал',
      values: [
        { id: COTTON, value: 'Хлопок', colorHex: null, count: 9 },
        { id: WOOL, value: 'Шерсть', colorHex: null, count: 4 },
      ],
    },
  ],
};

// The phone drawer's button is in the DOM next to the row (CSS switches them); the drawer reads the
// counts of its draft only while open, so nothing is asked here.
function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function setup(value: CatalogFilterValue = {}, withFacets: ProductFacets = facets) {
  const onChange = vi.fn();
  render(wrap(<CatalogFilters facets={withFacets} value={value} onChange={onChange} />));
  return { onChange, user: userEvent.setup() };
}

describe('CatalogFilters', () => {
  it('shows the sort, every filter of the counts and the discount chip', () => {
    setup();
    for (const name of [
      'Новинки',
      'Цвет',
      'Материал',
      'Бренд',
      'Размер',
      'Цена',
      'Только со скидкой',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('has no price chip when there are no products to price', () => {
    setup({}, { ...facets, price: null });
    expect(screen.queryByRole('button', { name: 'Цена' })).not.toBeInTheDocument();
  });

  describe('a filter applied from its dropdown', () => {
    it('reports the brand ids with the rest of the selection kept', async () => {
      const { onChange, user } = setup({ q: 'платье', sort: 'price_asc' });
      await user.click(screen.getByRole('button', { name: 'Бренд' }));
      await user.click(screen.getByRole('checkbox', { name: 'Puma 5' }));
      await user.click(screen.getByRole('button', { name: 'Применить' }));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith({
        q: 'платье',
        sort: 'price_asc',
        brandId: [BRAND_PUMA],
      });
    });

    it('reports sizes', async () => {
      const { onChange, user } = setup();
      await user.click(screen.getByRole('button', { name: 'Размер' }));
      await user.click(screen.getByRole('checkbox', { name: 'L 2' }));
      await user.click(screen.getByRole('button', { name: 'Применить' }));
      expect(onChange).toHaveBeenCalledWith({ size: ['L'] });
    });

    it('puts a colour next to the values chosen in another attribute', async () => {
      const { onChange, user } = setup({ attributeValueId: [COTTON] });
      await user.click(screen.getByRole('button', { name: 'Цвет' }));
      await user.click(screen.getByRole('checkbox', { name: 'Синий 7' }));
      await user.click(screen.getByRole('button', { name: 'Применить' }));
      expect(onChange).toHaveBeenCalledWith({ attributeValueId: [COTTON, BLUE] });
    });

    it('reports a price range', async () => {
      const { onChange, user } = setup();
      await user.click(screen.getByRole('button', { name: 'Цена' }));
      await user.type(screen.getByRole('textbox', { name: 'Мин. цена' }), '1500');
      await user.type(screen.getByRole('textbox', { name: 'Макс. цена' }), '9000');
      await user.click(screen.getByRole('button', { name: 'Применить' }));
      expect(onChange).toHaveBeenCalledWith({ minPrice: 1500, maxPrice: 9000 });
    });
  });

  describe('the price chip with one side applied', () => {
    const price = { min: 500, max: 9000 };

    it('names only the minimum', () => {
      setup({ minPrice: 2000 }, { ...facets, price });
      expect(screen.getByRole('button', { name: /^Цена/ })).toHaveTextContent(
        /^Цена\s+от 2.000 ₽$/,
      );
    });

    it('names only the maximum', () => {
      setup({ maxPrice: 3000 }, { ...facets, price });
      expect(screen.getByRole('button', { name: /^Цена/ })).toHaveTextContent(
        /^Цена\s+до 3.000 ₽$/,
      );
    });
  });

  describe('the × of an applied chip', () => {
    it('clears that brand filter alone', async () => {
      const { onChange, user } = setup({ brandId: [BRAND_NIKE], hasDiscount: true });
      await user.click(screen.getByRole('button', { name: 'Сбросить «Бренд»' }));
      const next = onChange.mock.calls[0]?.[0] as CatalogFilterValue;
      expect(next.brandId).toBeUndefined();
      expect(next.hasDiscount).toBe(true);
    });

    it('clears one attribute and keeps the other', async () => {
      const { onChange, user } = setup({ attributeValueId: [BLACK, COTTON] });
      await user.click(screen.getByRole('button', { name: 'Сбросить «Цвет»' }));
      expect(onChange).toHaveBeenCalledWith({ attributeValueId: [COTTON] });
    });

    it('clears both sides of the price', async () => {
      const { onChange, user } = setup({ minPrice: 2000, maxPrice: 5000, q: 'a' });
      await user.click(screen.getByRole('button', { name: 'Сбросить «Цена»' }));
      const next = onChange.mock.calls[0]?.[0] as CatalogFilterValue;
      expect(next.minPrice).toBeUndefined();
      expect(next.maxPrice).toBeUndefined();
      expect(next.q).toBe('a');
    });
  });

  describe('the sort', () => {
    it('shows the current sort as its title', () => {
      setup({ sort: 'price_desc' });
      expect(screen.getByRole('button', { name: 'Сначала дороже' })).toBeInTheDocument();
    });

    it('reports a picked sort', async () => {
      const { onChange, user } = setup({ hasDiscount: true });
      await user.click(screen.getByRole('button', { name: 'Новинки' }));
      await user.click(screen.getByRole('radio', { name: 'Сначала дешевле' }));
      expect(onChange).toHaveBeenCalledWith({ hasDiscount: true, sort: 'price_asc' });
    });

    it('leaves the default sort out of the selection', async () => {
      const { onChange, user } = setup({ sort: 'price_asc' });
      await user.click(screen.getByRole('button', { name: 'Сначала дешевле' }));
      await user.click(screen.getByRole('radio', { name: 'Новинки' }));
      const next = onChange.mock.calls[0]?.[0] as CatalogFilterValue;
      expect(next.sort).toBeUndefined();
    });
  });

  describe('without the counts', () => {
    function setupBare(value: CatalogFilterValue = {}) {
      const onChange = vi.fn();
      render(wrap(<CatalogFilters value={value} onChange={onChange} />));
      return { onChange, user: userEvent.setup() };
    }

    it('shows the sort alone in the row, and the drawer button', () => {
      setupBare();
      expect(screen.getAllByRole('button').map((button) => button.textContent?.trim())).toEqual([
        'Новинки',
        'Фильтры',
      ]);
    });

    it('reports a picked sort', async () => {
      const { onChange, user } = setupBare({ q: 'a' });
      await user.click(screen.getByRole('button', { name: 'Новинки' }));
      await user.click(screen.getByRole('radio', { name: 'Сначала дешевле' }));
      expect(onChange).toHaveBeenCalledWith({ q: 'a', sort: 'price_asc' });
    });

    it('offers "Очистить фильтры" for an applied filter and keeps the sort', async () => {
      const { onChange, user } = setupBare({ sort: 'price_desc', hasDiscount: true, q: 'a' });
      for (const name of ['Цвет', 'Бренд', 'Размер', 'Цена', 'Только со скидкой']) {
        expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
      }
      await user.click(screen.getByRole('button', { name: 'Очистить фильтры' }));
      expect(onChange).toHaveBeenCalledWith({ sort: 'price_desc' });
    });

    it('offers no clearing for a sort alone', () => {
      setupBare({ sort: 'price_asc' });
      expect(screen.queryByRole('button', { name: 'Очистить фильтры' })).not.toBeInTheDocument();
    });
  });

  describe('"Только со скидкой"', () => {
    it('is pressed by the selection and reports true when turned on', async () => {
      const { onChange, user } = setup({ q: 'a' });
      const chip = screen.getByRole('button', { name: 'Только со скидкой' });
      expect(chip).toHaveAttribute('aria-pressed', 'false');
      await user.click(chip);
      expect(onChange).toHaveBeenCalledWith({ q: 'a', hasDiscount: true });
    });

    it('leaves the filter out when turned off', async () => {
      const { onChange, user } = setup({ hasDiscount: true });
      const chip = screen.getByRole('button', { name: 'Только со скидкой' });
      expect(chip).toHaveAttribute('aria-pressed', 'true');
      await user.click(chip);
      const next = onChange.mock.calls[0]?.[0] as CatalogFilterValue;
      expect(next.hasDiscount).toBeUndefined();
    });
  });

  describe('focus after clearing', () => {
    it('is handed to the page after the row\'s "Очистить фильтры"', async () => {
      const onChange = vi.fn();
      const focusAfterClear = vi.fn();
      render(
        wrap(
          <CatalogFilters
            facets={facets}
            value={{ q: 'a' }}
            onChange={onChange}
            focusAfterClear={focusAfterClear}
          />,
        ),
      );
      await userEvent.setup().click(screen.getByRole('button', { name: 'Очистить фильтры' }));
      expect(onChange).toHaveBeenCalledWith({});
      expect(focusAfterClear).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Новинки' })).not.toHaveFocus();
    });

    it("is not asked for by an applied chip's ×, which keeps the focus", async () => {
      const onChange = vi.fn();
      const focusAfterClear = vi.fn();
      render(
        wrap(
          <CatalogFilters
            facets={facets}
            value={{ brandId: [BRAND_NIKE] }}
            onChange={onChange}
            focusAfterClear={focusAfterClear}
          />,
        ),
      );
      const remove = screen.getByRole('button', { name: 'Сбросить «Бренд»' });
      await userEvent.setup().click(remove);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(focusAfterClear).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /^Бренд/ })).toHaveFocus();
    });

    it('is not asked for by applying a filter', async () => {
      const onChange = vi.fn();
      const focusAfterClear = vi.fn();
      render(
        wrap(
          <CatalogFilters
            facets={facets}
            value={{}}
            onChange={onChange}
            focusAfterClear={focusAfterClear}
          />,
        ),
      );
      await userEvent.setup().click(screen.getByRole('button', { name: 'Только со скидкой' }));
      expect(onChange).toHaveBeenCalledWith({ hasDiscount: true });
      expect(focusAfterClear).not.toHaveBeenCalled();
    });
  });

  describe('"Очистить фильтры"', () => {
    it('is not shown with nothing applied', () => {
      setup();
      expect(screen.queryByRole('button', { name: 'Очистить фильтры' })).not.toBeInTheDocument();
    });

    it('is not shown for a sort alone', () => {
      setup({ sort: 'price_asc' });
      expect(screen.queryByRole('button', { name: 'Очистить фильтры' })).not.toBeInTheDocument();
    });

    it('is shown for a search alone', () => {
      setup({ q: 'платье' });
      expect(screen.getByRole('button', { name: 'Очистить фильтры' })).toBeInTheDocument();
    });

    it('clears every filter and the search, and keeps the sort', async () => {
      const { onChange, user } = setup({
        q: 'платье',
        sort: 'price_desc',
        brandId: [BRAND_NIKE],
        size: ['M'],
        attributeValueId: [BLACK],
        minPrice: 2000,
        maxPrice: 5000,
        hasDiscount: true,
      });
      await user.click(screen.getByRole('button', { name: 'Очистить фильтры' }));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith({ sort: 'price_desc' });
      expect(
        Object.keys(onChange.mock.calls[0]?.[0] as object).filter((key) => key !== 'sort'),
      ).toEqual([]);
    });
  });
});
