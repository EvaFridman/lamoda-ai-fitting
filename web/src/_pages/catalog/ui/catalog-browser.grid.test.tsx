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
  ProductGridSkeleton: () => <p>grid-skeleton</p>,
  ProductGrid: (props: ProductGridProps) => (
    <div>
      <p>{props.products.map((product) => product.name).join(',')}</p>
      <p>{`canLoadMore:${String(props.canLoadMore)} showMore:${String(props.showMore)}`}</p>
      <button type="button" onClick={() => props.onLoadMore(false)}>
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
import { productInfiniteOptions } from '@/entities/product';

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
  describe('while the first batch loads (0020 W2)', () => {
    function pendingBatch() {
      let answer: (response: Response) => void = () => {};
      fetchMock.mockImplementation((input: unknown) => {
        const other = side(input);
        return other
          ? Promise.resolve(other)
          : new Promise<Response>((resolve) => (answer = resolve));
      });
      return (response: Response) => answer(response);
    }

    function renderBrowser(failureText?: string) {
      render(
        <QueryClientProvider client={createBrowserQueryClient()}>
          <CatalogBrowser title="Каталог" query={{}} failureText={failureText} />
        </QueryClientProvider>,
      );
    }

    it('shows the grid placeholders, then the grid once the batch answers', async () => {
      const answer = pendingBatch();
      renderBrowser();
      await act(async () => {});
      expect(screen.getByText('grid-skeleton')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();

      await act(async () => {
        answer(json({ items: [productNamed(1)], total: 1, nextCursor: null }));
      });
      expect(await screen.findByText('Платье 1')).toBeInTheDocument();
      expect(screen.queryByText('grid-skeleton')).not.toBeInTheDocument();
    });

    it('shows the server failure text, not the placeholders', async () => {
      pendingBatch();
      renderBrowser('Не загрузилось');
      await act(async () => {});
      expect(screen.getByRole('alert')).toHaveTextContent('Не загрузилось');
      expect(screen.queryByText('grid-skeleton')).not.toBeInTheDocument();
    });

    it('shows the error of the browser request, not the placeholders', async () => {
      fetchMock.mockImplementation((input: unknown) =>
        Promise.resolve(side(input) ?? json({}, 500)),
      );
      renderBrowser();
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.queryByText('grid-skeleton')).not.toBeInTheDocument();
    });

    it('marks the list column busy only while the placeholders show', async () => {
      const answer = pendingBatch();
      renderBrowser();
      await act(async () => {});
      expect(screen.getByText('grid-skeleton').parentElement).toHaveAttribute('aria-busy', 'true');

      await act(async () => {
        answer(json({ items: [productNamed(1)], total: 1, nextCursor: null }));
      });
      const name = await screen.findByText('Платье 1');
      expect(name.parentElement?.parentElement).toHaveAttribute('aria-busy', 'false');
    });

    it('does not mark the column busy under the server failure text', async () => {
      pendingBatch();
      renderBrowser('Не загрузилось');
      await act(async () => {});
      expect(screen.getByRole('alert').parentElement).toHaveAttribute('aria-busy', 'false');
    });

    it('does not mark the column busy under the error of the browser request', async () => {
      fetchMock.mockImplementation((input: unknown) =>
        Promise.resolve(side(input) ?? json({}, 500)),
      );
      renderBrowser();
      const alert = await screen.findByRole('alert');
      expect(alert.parentElement).toHaveAttribute('aria-busy', 'false');
    });

    it("shows the browser request's error after the server failure text, not the text", async () => {
      fetchMock.mockImplementation((input: unknown) =>
        Promise.resolve(side(input) ?? json({}, 500)),
      );
      renderBrowser('Не загрузилось');
      await vi.waitFor(() =>
        expect(screen.getByRole('alert')).not.toHaveTextContent('Не загрузилось'),
      );
      expect(screen.getByRole('alert')).not.toBeEmptyDOMElement();
    });
  });

  // The new RSC payload brings the new `query` together with its first batch, which the server's
  // prefetch put into the cache (0020 plan §1, AC3).
  it("shows the server's batch for the new selection without placeholders", async () => {
    fetchMock.mockImplementation((input: unknown) =>
      Promise.resolve(
        side(input) ?? json({ items: [productNamed(1)], total: 1, nextCursor: null }),
      ),
    );
    const client = createBrowserQueryClient();
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <CatalogBrowser title="Каталог" query={{}} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Платье 1')).toBeInTheDocument();

    const next = { q: 'юбка' };
    client.setQueryData(productInfiniteOptions(next, null).queryKey, {
      pages: [{ items: [productNamed(2)], total: 1, nextCursor: null }],
      pageParams: [null],
    });
    const requests = batchUrls().length;
    rerender(
      <QueryClientProvider client={client}>
        <CatalogBrowser title="Каталог" query={next} />
      </QueryClientProvider>,
    );
    expect(screen.queryByText('grid-skeleton')).not.toBeInTheDocument();
    expect(screen.getByText('Платье 2')).toBeInTheDocument();
    await act(async () => {});
    expect(screen.queryByText('grid-skeleton')).not.toBeInTheDocument();
    expect(screen.getByText('Платье 2')).toBeInTheDocument();
    expect(batchUrls()).toHaveLength(requests);
  });

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
