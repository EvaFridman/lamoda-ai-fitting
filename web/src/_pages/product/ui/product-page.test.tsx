import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { isValidElement, type ReactElement, Suspense } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/shared/config/server', () => ({
  getServerEnv: () => ({ SITE_URL: 'https://site.test' }),
}));
vi.mock('@/shared/csp/server', () => ({ requestNonce: () => Promise.resolve('n0nce') }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/products/p1',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('@/shared/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/shared/api')>();
  return { ...original, reportFailure: vi.fn() };
});
vi.mock('../model/load-product', () => ({ loadProductWithSlot: vi.fn() }));
vi.mock('@/entities/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/session')>()),
  useSession: () => ({ status: 'signed-out', failed: false }),
}));
vi.mock('@/shared/analytics/client', () => ({ identify: vi.fn(), track: vi.fn(), reset: vi.fn() }));
const related = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/entities/product/server', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/entities/product/server')>();
  return {
    ...original,
    // The real key, a read the test controls.
    relatedProductsOptions: (checked: { id: string }) => ({
      queryKey: original.relatedProductsOptions(checked).queryKey,
      queryFn: related.read,
    }),
  };
});

import { notFound } from 'next/navigation';

import { createBrowserQueryClient } from '@/_app/providers';
import type { ProductDetail } from '@/entities/product';
import { productOptions, relatedProductsOptions } from '@/entities/product/server';
import { ApiError, errorText, reportFailure } from '@/shared/api';

import { loadProductWithSlot } from '../model/load-product';
import { ProductPage } from './product-page';
import { ProductSkeleton } from './product-skeleton';

const load = vi.mocked(loadProductWithSlot);

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const DATE = '2026-10-01T12:00:00.000Z';

const product: ProductDetail = {
  id: ID,
  article: 'A-1',
  name: 'Рубашка Design collection',
  brand: { id: ID, name: 'Annen' },
  category: { id: ID, name: 'Рубашки', slug: 'shirts' },
  image: null,
  price: 5000,
  discount: 0,
  finalPrice: 5000,
  rating: null,
  createdAt: DATE,
  updatedAt: DATE,
  description: 'Лёгкая рубашка.',
  images: [],
  variations: [{ id: ID, size: 'M', stock: 1 }],
  attributes: [],
};

function loaded(
  detail: ProductDetail = product,
  slot: 'top' | null = 'top',
): NonNullable<Awaited<ReturnType<typeof loadProductWithSlot>>> {
  return { product: detail, slot };
}

const params = Promise.resolve({ id: ID });
// The keys the browser's hooks read under.
const detailKey = productOptions(ID).queryKey;
const relatedKey = relatedProductsOptions({ id: ID }).queryKey;

type Server = (props: unknown) => Promise<ReactElement>;

function childrenOf(element: ReactElement): ReactElement[] {
  const children = (element.props as { children: ReactElement | ReactElement[] }).children;
  const list = Array.isArray(children) ? children : [children];
  expect(list.every((child) => isValidElement(child))).toBe(true);
  return list;
}

// The page's content under its Suspense is an async server component, which a jsdom render cannot
// run: take it out of the tree and await it the way Next does.
async function resolveContent(): Promise<ReactElement> {
  const main = ProductPage({ params });
  const suspense = childrenOf(main).find((child) => child.type === Suspense) as ReactElement;
  const content = childrenOf(suspense)[0] as ReactElement;
  return (content.type as Server)(content.props);
}

function renderBoundary(boundary: ReactElement) {
  return render(
    <QueryClientProvider client={createBrowserQueryClient()}>{boundary}</QueryClientProvider>,
  );
}

interface Dehydrated {
  queries: { queryKey: unknown[]; state: { data: unknown } }[];
}

function stateOf(boundary: ReactElement): Dehydrated {
  return (boundary.props as { state: Dehydrated }).state;
}

beforeEach(() => {
  load.mockReset();
  related.read.mockReset();
  related.read.mockResolvedValue([]);
  vi.mocked(notFound).mockClear();
  vi.mocked(reportFailure).mockClear();
});

