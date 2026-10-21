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
        { id: id(102), value: 'Синий', colorHex: '#3972FC', count: 7 },
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

async function open(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByRole('button', { name: 'Фильтры' }));
  const dialog = await screen.findByRole('dialog', { name: 'Фильтры' });
  await vi.waitFor(() => expect(dialog).not.toHaveAttribute('data-starting-style'));
  return within(dialog);
}

const showButton = (dialog: ReturnType<typeof within>, name: string | RegExp = /^Показать/) =>
  dialog.getByRole('button', { name });

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

  it('opens a sheet with the sort, every filter as a section, and the discount switch', async () => {
    const { user } = show();
    const dialog = await open(user);

    for (const name of ['Сортировка', 'Цвет', 'Материал', 'Бренд', 'Размер', 'Цена']) {
      expect(dialog.getByRole('button', { name })).toHaveAttribute('aria-expanded', 'false');
    }
    expect(dialog.getByRole('switch', { name: 'Только со скидкой' })).not.toBeChecked();
    expect(dialog.queryByRole('button', { name: 'Очистить фильтры' })).not.toBeInTheDocument();
  });

  it('has no price section when there are no products to price', async () => {
    const { user } = show({ facets: { ...facets, price: null } });
    const dialog = await open(user);

    expect(dialog.getByRole('button', { name: 'Бренд' })).toBeInTheDocument();
    expect(dialog.queryByRole('button', { name: 'Цена' })).not.toBeInTheDocument();
  });

  it('has only the sort without the counts', async () => {
    const { user } = show({ facets: undefined });
    const dialog = await open(user);

    expect(dialog.getByRole('button', { name: 'Сортировка' })).toBeInTheDocument();
    expect(dialog.queryByRole('button', { name: 'Бренд' })).not.toBeInTheDocument();
    expect(dialog.queryByRole('switch')).not.toBeInTheDocument();
  });

  describe('"Показать"', () => {
    it('applies the draft with the rest of the selection, and closes', async () => {
      const { onChange, user } = show({ value: { q: 'платье', sort: 'price_asc' } });
      const dialog = await open(user);

      await user.click(dialog.getByRole('button', { name: 'Бренд' }));
      await user.click(dialog.getByRole('checkbox', { name: 'Puma 5' }));
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
      await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('applies a sort, and the default sort leaves the selection', async () => {
      const { onChange, user } = show({ value: { sort: 'price_asc' } });
      const dialog = await open(user);

      await user.click(dialog.getByRole('button', { name: 'Сортировка' }));
      expect(dialog.getByRole('radio', { name: 'Сначала дешевле' })).toBeChecked();
      await user.click(dialog.getByRole('radio', { name: 'Новинки' }));
      await user.click(showButton(dialog));

      const applied = onChange.mock.calls[0]?.[0] as CatalogFilterValue;
      expect(applied.sort).toBeUndefined();
    });

    it('applies a colour next to the values chosen in another attribute', async () => {
      const { onChange, user } = show({ value: { attributeValueId: [COTTON] } });
      const dialog = await open(user);

      await user.click(dialog.getByRole('button', { name: 'Цвет' }));
      await user.click(dialog.getByRole('checkbox', { name: 'Черный 5' }));
      await user.click(showButton(dialog));

      expect(onChange).toHaveBeenCalledWith({ attributeValueId: [COTTON, BLACK] });
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

      await user.click(dialog.getByRole('button', { name: 'Бренд' }));
      await user.click(dialog.getByRole('checkbox', { name: 'Puma 5' }));
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

      await user.click(dialog.getByRole('button', { name: 'Сортировка' }));
      await user.click(dialog.getByRole('radio', { name: 'Сначала дешевле' }));

      expect(dialog.getByRole('radio', { name: 'Сначала дешевле' })).toBeChecked();
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
    it('drops the draft: reopening starts from the address selection', async () => {
      const { onChange, user } = show({ value: { brandId: [BRAND_NIKE] } });
      const first = await open(user);

      await user.click(first.getByRole('button', { name: 'Бренд' }));
      await user.click(first.getByRole('checkbox', { name: 'Puma 5' }));
      await user.keyboard('{Escape}');
      await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(onChange).not.toHaveBeenCalled();

      const second = await open(user);
      await user.click(second.getByRole('button', { name: 'Бренд' }));
      expect(second.getByRole('checkbox', { name: 'Nike 12' })).toBeChecked();
      expect(second.getByRole('checkbox', { name: 'Puma 5' })).not.toBeChecked();
    });

    it('closes on the ×', async () => {
      const { onChange, user } = show();
      const dialog = await open(user);

      await user.click(dialog.getByRole('button', { name: 'Закрыть' }));

      await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(onChange).not.toHaveBeenCalled();
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

    it('closes the sheet and drops the draft', async () => {
      const media = stubDesktopQuery();
      const { onChange, user } = show({ value: { brandId: [BRAND_NIKE] } });
      const first = await open(user);
      await user.click(first.getByRole('button', { name: 'Бренд' }));
      await user.click(first.getByRole('checkbox', { name: 'Puma 5' }));

      media.resize(true);

      await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(media.queries).toContain('(width >= 1024px)');
      expect(onChange).not.toHaveBeenCalled();

      media.resize(false);
      const second = await open(user);
      await user.click(second.getByRole('button', { name: 'Бренд' }));
      expect(second.getByRole('checkbox', { name: 'Nike 12' })).toBeChecked();
      expect(second.getByRole('checkbox', { name: 'Puma 5' })).not.toBeChecked();
    });

    it('stays open while the window is still narrow', async () => {
      const media = stubDesktopQuery();
      const { user } = show();
      await open(user);

      media.resize(false);

      expect(screen.getByRole('dialog', { name: 'Фильтры' })).toBeInTheDocument();
    });
  });

  describe('the count of zero', () => {
    it('reads "Показать 0 товаров"', async () => {
      stubCount(() => 0);
      const { user } = show();
      const dialog = await open(user);

      await vi.waitFor(() => expect(showButton(dialog)).toHaveAccessibleName('Показать 0 товаров'));
    });
  });

  describe('the price section', () => {
    it('moves the draft only: nothing is applied and the sheet stays open', async () => {
      const { onChange, user } = show();
      const dialog = await open(user);

      await user.click(dialog.getByRole('button', { name: 'Цена' }));
      dialog.getByRole('slider', { name: 'Мин. цена' }).focus();
      await user.keyboard('{ArrowRight}');

      expect(dialog.getByRole('slider', { name: 'Мин. цена' })).toHaveAttribute(
        'aria-valuenow',
        '1001',
      );
      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog', { name: 'Фильтры' })).toBeInTheDocument();

      await user.click(showButton(dialog));
      expect(onChange).toHaveBeenCalledWith({ minPrice: 1001 });
    });
  });

  describe('"Очистить фильтры"', () => {
    it('is not offered with nothing applied or a sort alone', async () => {
      const { user } = show({ value: { sort: 'price_desc' } });
      const dialog = await open(user);

      expect(dialog.queryByRole('button', { name: 'Очистить фильтры' })).not.toBeInTheDocument();
    });

    it('applies at once, keeps the sort, leaves the sheet open and focuses "Показать"', async () => {
      const { onChange, user } = show({
        value: { q: 'платье', sort: 'price_desc', brandId: [BRAND_NIKE], hasDiscount: true },
      });
      const dialog = await open(user);

      await user.click(dialog.getByRole('button', { name: 'Очистить фильтры' }));

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith({ sort: 'price_desc' });
      expect(screen.getByRole('dialog', { name: 'Фильтры' })).toBeInTheDocument();
      expect(showButton(dialog)).toHaveFocus();
      expect(dialog.getByRole('switch', { name: 'Только со скидкой' })).not.toBeChecked();
    });

    it('is offered for a draft filter too, and only resets the draft', async () => {
      const { onChange, user } = show();
      const dialog = await open(user);

      await user.click(dialog.getByRole('switch', { name: 'Только со скидкой' }));
      await user.click(dialog.getByRole('button', { name: 'Очистить фильтры' }));

      expect(onChange).not.toHaveBeenCalled();
      expect(dialog.getByRole('switch', { name: 'Только со скидкой' })).not.toBeChecked();
      expect(dialog.queryByRole('button', { name: 'Очистить фильтры' })).not.toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'Фильтры' })).toBeInTheDocument();
    });

    it('keeps the sort chosen in the draft, and the applied one in the address', async () => {
      const { onChange, user } = show({
        value: { sort: 'price_asc', brandId: [BRAND_NIKE] },
      });
      const dialog = await open(user);

      await user.click(dialog.getByRole('button', { name: 'Сортировка' }));
      await user.click(dialog.getByRole('radio', { name: 'Сначала дороже' }));
      await user.click(dialog.getByRole('button', { name: 'Бренд' }));
      await user.click(dialog.getByRole('checkbox', { name: 'Puma 5' }));
      await user.click(dialog.getByRole('button', { name: 'Очистить фильтры' }));

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith({ sort: 'price_asc' });
      expect(dialog.getByRole('radio', { name: 'Сначала дороже' })).toBeChecked();

      await user.click(showButton(dialog));
      expect(onChange).toHaveBeenCalledTimes(2);
      expect(onChange).toHaveBeenLastCalledWith({ sort: 'price_desc' });
    });
  });
});
