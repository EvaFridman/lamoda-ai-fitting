import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/shared/api')>();
  return { ...original, reportFailure: vi.fn() };
});

import type { ProductFacets } from '@/entities/product';

import type { CatalogFilterValue } from '../lib/filter-value';
import { CatalogFiltersDrawer } from './catalog-filters-drawer';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const CATEGORY = id(10);
const BRAND_NIKE = id(1);
const BRAND_PUMA = id(2);
const BLACK = id(101);
const BLUE = id(102);
const COTTON = id(201);

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
        { id: id(202), value: 'Шерсть', colorHex: null, count: 4 },
      ],
    },
  ],
};

const fetchMock = vi.fn();

// The count asked for the draft: the answer's total follows the filters in the request.
function stubCount(totalOf: (url: URL) => number) {
  fetchMock.mockImplementation((input: unknown) => {
    const url = new URL(String(input), 'http://localhost');
    return Promise.resolve(new Response(JSON.stringify({ ...facets, total: totalOf(url) })));
  });
}

const requested = () =>
  fetchMock.mock.calls.map((call) => new URL(String(call[0]), 'http://localhost'));

// Base UI's sheet gives pointer events back through styles that jsdom does not load.
const setupUser = () => userEvent.setup({ pointerEventsCheck: 0 });

type User = ReturnType<typeof setupUser>;
type Dialog = ReturnType<typeof within>;

function show(
  props: {
    value?: CatalogFilterValue;
    facets?: ProductFacets;
    categoryId?: string;
  } = {},
) {
  const onChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CatalogFiltersDrawer
        facets={'facets' in props ? props.facets : facets}
        value={props.value ?? {}}
        onChange={onChange}
        categoryId={'categoryId' in props ? props.categoryId : CATEGORY}
      />
    </QueryClientProvider>,
  );
  return { onChange, user: setupUser() };
}

async function open(user: User) {
  await user.click(screen.getByRole('button', { name: 'Фильтры' }));
  const dialog = await screen.findByRole('dialog', { name: 'Фильтры' });
  await vi.waitFor(() => expect(dialog).not.toHaveAttribute('data-starting-style'));
  return within(dialog);
}

// A row is named by its title and, after it, the grey summary of the draft's choice.
const row = (dialog: Dialog, title: string) =>
  dialog.getByRole('button', { name: new RegExp(`^${title}`) });

const showButton = (dialog: Dialog, name: string | RegExp = /^Показать/) =>
  dialog.getByRole('button', { name });

const back = (dialog: Dialog) => dialog.getByRole('button', { name: 'Назад к фильтрам' });

const apply = (dialog: Dialog) => dialog.getByRole('button', { name: 'Применить' });

const closed = () => vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

