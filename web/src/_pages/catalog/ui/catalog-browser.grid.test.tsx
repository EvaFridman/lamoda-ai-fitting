import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProductGridProps } from '@/widgets/product-grid';

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/catalog',
  useSearchParams: () => new URLSearchParams(),
}));
// The grid is replaced by a stub that shows what the browser list hands it.
vi.mock('@/widgets/product-grid', () => ({
  ProductGrid: (props: ProductGridProps) => (
    <div>
      <p>{props.products.map((product) => product.name).join(',')}</p>
      <p>{`canLoadMore:${String(props.canLoadMore)} showMore:${String(props.showMore)}`}</p>
      <button type="button" onClick={props.onLoadMore}>
        load
      </button>
    </div>
  ),
}));
vi.mock('@/shared/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/shared/api')>();
  return { ...original, reportFailure: vi.fn() };
});

import { createBrowserQueryClient } from '@/_app/providers';

import { CatalogBrowser } from './catalog-browser';

const fetchMock = vi.fn();

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const DATE = '2026-10-01T12:00:00.000Z';

function productNamed(n: number) {
  return {
    id: `7c9e6679-7425-40de-944b-e07fc1f9${String(n).padStart(4, '0')}`,
    article: `A-${n}`,
    name: `Платье ${n}`,
    brand: { id: ID, name: 'Бренд' },
    category: { id: ID, name: 'Платья', slug: 'dresses' },
    image: null,
    price: 5000,
    discount: 0,
    finalPrice: 5000,
    rating: null,
    createdAt: DATE,
  };
}

const facets = {
  total: 40,
  discounted: 0,
  price: null,
  categories: [],
  brands: [],
  sizes: [],
  attributes: [],
};

const refused = {
  error: {
    code: 'VALIDATION_FAILED',
    message: 'm',
    details: [{ field: 'cursor', code: 'INVALID_CURSOR', message: 'x' }],
  },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

// The filter counts and the category list answer whatever the batches do.
function side(input: unknown): Response | undefined {
  const path = new URL(String(input), 'http://localhost').pathname;
  if (path.endsWith('/products/facets')) return json(facets);
  if (path.endsWith('/categories')) return json({ items: [], total: 0 });
  return undefined;
}

function batchUrls(): URL[] {
  return fetchMock.mock.calls
    .filter(([input]) => side(input) === undefined)
    .map(([input]) => new URL(String(input), 'http://localhost'));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CatalogBrowser and its grid', () => {
  it('does not let the grid ask for a next batch during a refetch, and lets it once that ends', async () => {
    const client = createBrowserQueryClient();
    let answer: (response: Response) => void = () => {};
    let refetching = false;
    fetchMock.mockImplementation((input: unknown) => {
      const other = side(input);
      if (other) return Promise.resolve(other);
      const first = json({ items: [productNamed(1)], total: 1, nextCursor: 'c-2' });
      return refetching ? new Promise<Response>((resolve) => (answer = resolve)) : first;
    });
    render(
      <QueryClientProvider client={client}>
        <CatalogBrowser title="Каталог" query={{}} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/canLoadMore:true/)).toBeInTheDocument();

    refetching = true;
    let refetch: Promise<unknown> = Promise.resolve();
    act(() => {
      refetch = client.refetchQueries({ queryKey: ['products'] });
    });
    expect(await screen.findByText(/canLoadMore:false/)).toBeInTheDocument();

    await act(async () => {
      answer(json({ items: [productNamed(1)], total: 1, nextCursor: 'c-2' }));
      await refetch;
    });
    expect(await screen.findByText(/canLoadMore:true/)).toBeInTheDocument();
  });

  it('keeps the loaded batches and shows the error when a next cursor is refused', async () => {
    let call = 0;
    fetchMock.mockImplementation((input: unknown) =>
      Promise.resolve(
        side(input) ??
          (call++ === 0
            ? json({ items: [productNamed(1)], total: 1, nextCursor: 'c-2' })
            : json(refused, 400)),
      ),
    );
    render(
      <QueryClientProvider client={createBrowserQueryClient()}>
        <CatalogBrowser title="Каталог" query={{}} />
      </QueryClientProvider>,
    );
    await screen.findByText(/canLoadMore:true/);
    await userEvent.setup().click(screen.getByRole('button', { name: 'load' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Платье 1')).toBeInTheDocument();
    expect(screen.getByText(/canLoadMore:false showMore:true/)).toBeInTheDocument();
    expect(batchUrls()).toHaveLength(2);
    expect(batchUrls()[1]?.searchParams.get('cursor')).toBe('c-2');
    await act(async () => {});
    expect(batchUrls()).toHaveLength(2);
  });
});
