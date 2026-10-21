import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Outside the app router the hooks of the grid's address give nothing.
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => '/catalog',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/shared/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/shared/api')>();
  return { ...original, reportFailure: vi.fn() };
});

import { createBrowserQueryClient } from '@/_app/providers';
import { errorText, reportFailure } from '@/shared/api';

import { CatalogBrowser, type CatalogBrowserProps } from './catalog-browser';

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

function json(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

function isFacets(input: unknown): boolean {
  return new URL(String(input), 'http://localhost').pathname.endsWith('/products/facets');
}

function batchUrls(): URL[] {
  return fetchMock.mock.calls
    .filter(([input]) => !isFacets(input))
    .map(([input]) => new URL(String(input), 'http://localhost'));
}

// `batches` answer the batch requests in turn; a function answers instead of a body.
function stubApi(...batches: (unknown | (() => Promise<Response>))[]) {
  let call = 0;
  fetchMock.mockImplementation((input: unknown) => {
    if (isFacets(input)) return json(facets);
    const next = batches[Math.min(call++, batches.length - 1)];
    return typeof next === 'function' ? (next as () => Promise<Response>)() : json(next);
  });
}

async function show(props: CatalogBrowserProps, settle = true) {
  render(
    <QueryClientProvider client={createBrowserQueryClient()}>
      <CatalogBrowser {...props} />
    </QueryClientProvider>,
  );
  await act(async () => {});
  if (settle) await screen.findByRole('list');
}

const never = () => new Promise<Response>(() => {});

beforeEach(() => {
  fetchMock.mockReset();
  vi.mocked(reportFailure).mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CatalogBrowser', () => {
  it('links "Дальше" to the next batch by the address state and the cursor', async () => {
    stubApi({ items: [productNamed(1)], total: 1, nextCursor: 'next 1' }, never);
    await show({ query: { q: 'платье', sort: 'price_asc' } });
    const link = screen.getByRole('link', { name: 'Дальше' });
    expect(link).toHaveAttribute(
      'href',
      `?q=${encodeURIComponent('платье')}&sort=price_asc&cursor=next%201`,
    );
    expect(link).toHaveAttribute('rel', 'next');
  });

  it('has no "Дальше" on the last batch', async () => {
    stubApi({ items: [productNamed(1)], total: 1, nextCursor: null });
    await show({ query: {} });
    expect(screen.queryByRole('link', { name: 'Дальше' })).not.toBeInTheDocument();
    expect(batchUrls()).toHaveLength(1);
  });

  it('keeps "Дальше" out of sight while the list loads batches itself', async () => {
    stubApi({ items: [productNamed(1)], total: 1, nextCursor: 'c' }, never);
    await show({ query: {} });
    expect(screen.getByRole('link', { name: 'Дальше' })).toHaveClass('hidden');
  });

  it('numbers the cards against the filter counts total', async () => {
    stubApi({ items: [productNamed(1)], total: 1, nextCursor: null });
    await show({ query: {} });
    await vi.waitFor(() =>
      expect(screen.getAllByRole('listitem')[0]).toHaveAttribute('aria-setsize', '40'),
    );
    expect(screen.getAllByRole('listitem')[0]).toHaveAttribute('aria-posinset', '1');
  });

  it('requests the next batch with the cursor and appends its cards', async () => {
    stubApi(
      { items: [productNamed(1)], total: 1, nextCursor: 'c-2' },
      { items: [productNamed(2)], total: 1, nextCursor: null },
    );
    await show({ query: {} });
    expect(await screen.findByRole('link', { name: /Платье 2/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Платье 1/ })).toBeInTheDocument();
    expect(batchUrls()[1]?.searchParams.get('cursor')).toBe('c-2');
  });

  it('makes "Дальше" visible and shows the error when the next batch fails', async () => {
    stubApi({ items: [productNamed(1)], total: 1, nextCursor: 'c-2' }, () =>
      json({ error: { code: 'INTERNAL', message: 'm', details: [] } }, 500),
    );
    await show({ query: { q: 'a' } });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBeTruthy();
    expect(screen.getByRole('link', { name: /Платье 1/ })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Дальше' });
    expect(link).not.toHaveClass('hidden');
    expect(link).toHaveAttribute('href', '?q=a&cursor=c-2');
    expect(batchUrls()).toHaveLength(2);
    expect(reportFailure).toHaveBeenCalled();
    expect(errorText(vi.mocked(reportFailure).mock.calls[0]?.[0])).toBe(alert.textContent);
  });

  describe('a cursor the api refuses (O72)', () => {
    const refused = () =>
      json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'm',
            details: [{ field: 'cursor', code: 'INVALID_CURSOR', message: 'x' }],
          },
        },
        400,
      );

    it('falls back to the first batch', async () => {
      stubApi(refused, { items: [productNamed(1)], total: 1, nextCursor: null });
      await show({ query: {}, start: 'bad' });
      expect(await screen.findByRole('link', { name: /Платье 1/ })).toBeInTheDocument();
      expect(batchUrls()).toHaveLength(2);
      expect(batchUrls()[0]?.searchParams.get('cursor')).toBe('bad');
      expect(batchUrls()[1]?.searchParams.has('cursor')).toBe(false);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('shows the error for any other failure of a cursor start', async () => {
      stubApi(() => json({ error: { code: 'X', message: 'm', details: [] } }, 400));
      await show({ query: {}, start: 'bad' }, false);
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(batchUrls()).toHaveLength(1);
    });
  });

  it('shows nothing while loading and no server failure text', async () => {
    stubApi(never);
    await show({ query: {} }, false);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