beforeEach(() => {
  fetchMock.mockReset();
  stubCount(() => 20);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CatalogFiltersDrawer', () => {
  it('is a "Фильтры" button until opened, and asks nothing while closed', async () => {
    show();
    await act(async () => {});

    expect(screen.getByRole('button', { name: 'Фильтры' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe('the dot on the button', () => {
    it.each([
      ['nothing applied', {}, false],
      ['a sort alone', { sort: 'price_asc' as const }, true],
      ['a search alone', { q: 'платье' }, true],
      ['a filter', { hasDiscount: true }, true],
    ])('with %s it is %s', (_, value, dot) => {
      show({ value });

      const trigger = screen.getByRole('button', { name: 'Фильтры' });
      expect(trigger.querySelector('.dot') !== null).toBe(dot);
    });
  });

  describe('the list of rows', () => {
    it('opens a titled sheet with the rows in order, then the switch and the footer', async () => {
      const { user } = show();
      const dialog = await open(user);

      const titles = ['Сортировка', 'Размер', 'Цвет', 'Цена', 'Бренд', 'Материал'];
      const rows = titles.map((title) => row(dialog, title));
      rows.forEach((element, index) => {
        const next = rows[index + 1];
        if (next) {
          expect(
            element.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING,
          ).toBeTruthy();
        }
      });
      const discount = dialog.getByRole('switch', { name: 'Только со скидкой' });
      expect(discount).not.toBeChecked();
      expect(
        row(dialog, 'Материал').compareDocumentPosition(discount) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();

      expect(dialog.getByRole('button', { name: 'Закрыть' })).toBeInTheDocument();
      expect(dialog.getByRole('button', { name: 'Сбросить' })).toBeDisabled();
      expect(showButton(dialog)).toBeInTheDocument();
      expect(dialog.queryByRole('button', { name: 'Назад к фильтрам' })).not.toBeInTheDocument();
      expect(dialog.queryByRole('button', { name: /^Сбросить: / })).not.toBeInTheDocument();
      expect(dialog.queryByRole('button', { name: 'Очистить фильтры' })).not.toBeInTheDocument();
    });

    it('has no price row when there are no products to price', async () => {
      const { user } = show({ facets: { ...facets, price: null } });
      const dialog = await open(user);

      expect(row(dialog, 'Бренд')).toBeInTheDocument();
      expect(dialog.queryByRole('button', { name: /^Цена/ })).not.toBeInTheDocument();
    });

    it('has only the sort without the counts', async () => {
      const { user } = show({ facets: undefined });
      const dialog = await open(user);

      expect(row(dialog, 'Сортировка')).toBeInTheDocument();
      expect(dialog.queryByRole('button', { name: /^Бренд/ })).not.toBeInTheDocument();
      expect(dialog.queryByRole('switch')).not.toBeInTheDocument();
    });

    it('shows the draft choice in grey and clears one filter with the row "Сбросить"', async () => {
      const { onChange, user } = show({
        value: {
          sort: 'price_asc',
          brandId: [BRAND_NIKE],
          size: ['M'],
          attributeValueId: [BLACK, COTTON],
        },
      });
      const dialog = await open(user);

      expect(row(dialog, 'Бренд')).toHaveTextContent('Nike');
      expect(row(dialog, 'Размер')).toHaveTextContent('M');
      expect(row(dialog, 'Цвет')).toHaveTextContent('черный');
      expect(row(dialog, 'Материал')).toHaveTextContent('Хлопок');
      expect(row(dialog, 'Сортировка')).toHaveTextContent('Сначала дешевле');
      expect(dialog.queryByRole('button', { name: 'Сбросить: Цена' })).not.toBeInTheDocument();

      await user.click(dialog.getByRole('button', { name: 'Сбросить: Бренд' }));
      await user.click(dialog.getByRole('button', { name: 'Сбросить: Сортировка' }));

      expect(row(dialog, 'Бренд')).not.toHaveTextContent('Nike');
      expect(dialog.queryByRole('button', { name: 'Сбросить: Бренд' })).not.toBeInTheDocument();
      expect(row(dialog, 'Размер')).toHaveTextContent('M');
      expect(onChange).not.toHaveBeenCalled();

      await user.click(showButton(dialog));
      expect(onChange).toHaveBeenCalledWith({ size: ['M'], attributeValueId: [BLACK, COTTON] });
    });
  });

  describe('the focus after a control goes inactive', () => {
    it('moves to the row’s button when its "Сбросить" clears the choice and disappears', async () => {
      const { user } = show({ value: { brandId: [BRAND_NIKE] } });
      const dialog = await open(user);

      await user.click(dialog.getByRole('button', { name: 'Сбросить: Бренд' }));

      expect(dialog.queryByRole('button', { name: 'Сбросить: Бренд' })).not.toBeInTheDocument();
      expect(row(dialog, 'Бренд')).toHaveFocus();
    });

    it('moves to "Применить" when the sort screen’s "По умолчанию" goes disabled', async () => {
      const { user } = show({ value: { sort: 'price_asc' } });
      const dialog = await open(user);

      await user.click(row(dialog, 'Сортировка'));
      await user.click(dialog.getByRole('button', { name: 'По умолчанию' }));

      expect(dialog.getByRole('button', { name: 'По умолчанию' })).toBeDisabled();
      expect(apply(dialog)).toHaveFocus();
    });
  });

  describe('when the open screen’s filter leaves the counts', () => {
    const withoutColour: ProductFacets = {
      ...facets,
      attributes: facets.attributes.filter((attribute) => attribute.name !== 'Цвет'),
    };

    function showRerenderable() {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const ui = (current: ProductFacets | undefined) => (
        <QueryClientProvider client={client}>
          <CatalogFiltersDrawer
            facets={current}
            value={{}}
            onChange={vi.fn()}
            categoryId={CATEGORY}
          />
        </QueryClientProvider>
      );
      const view = render(ui(facets));
      return {
        user: setupUser(),
        rerender: (next: ProductFacets | undefined) => view.rerender(ui(next)),
      };
    }

    it.each([
      ['lacking the attribute', withoutColour],
      ['gone', undefined],
    ])('shows the list, and stays on it when the counts return (%s)', async (_, lacking) => {
      const { user, rerender } = showRerenderable();
      const dialog = await open(user);
      await user.click(row(dialog, 'Цвет'));
      await user.click(dialog.getByRole('checkbox', { name: /Черный/ }));
      expect(screen.getByRole('dialog', { name: 'Цвет' })).toBeInTheDocument();

      rerender(lacking);

      expect(screen.getByRole('dialog', { name: 'Фильтры' })).toBeInTheDocument();
      expect(dialog.getByRole('button', { name: 'Закрыть' })).toBeInTheDocument();
      expect(dialog.queryByRole('button', { name: 'Назад к фильтрам' })).not.toBeInTheDocument();

      rerender(facets);

      expect(screen.getByRole('dialog', { name: 'Фильтры' })).toBeInTheDocument();
      expect(dialog.getByRole('button', { name: 'Закрыть' })).toBeInTheDocument();
      expect(row(dialog, 'Цвет')).not.toHaveTextContent('черный');
    });
  });

  describe('the footer "Сбросить"', () => {
    it('is off while only the search is applied', async () => {
      const { user } = show({ value: { q: 'платье' } });
      const dialog = await open(user);

      expect(dialog.getByRole('button', { name: 'Сбросить' })).toBeDisabled();
    });

    it('is on for the sort alone', async () => {
      const { user } = show({ value: { sort: 'price_desc' } });
      const dialog = await open(user);

      expect(dialog.getByRole('button', { name: 'Сбросить' })).toBeEnabled();
    });

    it('clears the filters and the sort in the draft, keeps the search, and calls nothing', async () => {
      const { onChange, user } = show({
        value: { q: 'платье', sort: 'price_desc', brandId: [BRAND_NIKE], hasDiscount: true },
      });
      const dialog = await open(user);

      await user.click(dialog.getByRole('button', { name: 'Сбросить' }));

      expect(onChange).not.toHaveBeenCalled();
      expect(dialog.getByRole('switch', { name: 'Только со скидкой' })).not.toBeChecked();
      expect(row(dialog, 'Бренд')).not.toHaveTextContent('Nike');
      expect(dialog.getByRole('button', { name: 'Сбросить' })).toBeDisabled();
      expect(showButton(dialog)).toHaveFocus();

      await user.click(showButton(dialog));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith({ q: 'платье' });
    });
  });

  describe('a screen', () => {
    it('opens with the filter name, "Назад к фильтрам" and no ×, focus on the back button', async () => {
      const { user } = show();
      const dialog = await open(user);

      await user.click(row(dialog, 'Бренд'));

      const sheet = screen.getByRole('dialog', { name: 'Бренд' });
      expect(back(dialog)).toHaveAccessibleDescription('Бренд');
      expect(dialog.queryByRole('button', { name: 'Закрыть' })).not.toBeInTheDocument();
      expect(sheet).toBeInTheDocument();
      await vi.waitFor(() => expect(back(dialog)).toHaveFocus());
    });

    it('has the right header action and footer on each kind of screen', async () => {
      const { user } = show();
      const dialog = await open(user);

      for (const title of ['Размер', 'Бренд', 'Материал']) {
        await user.click(row(dialog, title));
        expect(dialog.getByRole('button', { name: 'Сбросить' })).toBeInTheDocument();
        expect(apply(dialog)).toBeInTheDocument();
        await user.click(back(dialog));
      }

      await user.click(row(dialog, 'Цена'));
      expect(dialog.getByRole('slider', { name: 'Мин. цена' })).toBeInTheDocument();
      expect(dialog.queryByRole('button', { name: 'Сбросить' })).not.toBeInTheDocument();
      expect(apply(dialog)).toBeInTheDocument();
      await user.click(back(dialog));

      await user.click(row(dialog, 'Цвет'));
      expect(dialog.getByPlaceholderText('Поиск')).toBeInTheDocument();
      expect(dialog.getByRole('button', { name: 'Выбрать все' })).toBeInTheDocument();
      expect(dialog.getByRole('checkbox', { name: /Черный/ })).toBeInTheDocument();
      expect(dialog.getByRole('button', { name: 'Сбросить' })).toBeInTheDocument();
      expect(apply(dialog)).toBeInTheDocument();
      await user.click(back(dialog));

      await user.click(row(dialog, 'Сортировка'));
      expect(dialog.getAllByRole('radio')).toHaveLength(5);
      expect(dialog.queryByRole('button', { name: 'Сбросить' })).not.toBeInTheDocument();
      expect(dialog.getByRole('button', { name: 'По умолчанию' })).toBeDisabled();
      expect(apply(dialog)).toBeInTheDocument();
    });

    it('keeps the choice with "Применить" and returns the focus to the row it came from', async () => {
      const { onChange, user } = show();
      const dialog = await open(user);

      await user.click(row(dialog, 'Бренд'));
      await user.click(dialog.getByRole('checkbox', { name: 'Puma 5' }));
      await user.click(apply(dialog));

      expect(screen.getByRole('dialog', { name: 'Фильтры' })).toBeInTheDocument();
      expect(row(dialog, 'Бренд')).toHaveTextContent('Puma');
      await vi.waitFor(() => expect(row(dialog, 'Бренд')).toHaveFocus());
      expect(onChange).not.toHaveBeenCalled();

      await user.click(row(dialog, 'Бренд'));
      expect(dialog.getByRole('checkbox', { name: 'Puma 5' })).toBeChecked();
    });

    it('drops the screen’s changes with "Назад к фильтрам"', async () => {
      const { onChange, user } = show({ value: { brandId: [BRAND_NIKE] } });
      const dialog = await open(user);

      await user.click(row(dialog, 'Бренд'));
      await user.click(dialog.getByRole('checkbox', { name: 'Puma 5' }));
      await user.click(dialog.getByRole('button', { name: 'Сбросить' }));
      await user.click(back(dialog));

      expect(row(dialog, 'Бренд')).toHaveTextContent('Nike');
      expect(row(dialog, 'Бренд')).not.toHaveTextContent('Puma');
      await vi.waitFor(() => expect(row(dialog, 'Бренд')).toHaveFocus());
      expect(onChange).not.toHaveBeenCalled();
    });

    it('clears a list of values with the header "Сбросить", kept only on "Применить"', async () => {
      const { user } = show({ value: { size: ['M'] } });
      const dialog = await open(user);

      await user.click(row(dialog, 'Размер'));
      await user.click(dialog.getByRole('button', { name: 'Сбросить' }));
      expect(dialog.getByRole('checkbox', { name: 'M 3' })).not.toBeChecked();
      await user.click(apply(dialog));

      expect(row(dialog, 'Размер')).not.toHaveTextContent('M');
      expect(dialog.queryByRole('button', { name: 'Сбросить: Размер' })).not.toBeInTheDocument();
    });

    it('ticks every colour with "Выбрать все"', async () => {
      const { onChange, user } = show({ value: { attributeValueId: [COTTON] } });
      const dialog = await open(user);

      await user.click(row(dialog, 'Цвет'));
      await user.click(dialog.getByRole('button', { name: 'Выбрать все' }));
      await user.click(apply(dialog));
      await user.click(showButton(dialog));

      expect(onChange).toHaveBeenCalledWith({ attributeValueId: [COTTON, BLACK, BLUE] });
    });

    it('moves the price draft only; it is applied on "Применить" and "Показать"', async () => {
      const { onChange, user } = show();
      const dialog = await open(user);

      await user.click(row(dialog, 'Цена'));
      dialog.getByRole('slider', { name: 'Мин. цена' }).focus();
      await user.keyboard('{ArrowRight}');

      expect(dialog.getByRole('slider', { name: 'Мин. цена' })).toHaveAttribute(
        'aria-valuenow',
        '1001',
      );
      expect(onChange).not.toHaveBeenCalled();

      await user.click(apply(dialog));
      await user.click(showButton(dialog));
      expect(onChange).toHaveBeenCalledWith({ minPrice: 1001 });
    });

    it('chooses a sort; "По умолчанию" picks the default only on the screen', async () => {
      const { onChange, user } = show({ value: { sort: 'price_asc' } });
      const dialog = await open(user);

      await user.click(row(dialog, 'Сортировка'));
      expect(dialog.getByRole('radio', { name: 'Сначала дешевле' })).toBeChecked();
      await user.click(dialog.getByRole('radio', { name: 'Сначала дороже' }));
      expect(dialog.getByRole('button', { name: 'По умолчанию' })).toBeEnabled();
      await user.click(dialog.getByRole('button', { name: 'По умолчанию' }));

      expect(dialog.getByRole('radio', { name: 'Новинки' })).toBeChecked();
      expect(dialog.getByRole('button', { name: 'По умолчанию' })).toBeDisabled();
      expect(onChange).not.toHaveBeenCalled();
      await user.click(back(dialog));
      expect(row(dialog, 'Сортировка')).toHaveTextContent('Сначала дешевле');

      await user.click(row(dialog, 'Сортировка'));
      await user.click(dialog.getByRole('button', { name: 'По умолчанию' }));
      await user.click(apply(dialog));
      await user.click(showButton(dialog));

      const applied = onChange.mock.calls[0]?.[0] as CatalogFilterValue;
      expect(applied.sort).toBeUndefined();
    });
  });

  describe('"Показать"', () => {
    it('applies the draft with the rest of the selection once, closes, and focuses "Фильтры"', async () => {
      const { onChange, user } = show({ value: { q: 'платье', sort: 'price_asc' } });
      const dialog = await open(user);

      await user.click(row(dialog, 'Бренд'));
      await user.click(dialog.getByRole('checkbox', { name: 'Puma 5' }));
      await user.click(apply(dialog));
      await user.click(dialog.getByRole('switch', { name: 'Только со скидкой' }));
      expect(onChange).not.toHaveBeenCalled();
      await user.click(showButton(dialog));

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith({
        q: 'платье',
        sort: 'price_asc',
        brandId: [BRAND_PUMA],
        hasDiscount: true,
      });
      await closed();
      await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Фильтры' })).toHaveFocus());
    });

    it('applies the selection untouched when nothing was chosen', async () => {
      const { onChange, user } = show({ value: { brandId: [BRAND_NIKE], size: ['M'] } });
      const dialog = await open(user);

      await user.click(showButton(dialog));

      expect(onChange).toHaveBeenCalledWith({ brandId: [BRAND_NIKE], size: ['M'] });
    });
  });

  describe('the count on the button', () => {
    it('shows the total of the counts once they arrive, in the right plural', async () => {
      stubCount(() => 21);
      const { user } = show();
      const dialog = await open(user);

      await vi.waitFor(() => expect(showButton(dialog)).toHaveAccessibleName('Показать 21 товар'));
      const [first] = requested();
      expect(first?.pathname).toMatch(/\/products\/facets$/);
      expect(first?.searchParams.get('categoryId')).toBe(CATEGORY);
    });

    it('groups the digits of a long count with a no-break space', async () => {
      stubCount(() => 50030);
      const { user } = show();
      const dialog = await open(user);

      await vi.waitFor(() =>
        expect(showButton(dialog).textContent).toBe(
          `Показать 50${String.fromCodePoint(0xa0)}030 товаров`,
        ),
      );
    });

    it('reads "Показать 0 товаров" for zero', async () => {
      stubCount(() => 0);
      const { user } = show();
      const dialog = await open(user);

      await vi.waitFor(() => expect(showButton(dialog)).toHaveAccessibleName('Показать 0 товаров'));
    });

    it('stays "Показать товары" while the count is pending', async () => {
      fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
      const { user } = show();
      const dialog = await open(user);

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      expect(showButton(dialog)).toHaveAccessibleName('Показать товары');
    });

    it('stays "Показать товары" when the count fails, and still applies', async () => {
      fetchMock.mockImplementation(() => Promise.reject(new TypeError('network')));
      const { onChange, user } = show();
      const dialog = await open(user);

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      await act(async () => {});
      expect(showButton(dialog)).toHaveAccessibleName('Показать товары');
      await user.click(showButton(dialog));

      expect(onChange).toHaveBeenCalledWith({});
    });

    it('counts the draft once it has stood a moment, and says nothing in between', async () => {
      stubCount((url) => (url.searchParams.has('brandId') ? 7 : 20));
      const { user } = show();
      const dialog = await open(user);
      await vi.waitFor(() =>
        expect(showButton(dialog)).toHaveAccessibleName('Показать 20 товаров'),
      );

      await user.click(row(dialog, 'Бренд'));
      await user.click(dialog.getByRole('checkbox', { name: 'Puma 5' }));
      await user.click(apply(dialog));
      expect(showButton(dialog)).toHaveAccessibleName('Показать товары');

      await vi.waitFor(() => expect(showButton(dialog)).toHaveAccessibleName('Показать 7 товаров'));
      const last = requested().at(-1);
      expect(last?.searchParams.get('brandId')).toBe(BRAND_PUMA);
      expect(last?.searchParams.get('categoryId')).toBe(CATEGORY);
    });

    it('keeps the count when only the sort changes, and asks nothing new', async () => {
      stubCount(() => 21);
      const { user } = show();
      const dialog = await open(user);
      await vi.waitFor(() => expect(showButton(dialog)).toHaveAccessibleName('Показать 21 товар'));
      const asked = fetchMock.mock.calls.length;

      await user.click(row(dialog, 'Сортировка'));
      await user.click(dialog.getByRole('radio', { name: 'Сначала дешевле' }));
      await user.click(apply(dialog));

      expect(row(dialog, 'Сортировка')).toHaveTextContent('Сначала дешевле');
      expect(showButton(dialog)).toHaveAccessibleName('Показать 21 товар');
      await act(async () => {});
      expect(fetchMock).toHaveBeenCalledTimes(asked);
    });

    it('does not scope the count to a category on a page with none', async () => {
      const { user } = show({ categoryId: undefined });
      await open(user);

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      expect(requested()[0]?.searchParams.has('categoryId')).toBe(false);
    });
  });

  describe('closing without "Показать"', () => {
    it('drops every unapplied choice on Escape, from a screen too; reopening starts at the list', async () => {
      const { onChange, user } = show({ value: { brandId: [BRAND_NIKE] } });
      const first = await open(user);

      await user.click(row(first, 'Размер'));
      await user.click(first.getByRole('checkbox', { name: 'L 2' }));
      await user.click(apply(first));
      await user.click(row(first, 'Бренд'));
      await user.click(first.getByRole('checkbox', { name: 'Puma 5' }));
      await user.keyboard('{Escape}');
      await closed();
      expect(onChange).not.toHaveBeenCalled();

      const second = await open(user);
      expect(row(second, 'Бренд')).toHaveTextContent('Nike');
      expect(row(second, 'Бренд')).not.toHaveTextContent('Puma');
      expect(row(second, 'Размер')).not.toHaveTextContent('L');
      expect(second.queryByRole('button', { name: 'Назад к фильтрам' })).not.toBeInTheDocument();
    });

    it('closes on the ×, drops the draft and focuses "Фильтры"', async () => {
      const { onChange, user } = show();
      const dialog = await open(user);

      await user.click(dialog.getByRole('switch', { name: 'Только со скидкой' }));
      await user.click(dialog.getByRole('button', { name: 'Закрыть' }));

      await closed();
      expect(onChange).not.toHaveBeenCalled();
      await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Фильтры' })).toHaveFocus());
    });
  });

  describe('when the window grows to the desktop width', () => {
    // jsdom has no matchMedia: a stub that lets the test fire the query's `change`.
    function stubDesktopQuery() {
      const listeners = new Set<(event: { matches: boolean }) => void>();
      const queries: string[] = [];
      const mql = {
        matches: false,
        media: '',
        addEventListener: (_: string, listener: (event: { matches: boolean }) => void) =>
          listeners.add(listener),
        removeEventListener: (_: string, listener: (event: { matches: boolean }) => void) =>
          listeners.delete(listener),
        addListener: (listener: (event: { matches: boolean }) => void) => listeners.add(listener),
        removeListener: (listener: (event: { matches: boolean }) => void) =>
          listeners.delete(listener),
      };
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query: string) => {
          queries.push(query);
          return { ...mql, media: query };
        }),
      );
      return {
        queries,
        resize(matches: boolean) {
          act(() => {
            for (const listener of [...listeners]) listener({ matches });
          });
        },
      };
    }

    it('closes the sheet from a screen and drops the draft', async () => {
      const media = stubDesktopQuery();
      const { onChange, user } = show({ value: { brandId: [BRAND_NIKE] } });
      const first = await open(user);
      await user.click(row(first, 'Бренд'));
      await user.click(first.getByRole('checkbox', { name: 'Puma 5' }));

      media.resize(true);

      await closed();
      expect(media.queries).toContain('(width >= 1024px)');
      expect(onChange).not.toHaveBeenCalled();

      media.resize(false);
      const second = await open(user);
      expect(row(second, 'Бренд')).toHaveTextContent('Nike');
      expect(row(second, 'Бренд')).not.toHaveTextContent('Puma');
    });

    it('stays open while the window is still narrow', async () => {
      const media = stubDesktopQuery();
      const { user } = show();
      await open(user);

      media.resize(false);

      expect(screen.getByRole('dialog', { name: 'Фильтры' })).toBeInTheDocument();
    });
  });
});
