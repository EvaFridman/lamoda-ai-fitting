import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProductFacets } from '@/entities/product';

import { CatalogFilters } from './catalog-filters';

vi.mock('next/navigation', () => ({ usePathname: () => '/catalog' }));
vi.mock('@/shared/analytics/client', () => ({ track: vi.fn() }));

const BRAND = '00000000-0000-4000-8000-000000000001';

const facets: ProductFacets = {
  total: 20,
  discounted: 4,
  price: null,
  categories: [],
  brands: [{ id: BRAND, name: 'Nike', count: 12 }],
  sizes: [],
  attributes: [],
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ...facets, total: 7 })))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CatalogFilters phone drawer', () => {
  it('reports the toggled filter with the rest of the selection on "Показать"', async () => {
    const onChange = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <CatalogFilters facets={facets} value={{ q: 'платье' }} onChange={onChange} />
      </QueryClientProvider>,
    );
    // The open drawer's modal layer sets `pointer-events: none` on the page around it.
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(screen.getByRole('button', { name: 'Фильтры' }));
    const drawer = within(await screen.findByRole('dialog'));
    await user.click(drawer.getByRole('switch', { name: 'Только со скидкой' }));
    expect(onChange).not.toHaveBeenCalled();
    await user.click(await drawer.findByRole('button', { name: /^Показать/ }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ q: 'платье', hasDiscount: true });
  });
});