describe('ProductPage', () => {
  it('shows the placeholders in the Suspense fallback while the product loads', () => {
    const main = ProductPage({ params });
    const suspense = childrenOf(main).find((child) => child.type === Suspense) as ReactElement;
    const fallback = (suspense.props as { fallback: ReactElement }).fallback;
    expect(fallback.type).toBe(ProductSkeleton);
    expect(load).not.toHaveBeenCalled();
  });

  it('loads the product of the address', async () => {
    load.mockResolvedValue(loaded());
    await resolveContent();
    expect(load).toHaveBeenCalledWith(ID);
  });

  it('shows the breadcrumbs: the catalog as a link, the category last and not a link', async () => {
    load.mockResolvedValue(loaded());
    renderBoundary(await resolveContent());
    const crumbs = screen.getByRole('navigation', { name: /./ });
    expect(within(crumbs).getByRole('link', { name: 'Каталог' })).toHaveAttribute(
      'href',
      '/catalog',
    );
    expect(within(crumbs).getByText('Рубашки')).toHaveAttribute('aria-current', 'page');
    expect(within(crumbs).queryByRole('link', { name: 'Рубашки' })).not.toBeInTheDocument();
    expect(within(crumbs).queryByText('Рубашка Design collection')).not.toBeInTheDocument();
  });

  it('shows the brand as the heading and the name under it', async () => {
    load.mockResolvedValue(loaded());
    renderBoundary(await resolveContent());
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Annen$/);
    expect(screen.getByText('Рубашка Design collection')).toBeInTheDocument();
  });

  it('shows the product’s photos in the gallery', async () => {
    const photo = {
      id: ID,
      url: 'https://lamoda.test/media/p1.webp',
      sortOrder: 0,
    };
    load.mockResolvedValue(loaded({ ...product, images: [photo] }));
    renderBoundary(await resolveContent());
    expect(screen.getByRole('list', { name: 'Фото товара' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Annen Рубашка Design collection' })).toHaveAttribute(
      'src',
      photo.url,
    );
  });

  it('shows the buy box with «Примерить» that asks a signed-out visitor to sign in', async () => {
    load.mockResolvedValue(loaded());
    renderBoundary(await resolveContent());
    expect(screen.getByRole('button', { name: 'Добавить в корзину' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Примерить' })).toBeInTheDocument();
  });

  it('shows «К образу» when the category has a slot and not when it has none (A18)', async () => {
    load.mockResolvedValue(loaded(product, 'top'));
    const view = renderBoundary(await resolveContent());
    expect(screen.getByRole('button', { name: 'К образу' })).toBeEnabled();
    view.unmount();

    load.mockResolvedValue(loaded(product, null));
    renderBoundary(await resolveContent());
    expect(screen.queryByRole('button', { name: 'К образу' })).not.toBeInTheDocument();
  });

  it('shows «О товаре» with the description and the article (AC21)', async () => {
    load.mockResolvedValue(loaded());
    renderBoundary(await resolveContent());
    const about = screen.getByRole('region', { name: 'О товаре' });
    expect(within(about).getByText('Лёгкая рубашка.')).toBeInTheDocument();
    expect(within(about).getByText('A-1')).toBeInTheDocument();
  });

  it('shows «С этим товаром выбирают» with the six related products (AC21)', async () => {
    load.mockResolvedValue(loaded());
    const items = Array.from({ length: 6 }, (_, n) => ({
      ...product,
      id: `7c9e6679-7425-40de-944b-e07fc1f9${String(n + 1).padStart(4, '0')}`,
      name: `Платье ${n + 1}`,
    }));
    related.read.mockResolvedValue(items);
    renderBoundary(await resolveContent());
    const section = screen.getByRole('region', { name: 'С этим товаром выбирают' });
    expect(within(section).getAllByRole('article')).toHaveLength(6);
    expect(within(section).getByRole('link', { name: /Платье 1/ })).toHaveAttribute(
      'href',
      `/products/${items[0]?.id}`,
    );
  });

  it('hides «С этим товаром выбирают» when there are no related products', async () => {
    load.mockResolvedValue(loaded());
    renderBoundary(await resolveContent());
    expect(screen.queryByText('С этим товаром выбирают')).not.toBeInTheDocument();
  });

  it('renders the structured data with the request nonce', async () => {
    load.mockResolvedValue(loaded());
    const { container } = renderBoundary(await resolveContent());
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).toHaveAttribute('nonce', 'n0nce');
    const data = JSON.parse(script?.textContent ?? '') as {
      '@graph': { '@type': string; itemListElement?: { name: string; item: string }[] }[];
    };
    expect(data['@graph'].map((node) => node['@type'])).toEqual(['Product', 'BreadcrumbList']);
    expect(data['@graph'][1]?.itemListElement).toEqual([
      expect.objectContaining({ name: 'Каталог', item: 'https://site.test/catalog' }),
      expect.objectContaining({ name: 'Рубашки', item: 'https://site.test/catalog/shirts' }),
      expect.objectContaining({
        name: 'Рубашка Design collection',
        item: `https://site.test/products/${ID}`,
      }),
    ]);
  });

  it('encodes the category slug in the crumb and in the structured data', async () => {
    load.mockResolvedValue(loaded({ ...product, category: { ...product.category, slug: 'a b' } }));
    const { container } = renderBoundary(await resolveContent());
    expect(container.textContent).toContain('https://site.test/catalog/a%20b');
  });

  it('hands the product to the browser under its key and the related products too', async () => {
    load.mockResolvedValue(loaded());
    const items = [{ ...product, id: '7c9e6679-7425-40de-944b-e07fc1f90ae7' }];
    related.read.mockResolvedValue(items);
    const state = stateOf(await resolveContent());
    expect(related.read).toHaveBeenCalledOnce();
    const keys = state.queries.map((query) => JSON.stringify(query.queryKey));
    expect(keys).toContain(JSON.stringify(detailKey));
    expect(keys).toContain(JSON.stringify(relatedKey));
    expect(
      state.queries.find((q) => JSON.stringify(q.queryKey) === JSON.stringify(detailKey))?.state
        .data,
    ).toEqual(product);
    expect(
      state.queries.find((q) => JSON.stringify(q.queryKey) === JSON.stringify(relatedKey))?.state
        .data,
    ).toEqual(items);
  });

  it('reports a failed related read, drops it from the state and still shows the page', async () => {
    load.mockResolvedValue(loaded());
    const failure = new ApiError('m', { kind: 'http', template: '/t', status: 500 });
    related.read.mockRejectedValue(failure);
    const boundary = await resolveContent();
    expect(reportFailure).toHaveBeenCalledWith(failure);
    const keys = stateOf(boundary).queries.map((query) => JSON.stringify(query.queryKey));
    expect(keys).toContain(JSON.stringify(detailKey));
    expect(keys).not.toContain(JSON.stringify(relatedKey));
    renderBoundary(boundary);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Annen');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not report when everything loaded', async () => {
    load.mockResolvedValue(loaded());
    await resolveContent();
    expect(reportFailure).not.toHaveBeenCalled();
    expect(notFound).not.toHaveBeenCalled();
  });

  describe('when the product is missing or its category inactive (AC21)', () => {
    it('calls notFound', async () => {
      load.mockResolvedValue(null);
      await expect(resolveContent()).rejects.toThrow('NEXT_NOT_FOUND');
      expect(notFound).toHaveBeenCalledOnce();
    });

    it('reads nothing more and reports nothing', async () => {
      load.mockResolvedValue(null);
      await resolveContent().catch(() => undefined);
      expect(related.read).not.toHaveBeenCalled();
      expect(reportFailure).not.toHaveBeenCalled();
    });
  });

  describe('when the load fails', () => {
    const failure = new ApiError('m', { kind: 'http', template: '/t', status: 503 });

    it('shows the error text as an alert, reports it, and is not a 404', async () => {
      load.mockRejectedValue(failure);
      render(await resolveContent());
      expect(screen.getByRole('alert')).toHaveTextContent(errorText(failure));
      expect(reportFailure).toHaveBeenCalledWith(failure);
      expect(notFound).not.toHaveBeenCalled();
      expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    });

    it('also shows text for a failure that is not an ApiError', async () => {
      const broken = new Error('boom');
      load.mockRejectedValue(broken);
      render(await resolveContent());
      expect(screen.getByRole('alert')).toHaveTextContent(errorText(broken));
      expect(reportFailure).toHaveBeenCalledWith(broken);
    });
  });
});
