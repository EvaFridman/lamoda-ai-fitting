import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProductFacets } from '@/entities/product';
import { track } from '@/shared/analytics/client';

import { CatalogFilters } from './catalog-filters';

const nav = vi.hoisted(() => ({ pathname: '/catalog' }));

vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));
vi.mock('@/shared/analytics/client', () => ({ track: vi.fn() }));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const BRAND = id(1);

const facets: ProductFacets = {
  total: 20,
  discounted: 4,
  price: { min: 1000, max: 10000 },
  categories: [],
  brands: [{ id: BRAND, name: 'Nike', count: 12 }],
  sizes: [{ size: 'M', count: 3 }],
  attributes: [
    {
      id: id(100),
      name: 'Цвет',
      values: [{ id: id(101), value: 'Черный', colorHex: '#000000', count: 5 }],
    },
    {
      id: id(200),
      name: 'Материал',
      values: [{ id: id(201), value: 'Хлопок', colorHex: null, count: 9 }],
    },
  ],
};

// A hover is sent once per element per path, state kept for the whole file: a path for each test.
let testNumber = 0;

beforeEach(() => {
  vi.mocked(track).mockClear();
  testNumber += 1;
  nav.pathname = `/catalog-${testNumber}`;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setup(value = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CatalogFilters facets={facets} value={value} onChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('the filters row analytics', () => {
  it.each([
    ['Новинки', 'catalog.sort'],
    ['Цвет', 'catalog.filter-color'],
    ['Материал', 'catalog.filter-attribute'],
    ['Бренд', 'catalog.filter-brand'],
    ['Размер', 'catalog.filter-size'],
    ['Цена', 'catalog.filter-price'],
    ['Только со скидкой', 'catalog.filter-discount'],
  ])('sends Element Clicked for the chip "%s" as %s', (name, element) => {
    setup();
    fireEvent.click(screen.getByRole('button', { name }));
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('Element Clicked', {
      element,
      zone: 'catalog',
      type: 'interaction',
      surface: 'chips',
    });
  });

  it('sends Element Hovered once for a chip after 500 ms of a mouse', () => {
    vi.useFakeTimers();
    setup();
    const chip = screen.getByRole('button', { name: 'Размер' });
    fireEvent.pointerEnter(chip, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(499));
    expect(track).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('Element Hovered', {
      element: 'catalog.filter-size',
      zone: 'catalog',
      type: 'interaction',
      surface: 'chips',
    });
  });

  it('sends nothing for the × of an applied chip, which is not the chip', () => {
    setup({ brandId: [BRAND] });
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить «Бренд»' }));
    expect(track).not.toHaveBeenCalled();
  });

  it.each([
    ['nothing applied', {}, false],
    ['a filter applied', { brandId: [BRAND] }, true],
    ['a sort alone', { sort: 'price_asc' }, true],
  ])('sends catalog.sheet-open for the drawer button with %s', (_, value, active) => {
    setup(value);
    fireEvent.click(screen.getByRole('button', { name: 'Фильтры' }));
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('Element Clicked', {
      element: 'catalog.sheet-open',
      zone: 'catalog',
      type: 'interaction',
      active,
    });
  });
});

describe('the sheet analytics', () => {
  // The open sheet's modal layer sets `pointer-events: none` on the page around it.
  const setupUser = () => userEvent.setup({ pointerEventsCheck: 0 });

  async function openSheet() {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(facets)))),
    );
    setup();
    const user = setupUser();
    await user.click(screen.getByRole('button', { name: 'Фильтры' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Фильтры' }));
    vi.mocked(track).mockClear();
    return { user, dialog };
  }

  it('sends each row’s element with the sheet surface, and the discount switch', async () => {
    const { user, dialog } = await openSheet();
    const rows: [string, string][] = [
      ['Сортировка', 'catalog.sort'],
      ['Размер', 'catalog.filter-size'],
      ['Цвет', 'catalog.filter-color'],
      ['Цена', 'catalog.filter-price'],
      ['Бренд', 'catalog.filter-brand'],
      ['Материал', 'catalog.filter-attribute'],
    ];

    // A hover timer of the real clock may fire meanwhile: only the clicks are counted.
    const clicks = () =>
      vi.mocked(track).mock.calls.filter(([event]) => event === 'Element Clicked');

    for (const [name, element] of rows) {
      vi.mocked(track).mockClear();
      await user.click(dialog.getByRole('button', { name }));
      expect(clicks()).toEqual([
        ['Element Clicked', { element, zone: 'catalog', type: 'interaction', surface: 'sheet' }],
      ]);
      await user.click(
        within(screen.getByRole('dialog', { name })).getByRole('button', {
          name: 'Назад к фильтрам',
        }),
      );
      await vi.waitFor(() =>
        expect(screen.queryByRole('dialog', { name })).not.toBeInTheDocument(),
      );
    }

    vi.mocked(track).mockClear();
    await user.click(dialog.getByRole('switch', { name: 'Только со скидкой' }));
    expect(clicks()).toEqual([
      [
        'Element Clicked',
        {
          element: 'catalog.filter-discount',
          zone: 'catalog',
          type: 'interaction',
          surface: 'sheet',
        },
      ],
    ]);
  });

  it('cancels a row’s pending hover when the row is clicked, since it goes with its screen', async () => {
    const { dialog } = await openSheet();
    vi.useFakeTimers();
    const row = dialog.getByRole('button', { name: 'Размер' });
    fireEvent.pointerEnter(row, { pointerType: 'mouse' });
    fireEvent.click(row);
    act(() => vi.advanceTimersByTime(500));

    const events = vi.mocked(track).mock.calls.map(([event]) => event);
    expect(events).toEqual(['Element Clicked']);
  });

  it('sends one Element Hovered for the discount row after 500 ms on its label text', async () => {
    const { dialog } = await openSheet();
    vi.useFakeTimers();
    fireEvent.pointerEnter(dialog.getByText('Только со скидкой'), { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(499));
    expect(track).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));

    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('Element Hovered', {
      element: 'catalog.filter-discount',
      zone: 'catalog',
      type: 'interaction',
      surface: 'sheet',
    });
  });

  it.each([
    [
      'the label text',
      (dialog: ReturnType<typeof within>) => dialog.getByText('Только со скидкой'),
    ],
    [
      'the switch itself',
      (dialog: ReturnType<typeof within>) =>
        dialog.getByRole('switch', { name: 'Только со скидкой' }),
    ],
  ])('counts the discount switch once when %s is clicked', async (_, target) => {
    const { user, dialog } = await openSheet();
    await user.click(target(dialog));
    const clicks = vi.mocked(track).mock.calls.filter(([event]) => event === 'Element Clicked');
    expect(clicks).toEqual([
      [
        'Element Clicked',
        {
          element: 'catalog.filter-discount',
          zone: 'catalog',
          type: 'interaction',
          surface: 'sheet',
        },
      ],
    ]);
    expect(dialog.getByRole('switch', { name: 'Только со скидкой' })).toBeChecked();
  });

  it('sends nothing for "Сбросить", "Применить", "По умолчанию", "Назад" and "Показать"', async () => {
    const { user, dialog } = await openSheet();
    await user.click(dialog.getByRole('switch', { name: 'Только со скидкой' }));
    vi.mocked(track).mockClear();

    await user.click(dialog.getByRole('button', { name: 'Сбросить' }));
    const gone = (name: string) =>
      vi.waitFor(() => expect(screen.queryByRole('dialog', { name })).not.toBeInTheDocument());
    await user.click(dialog.getByRole('button', { name: /^Сортировка/ }));
    const sort = within(screen.getByRole('dialog', { name: 'Сортировка' }));
    vi.mocked(track).mockClear();
    await user.click(sort.getByRole('radio', { name: 'Сначала дороже' }));
    await user.click(sort.getByRole('button', { name: 'По умолчанию' }));
    await user.click(sort.getByRole('button', { name: 'Применить' }));
    await gone('Сортировка');
    await user.click(dialog.getByRole('button', { name: /^Размер/ }));
    const size = within(screen.getByRole('dialog', { name: 'Размер' }));
    vi.mocked(track).mockClear();
    await user.click(size.getByRole('checkbox', { name: 'M 3' }));
    await user.click(size.getByRole('button', { name: 'Сбросить' }));
    await user.click(size.getByRole('button', { name: 'Назад к фильтрам' }));
    await gone('Размер');
    await user.click(dialog.getByRole('button', { name: /^Показать/ }));

    expect(track).not.toHaveBeenCalled();
  });
});
