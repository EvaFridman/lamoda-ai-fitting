import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
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
    });
  });

  it('sends nothing for the × of an applied chip, which is not the chip', () => {
    setup({ brandId: [BRAND] });
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить «Бренд»' }));
    expect(track).not.toHaveBeenCalled();
  });

  it('sends nothing for the drawer button', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Фильтры' }));
    expect(track).not.toHaveBeenCalled();
  });
});
