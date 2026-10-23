import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createBrowserQueryClient } from '@/_app/providers';

import { CatalogBrowser } from './catalog-browser';

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/catalog/dresses',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/shared/analytics/client', () => ({ track: vi.fn() }));
vi.mock('@/widgets/product-grid', () => ({
  ProductGridSkeleton: () => <p>grid-skeleton</p>,
  ProductGrid: () => <p>grid</p>,
}));
vi.mock('@/shared/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/shared/api')>();
  return { ...original, reportFailure: vi.fn() };
});

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const facets = {
  total: 40,
  discounted: 4,
  price: null,
  categories: [],
  brands: [],
  sizes: [],
  attributes: [],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

type FacetsAnswer = () => Promise<Response>;
let facetsAnswer: FacetsAnswer;

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const path = new URL(String(input), 'http://localhost').pathname;
      if (path.endsWith('/products/facets')) return facetsAnswer();
      if (path.endsWith('/categories')) return Promise.resolve(json({ items: [], total: 0 }));
      return Promise.resolve(json({ items: [], total: null, nextCursor: null }));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mount() {
  render(
    <QueryClientProvider client={createBrowserQueryClient()}>
      <CatalogBrowser title="Платья" query={{}} categoryId={id(2)} />
    </QueryClientProvider>,
  );
}

describe('CatalogBrowser count', () => {
  it('draws a placeholder of the count while the counts load, with no count text', () => {
    facetsAnswer = () => new Promise<Response>(() => {});
    mount();
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(/^Платья$/);
    expect(heading.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('shows the count in place of the placeholder once the counts load', async () => {
    facetsAnswer = () => Promise.resolve(json(facets));
    mount();
    await vi.waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Платья 40 товаров'),
    );
    expect(
      screen.getByRole('heading', { level: 1 }).querySelector('[aria-hidden="true"]'),
    ).not.toBeInTheDocument();
  });

  it('draws neither a placeholder nor a count after the counts fail', async () => {
    let requests = 0;
    facetsAnswer = () => {
      requests += 1;
      return Promise.resolve(
        json({ error: { code: 'INTERNAL_ERROR', message: 'm', details: [] } }, 500),
      );
    };
    mount();
    await vi.waitFor(() => expect(requests).toBeGreaterThan(0));
    const heading = screen.getByRole('heading', { level: 1 });
    await vi.waitFor(() =>
      expect(heading.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument(),
    );
    expect(heading).toHaveTextContent(/^Платья$/);
  });
});
