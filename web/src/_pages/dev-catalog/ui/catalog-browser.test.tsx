import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import { shouldRetry } from '@/shared/api';

import { PAGE_SIZE } from '../config/query';
import { CatalogBrowser } from './catalog-browser';

const BRAND_A = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const BRAND_B = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const DATE = '2026-10-01T12:00:00.000Z';
const TOTAL = 30;

const facets = {
  total: TOTAL,
  discounted: 0,
  price: { min: 100, max: 9000 },
  categories: [],
  brands: [
    { id: BRAND_A, name: 'Alpha', count: 20 },
    { id: BRAND_B, name: 'Beta', count: 10 },
  ],
  sizes: [],
  attributes: [],
};

function listBody(name: string, total: number) {
  return {
    items: [
      {
        id: BRAND_A,
        article: 'A-1',
        name,
        brand: { id: BRAND_A, name: 'Alpha' },
        category: { id: BRAND_B, name: 'Dresses', slug: 'dresses' },
        image: null,
        price: 5000,
        discount: 0,
        finalPrice: 5000,
        rating: null,
        createdAt: DATE,
      },
    ],
    total,
  };
}

const fetchMock = vi.fn();

function productRequests(): URL[] {
  return fetchMock.mock.calls
    .map((call) => new URL(String(call[0])))
    .filter((url) => url.pathname === '/api/products');
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation((input: unknown) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/products/facets') {
      return Promise.resolve(new Response(JSON.stringify(facets)));
    }
    const brand = url.searchParams.get('brandId');
    const offset = url.searchParams.get('offset') ?? '0';
    const name = `${brand ? 'Filtered' : 'All'} offset ${offset}`;
    return Promise.resolve(new Response(JSON.stringify(listBody(name, TOTAL))));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function Provider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            retry: shouldRetry,
            retryDelay: 0,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function envelope(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: { code, message: 'x', details: [] } }), { status });
}

describe('CatalogBrowser', () => {
  it('keeps the previous list and the pagination while the next page loads', async () => {
    const user = userEvent.setup();
    let release: (response: Response) => void = () => {};
    const base = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((input: unknown) => {
      if (new URL(String(input)).searchParams.get('offset') === String(PAGE_SIZE)) {
        return new Promise<Response>((resolve) => (release = resolve));
      }
      return base?.(input);
    });
    render(<CatalogBrowser />, { wrapper: Provider });
    await screen.findByText(/All offset 0/);
    const list = screen.getByRole('heading', { name: /Товары/ }).closest('section');
    expect(list).toHaveAttribute('aria-busy', 'false');

    await user.click(await screen.findByRole('button', { name: 'Дальше' }));

    expect(list).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText(/All offset 0/)).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Страницы товаров' })).toBeInTheDocument();
    expect(screen.queryByText('Загрузка…')).not.toBeInTheDocument();

    release(new Response(JSON.stringify(listBody(`All offset ${PAGE_SIZE}`, TOTAL))));
    expect(await screen.findByText(new RegExp(`All offset ${PAGE_SIZE}`))).toBeInTheDocument();
    expect(list).toHaveAttribute('aria-busy', 'false');
  });

  it('keeps the list and says why when the next page fails', async () => {
    const user = userEvent.setup();
    const base = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((input: unknown) =>
      new URL(String(input)).searchParams.get('offset') === String(PAGE_SIZE)
        ? Promise.resolve(envelope(500, 'INTERNAL_ERROR'))
        : base?.(input),
    );
    render(<CatalogBrowser />, { wrapper: Provider });
    await screen.findByText(/All offset 0/);
    await user.click(await screen.findByRole('button', { name: 'Дальше' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ошибка на сервере');
    expect(screen.getByText(/All offset 0/)).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Страницы товаров' })).toBeInTheDocument();
  });

  it('shows the cached unfiltered list at once when every brand is unchecked', async () => {
    const user = userEvent.setup();
    render(<CatalogBrowser />, { wrapper: Provider });
    await screen.findByText(/All offset 0/);
    await user.click(await screen.findByRole('checkbox', { name: /Beta/ }));
    await screen.findByText(/Filtered offset 0/);
    const before = productRequests().length;

    await user.click(screen.getByRole('checkbox', { name: /Beta/ }));

    expect(await screen.findByText(/All offset 0/)).toBeInTheDocument();
    expect(productRequests()).toHaveLength(before);
  });

  it('loads the first page and the brands when nothing was handed over', async () => {
    render(<CatalogBrowser />, { wrapper: Provider });
    expect(await screen.findByText(/All offset 0/)).toBeInTheDocument();
    expect(await screen.findByRole('checkbox', { name: /Alpha/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Beta/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: `Товары: ${TOTAL}` })).toBeInTheDocument();
  });

  it('requests the products of a picked brand from the first page', async () => {
    const user = userEvent.setup();
    render(<CatalogBrowser />, { wrapper: Provider });
    await user.click(await screen.findByRole('checkbox', { name: /Beta/ }));

    expect(await screen.findByText(/Filtered offset 0/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Beta/ })).toBeChecked();
    const last = productRequests().at(-1);
    expect(last?.searchParams.getAll('brandId')).toEqual([BRAND_B]);
    expect(last?.searchParams.get('limit')).toBe(String(PAGE_SIZE));
    expect(last?.searchParams.get('offset') ?? '0').toBe('0');
  });

  it('requests the next page with the page size as offset', async () => {
    const user = userEvent.setup();
    render(<CatalogBrowser />, { wrapper: Provider });
    await screen.findByText(/All offset 0/);
    await user.click(await screen.findByRole('button', { name: 'Дальше' }));

    expect(await screen.findByText(new RegExp(`All offset ${PAGE_SIZE}`))).toBeInTheDocument();
    expect(productRequests().at(-1)?.searchParams.get('offset')).toBe(String(PAGE_SIZE));
    expect(screen.getByRole('button', { name: 'Страница 2' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('goes back to page 1 when the brand changes', async () => {
    const user = userEvent.setup();
    render(<CatalogBrowser />, { wrapper: Provider });
    await user.click(await screen.findByRole('button', { name: 'Дальше' }));
    await screen.findByText(new RegExp(`All offset ${PAGE_SIZE}`));

    await user.click(screen.getByRole('checkbox', { name: /Alpha/ }));

    expect(await screen.findByText(/Filtered offset 0/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Страница 1' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const last = productRequests().at(-1);
    expect(last?.searchParams.getAll('brandId')).toEqual([BRAND_A]);
    expect(last?.searchParams.get('offset') ?? '0').toBe('0');
  });

  it('shows the error text when the products fail', async () => {
    fetchMock.mockImplementation((input: unknown) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/products/facets') {
        return Promise.resolve(new Response(JSON.stringify(facets)));
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'x', details: [] } }),
          {
            status: 500,
          },
        ),
      );
    });
    render(<CatalogBrowser />, { wrapper: Provider });
    expect(await screen.findByRole('alert')).toHaveTextContent('Ошибка на сервере');
  });
});
