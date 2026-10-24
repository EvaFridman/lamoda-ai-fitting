import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, within } from '@testing-library/react';
import { isValidElement, type ReactElement, Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/shared/config/server', () => ({
  getServerEnv: () => ({
    API_URL: 'http://api:3000',
    PROXY_SECRET: '',
    SITE_URL: 'https://site.test',
  }),
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/entities/category/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/category/server')>()),
  getCategoryBySlug: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
  useRouter: () => routerMock,
  usePathname: () => '/catalog',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/shared/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/shared/api')>();
  return { ...original, reportFailure: vi.fn() };
});

import { notFound, permanentRedirect, redirect } from 'next/navigation';

import { createBrowserQueryClient } from '@/_app/providers';
import { getCategoryBySlug } from '@/entities/category/server';
import { ApiError, errorText, reportFailure } from '@/shared/api';
import { Breadcrumbs } from '@/shared/ui';

import { CatalogBrowser, type CatalogBrowserProps } from './catalog-browser';
import { CatalogJsonLd } from './catalog-json-ld';
import { CatalogPage, CategoryPage } from './catalog-page';
import { CatalogSkeleton, type CatalogSkeletonProps } from './catalog-skeleton';

const routerMock = { replace: vi.fn(), push: vi.fn() };
const get = vi.mocked(getCategoryBySlug);
const fetchMock = vi.fn();

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const ID2 = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const DATE = '2026-10-01T12:00:00.000Z';

const category = {
  id: ID,
  name: 'Платья',
  slug: 'dresses',
  isActive: true,
  description: null,
  sortOrder: 1,
  slot: null,
  createdAt: DATE,
  updatedAt: DATE,
};

const product = {
  id: ID2,
  article: 'A-1',
  name: 'Летнее платье',
  brand: { id: ID, name: 'Бренд' },
  category: { id: ID, name: 'Платья', slug: 'dresses' },
  image: null,
  price: 5000,
  discount: 0,
  finalPrice: 5000,
  rating: null,
  createdAt: DATE,
  updatedAt: DATE,
};

const params = Promise.resolve({ slug: 'dresses' });
const noSearch = Promise.resolve({});

type Server = (props: unknown) => Promise<ReactElement>;

function childrenOf(element: ReactElement): ReactElement[] {
  const children = (element.props as { children: ReactElement | ReactElement[] }).children;
  const list = Array.isArray(children) ? children : [children];
  expect(list.every((child) => isValidElement(child))).toBe(true);
  return list;
}

// The page's parts under its Suspense (its last child) are async server components, which a jsdom
// render cannot run: take each out of the tree and await it the way Next does.
async function resolveContent(page: ReactElement): Promise<ReactElement> {
  const suspense = childrenOf(page).find((child) => child.type === Suspense) as ReactElement;
  const content = childrenOf(suspense)[0] as ReactElement;
  return (content.type as Server)(content.props);
}

// The breadcrumbs CategoryContent puts ahead of the products (the copy for windows from 600px).
function breadcrumbsOf(fragment: ReactElement): ReactElement {
  return childrenOf(fragment)[0] as ReactElement;
}

// The copy under the products (the one for phones).
function bottomBreadcrumbsOf(fragment: ReactElement): ReactElement {
  return childrenOf(fragment)[2] as ReactElement;
}

interface CrumbsProps {
  items: { label: string; href?: string }[];
  className?: string;
}

// What the visitor sees before the products: the breadcrumbs and the Suspense's fallback.
function shellOf(fragment: ReactElement): ReactElement {
  return (
    <>
      {breadcrumbsOf(fragment)}
      {(productsSuspenseOf(fragment).props as { fallback: ReactElement }).fallback}
    </>
  );
}

// CategoryContent returns a fragment: the breadcrumbs, then a Suspense holding the products.
function productsSuspenseOf(fragment: ReactElement): ReactElement {
  return childrenOf(fragment)[1] as ReactElement;
}

async function resolveProducts(fragment: ReactElement): Promise<ReactElement> {
  const products = childrenOf(productsSuspenseOf(fragment))[0] as ReactElement;
  return (products.type as Server)(products.props);
}

const facets = {
  total: 1,
  discounted: 0,
  price: null,
  categories: [],
  brands: [],
  sizes: [],
  attributes: [],
};

const refusedCursor = {
  error: {
    code: 'VALIDATION_FAILED',
    message: 'm',
    details: [{ field: 'cursor', code: 'INVALID_CURSOR', message: 'x' }],
  },
};

function pathOf(input: unknown): string {
  return new URL(String(input), 'http://localhost').pathname;
}

// The filter counts and the category list always answer, whatever the batches do.
function side(input: unknown): Response | undefined {
  const path = pathOf(input);
  if (path.endsWith('/products/facets')) return new Response(JSON.stringify(facets));
  if (path.endsWith('/categories')) {
    return new Response(JSON.stringify({ items: [category], total: 1 }));
  }
  return undefined;
}

// The batches answer `body` with `status`.
function stubApi(body: unknown = { items: [product], total: 1, nextCursor: null }, status = 200) {
  fetchMock.mockImplementation((input: unknown) =>
    Promise.resolve(side(input) ?? new Response(JSON.stringify(body), { status })),
  );
}

function batchUrls(): URL[] {
  return fetchMock.mock.calls
    .filter(([input]) => side(input) === undefined)
    .map(([input]) => new URL(String(input), 'http://localhost'));
}

function requested(call = 0): URL {
  return batchUrls()[call] as URL;
}

// The page's element is a HydrationBoundary around the browser list.
function browserOf(boundary: ReactElement): ReactElement<CatalogBrowserProps> {
  return childrenOf(boundary).find(
    (child) => child.type === CatalogBrowser,
  ) as ReactElement<CatalogBrowserProps>;
}

// The structured data's script, rendered to its JSON.
function jsonLdOf(boundary: ReactElement): { '@graph': { '@type': string }[] } {
  const element = childrenOf(boundary).find((child) => child.type === CatalogJsonLd);
  const { container } = render(element as ReactElement);
  const script = container.querySelector('script[type="application/ld+json"]');
  return JSON.parse(script?.textContent ?? '') as { '@graph': { '@type': string }[] };
}

beforeEach(() => {
  get.mockReset();
  fetchMock.mockReset();
  routerMock.replace.mockClear();
  routerMock.push.mockClear();
  vi.mocked(notFound).mockClear();
  vi.mocked(redirect).mockClear();
  vi.mocked(permanentRedirect).mockClear();
  vi.mocked(reportFailure).mockClear();
  stubApi();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CatalogPage', () => {
  it('shows the catalog heading without a count and the breadcrumbs before the products', () => {
    render(<CatalogPage searchParams={noSearch} />);
    const heading = screen.getByRole('heading', { level: 1, name: 'Каталог' });
    expect(heading).toHaveTextContent(/^Каталог$/);
    // One copy above the title and one under the list; CSS shows one per width.
    const copies = screen.getAllByRole('navigation', { name: /./ });
    expect(copies).toHaveLength(2);
    for (const crumbs of copies) {
      expect(within(crumbs).getByText('Каталог')).toHaveAttribute('aria-current', 'page');
      expect(within(crumbs).queryByRole('link')).not.toBeInTheDocument();
    }
    expect(get).not.toHaveBeenCalled();
  });

  it('keeps the breadcrumbs outside the Suspense of the products, once above it and once under it', () => {
    const [top, suspense, bottom] = childrenOf(CatalogPage({ searchParams: noSearch }));
    expect(top?.type).toBe(Breadcrumbs);
    expect(suspense?.type).toBe(Suspense);
    expect(bottom?.type).toBe(Breadcrumbs);
    const fallback = (suspense?.props as { fallback: ReactElement<CatalogSkeletonProps> }).fallback;
    expect(fallback.type).toBe(CatalogSkeleton);
    expect(fallback.props.title).toBe('Каталог');
  });

  it('gives the two copies the same items and the classes that hide one per width', () => {
    const [top, , bottom] = childrenOf(CatalogPage({ searchParams: noSearch }));
    const topProps = top?.props as CrumbsProps;
    const bottomProps = bottom?.props as CrumbsProps;
    expect(topProps.items).toEqual([{ label: 'Каталог' }]);
    expect(bottomProps.items).toEqual(topProps.items);
    expect(topProps.className).toBe('crumbsTop');
    expect(bottomProps.className).toBe('crumbsBottom');
  });

  it('puts the breadcrumbs list into the structured data once, not once per copy', async () => {
    const page = CatalogPage({ searchParams: noSearch });
    const content = await resolveContent(page);
    const data = jsonLdOf(await (content.type as Server)(content.props));
    expect(data['@graph'].filter((node) => node['@type'] === 'BreadcrumbList')).toHaveLength(1);
  });

  it('hands the page title to the browser list', async () => {
    const content = await resolveContent(CatalogPage({ searchParams: noSearch }));
    const element = browserOf(await (content.type as Server)(content.props));
    expect(element.props.title).toBe('Каталог');
  });

  it('describes the catalog, its products, the site and the organization as structured data', async () => {
    const content = await resolveContent(CatalogPage({ searchParams: noSearch }));
    const data = jsonLdOf(await (content.type as Server)(content.props));
    expect(data['@graph'].map((node) => node['@type'])).toEqual([
      'BreadcrumbList',
      'ItemList',
      'WebSite',
      'Organization',
    ]);
  });

  it('describes no product when the batch failed', async () => {
    stubApi({}, 500);
    const content = await resolveContent(CatalogPage({ searchParams: noSearch }));
    const data = jsonLdOf(await (content.type as Server)(content.props));
    expect(data['@graph'].map((node) => node['@type'])).toEqual([
      'BreadcrumbList',
      'WebSite',
      'Organization',
    ]);
  });

  it('asks the api for the active categories for the list on the left', async () => {
    const content = await resolveContent(CatalogPage({ searchParams: noSearch }));
    await (content.type as Server)(content.props);
    const request = fetchMock.mock.calls
      .map(([input]) => new URL(String(input), 'http://localhost'))
      .find((url) => url.pathname.endsWith('/categories'));
    expect(request?.searchParams.get('isActive')).toBe('true');
    expect(request?.searchParams.get('limit')).toBe('100');
  });

  it('reports a failed category list and still serves the products', async () => {
    fetchMock.mockImplementation((input: unknown) =>
      Promise.resolve(
        pathOf(input).endsWith('/categories')
          ? new Response('{}', { status: 500 })
          : (side(input) ??
              new Response(JSON.stringify({ items: [product], total: 1, nextCursor: null }))),
      ),
    );
    const content = await resolveContent(CatalogPage({ searchParams: noSearch }));
    const boundary = await (content.type as Server)(content.props);
    expect(vi.mocked(reportFailure).mock.calls[0]?.[0]).toBeInstanceOf(ApiError);
    expect(browserOf(boundary).props.failureText).toBeUndefined();
  });

  it('ignores the params Next passes to /catalog too', () => {
    const props = { params: Promise.resolve({}), searchParams: noSearch };
    render((CatalogPage as (props: unknown) => ReactElement)(props));
    expect(screen.getByRole('heading', { level: 1, name: 'Каталог' })).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
    expect(notFound).not.toHaveBeenCalled();
  });

  it('asks the api for the first batch of the address, with no cursor', async () => {
    const content = await resolveContent(
      CatalogPage({ searchParams: Promise.resolve({ q: ' платье ', sort: 'price_asc' }) }),
    );
    expect(isValidElement(content)).toBe(true);
    await (content.type as Server)(content.props);
    expect(batchUrls()).toHaveLength(1);
    const url = requested();
    expect(url.pathname).toBe('/products');
    expect(url.searchParams.get('q')).toBe('платье');
    expect(url.searchParams.get('sort')).toBe('price_asc');
    expect(url.searchParams.has('cursor')).toBe(false);
    expect(url.searchParams.has('offset')).toBe(false);
    expect(url.searchParams.has('categoryId')).toBe(false);
  });

  describe('when the server batch fails (O74)', () => {
    async function failOnServer(): Promise<ReactElement<CatalogBrowserProps>> {
      stubApi({}, 500);
      const content = await resolveContent(CatalogPage({ searchParams: noSearch }));
      const element = browserOf(await (content.type as Server)(content.props));
      fetchMock.mockReset();
      return element;
    }

    it('reports it and hands the text to the browser list, with no batch hydrated', async () => {
      stubApi({}, 500);
      const content = await resolveContent(CatalogPage({ searchParams: noSearch }));
      const boundary = await (content.type as Server)(content.props);
      const error = vi.mocked(reportFailure).mock.calls[0]?.[0];
      expect(error).toBeInstanceOf(ApiError);
      const element = browserOf(boundary);
      expect(element.type).toBe(CatalogBrowser);
      const dehydrated = (boundary.props as { state: { queries: { queryKey: unknown[] }[] } })
        .state;
      expect(dehydrated.queries.some((query) => query.queryKey[1] === 'infinite')).toBe(false);
      expect(element.props.failureText).toBe(errorText(error));
    });

    it('shows the text first, then the cards once the browser request answers', async () => {
      const element = await failOnServer();
      let answer: (response: Response) => void = () => {};
      fetchMock.mockImplementation((input: unknown) => {
        const other = side(input);
        return other
          ? Promise.resolve(other)
          : new Promise<Response>((resolve) => (answer = resolve));
      });
      render(
        <QueryClientProvider client={createBrowserQueryClient()}>{element}</QueryClientProvider>,
      );
      await act(async () => {});
      expect(screen.getByRole('alert')).toHaveTextContent(element.props.failureText ?? '');
      expect(batchUrls()).toHaveLength(1);

      await act(async () => {
        answer(new Response(JSON.stringify({ items: [product], total: 1, nextCursor: null })));
      });
      expect(await screen.findByRole('link', { name: /Летнее платье/ })).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('shows the browser error text and reports it when the browser request fails too', async () => {
      const element = await failOnServer();
      stubApi({}, 429);
      render(
        <QueryClientProvider client={createBrowserQueryClient()}>{element}</QueryClientProvider>,
      );
      const clientError = new ApiError('m', { kind: 'http', template: '/t', status: 429 });
      expect(errorText(clientError)).not.toBe(element.props.failureText);
      expect(await screen.findByText(errorText(clientError))).toHaveAttribute('role', 'alert');
      await vi.waitFor(() => expect(reportFailure).toHaveBeenCalledTimes(2));
      expect(vi.mocked(reportFailure).mock.calls[1]?.[0]).toBeInstanceOf(ApiError);
    });
  });

  describe('the first batch reaches the browser without a request (AC7)', () => {
    it('renders the cards from the server prefetch and calls fetch no more', async () => {
      const content = await resolveContent(CatalogPage({ searchParams: noSearch }));
      const boundary = await (content.type as Server)(content.props);
      expect(batchUrls()).toHaveLength(1);
      fetchMock.mockClear();

      const client = createBrowserQueryClient();
      render(<QueryClientProvider client={client}>{boundary}</QueryClientProvider>);
      await act(async () => {});
      const link = screen.getByRole('link', { name: /Летнее платье/ });
      expect(link).toHaveAttribute('href', `/products/${ID2}`);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('?cursor= (O29, O72)', () => {
    const withCursor = Promise.resolve({ q: 'платье', cursor: 'c-1' });

    async function serve(search: Promise<Record<string, string>> = withCursor) {
      const content = await resolveContent(CatalogPage({ searchParams: search }));
      return browserOf(await (content.type as Server)(content.props));
    }

    it('starts the first batch from the cursor and hands it to the browser list', async () => {
      const element = await serve();
      expect(batchUrls()).toHaveLength(1);
      expect(requested().searchParams.get('cursor')).toBe('c-1');
      expect(requested().searchParams.get('q')).toBe('платье');
      expect(element.props.start).toBe('c-1');
      expect(element.props.failureText).toBeUndefined();
    });

    it('shows the cards of that batch with no browser request', async () => {
      const content = await resolveContent(CatalogPage({ searchParams: withCursor }));
      const boundary = await (content.type as Server)(content.props);
      fetchMock.mockClear();
      render(
        <QueryClientProvider client={createBrowserQueryClient()}>{boundary}</QueryClientProvider>,
      );
      await act(async () => {});
      expect(screen.getByRole('link', { name: /Летнее платье/ })).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('asks again for the first batch when the api refuses the cursor, without reporting it', async () => {
      fetchMock.mockImplementation((input: unknown) =>
        Promise.resolve(
          side(input) ??
            (new URL(String(input)).searchParams.has('cursor')
              ? new Response(JSON.stringify(refusedCursor), { status: 400 })
              : new Response(JSON.stringify({ items: [product], total: 1, nextCursor: null }))),
        ),
      );
      const element = await serve();
      expect(batchUrls()).toHaveLength(2);
      expect(requested(0).searchParams.get('cursor')).toBe('c-1');
      expect(requested(1).searchParams.has('cursor')).toBe(false);
      expect(requested(1).searchParams.get('q')).toBe('платье');
      expect(element.props.start).toBeUndefined();
      expect(element.props.failureText).toBeUndefined();
      expect(reportFailure).not.toHaveBeenCalled();
    });

    it('does not retry a 400 that is not about the cursor', async () => {
      stubApi({ error: { ...refusedCursor.error, details: [] } }, 400);
      const element = await serve();
      expect(batchUrls()).toHaveLength(1);
      expect(element.props.start).toBe('c-1');
      expect(element.props.failureText).toBeDefined();
      expect(reportFailure).toHaveBeenCalledTimes(1);
    });

    it('does not retry a failure of the server', async () => {
      stubApi({}, 500);
      const element = await serve();
      expect(batchUrls()).toHaveLength(1);
      expect(element.props.failureText).toBeDefined();
    });

    it('hands each address its own cursor as the start, and does not key the browser', async () => {
      const first = await serve();
      expect(first.props.start).toBe('c-1');
      expect(first.key).toBeNull();
      const second = await serve(Promise.resolve({ cursor: 'c-2' }));
      expect(second.props.start).toBe('c-2');
      expect(second.key).toBeNull();
    });

    it('hands no start to the browser without a cursor', async () => {
      const element = await serve(noSearch);
      expect(element.props.start).toBeUndefined();
      expect(element.key).toBeNull();
    });

    it('hands no start to the browser after a refused cursor falls back', async () => {
      fetchMock.mockImplementation((input: unknown) =>
        Promise.resolve(
          side(input) ??
            (new URL(String(input)).searchParams.has('cursor')
              ? new Response(JSON.stringify(refusedCursor), { status: 400 })
              : new Response(JSON.stringify({ items: [product], total: 1, nextCursor: null }))),
        ),
      );
      const element = await serve();
      expect(element.props.start).toBeUndefined();
      expect(element.key).toBeNull();
    });

    it('does not retry a refused first batch when there is no cursor', async () => {
      stubApi(refusedCursor, 400);
      await serve(noSearch);
      expect(batchUrls()).toHaveLength(1);
    });
  });

  describe('a failed sign-in (0013 N54)', () => {
    it('keeps only the filters in the request and does not rewrite the address', async () => {
      const search = Promise.resolve({
        brandId: ID,
        error: 'access_denied',
        error_description: 'x',
      });
      const content = await resolveContent(CatalogPage({ searchParams: search }));
      const boundary = await (content.type as Server)(content.props);
      const url = requested();
      expect([...url.searchParams.keys()].sort()).toEqual(['brandId']);
      expect(url.searchParams.get('brandId')).toBe(ID);

      const client = createBrowserQueryClient();
      render(<QueryClientProvider client={client}>{boundary}</QueryClientProvider>);
      await act(async () => {});
      expect(redirect).not.toHaveBeenCalled();
      expect(permanentRedirect).not.toHaveBeenCalled();
      expect(routerMock.replace).not.toHaveBeenCalled();
      expect(routerMock.push).not.toHaveBeenCalled();
    });
  });
});

describe('CategoryPage', () => {
  it('shows the name of an active category as the heading without a count, and its breadcrumbs', async () => {
    get.mockResolvedValue(category);
    render(shellOf(await resolveContent(CategoryPage({ params, searchParams: noSearch }))));
    expect(get).toHaveBeenCalledWith('dresses');
    const heading = screen.getByRole('heading', { level: 1, name: 'Платья' });
    expect(heading).toHaveTextContent(/^Платья$/);
    const crumbs = screen.getByRole('navigation', { name: /./ });
    expect(within(crumbs).getByRole('link', { name: 'Каталог' })).toHaveAttribute(
      'href',
      '/catalog',
    );
    expect(within(crumbs).getByText('Платья')).toHaveAttribute('aria-current', 'page');
  });

  it('puts the breadcrumbs outside the Suspense that holds the products, with the heading as its fallback', async () => {
    get.mockResolvedValue(category);
    const fragment = await resolveContent(CategoryPage({ params, searchParams: noSearch }));
    const [crumbs, suspense, bottom] = childrenOf(fragment);
    expect(crumbs?.type).toBe(Breadcrumbs);
    expect(suspense?.type).toBe(Suspense);
    expect(bottom?.type).toBe(Breadcrumbs);
    expect(childrenOf(suspense as ReactElement)).toHaveLength(1);
    const fallback = (suspense?.props as { fallback: ReactElement<CatalogSkeletonProps> }).fallback;
    expect(fallback.type).toBe(CatalogSkeleton);
    expect(fallback.props.title).toBe('Платья');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders the category breadcrumbs twice with the same items, above and under the products', async () => {
    get.mockResolvedValue(category);
    const fragment = await resolveContent(CategoryPage({ params, searchParams: noSearch }));
    const topProps = breadcrumbsOf(fragment).props as CrumbsProps;
    const bottomProps = bottomBreadcrumbsOf(fragment).props as CrumbsProps;
    expect(topProps.items).toEqual([{ label: 'Каталог', href: '/catalog' }, { label: 'Платья' }]);
    expect(bottomProps.items).toEqual(topProps.items);
    expect(topProps.className).toBe('crumbsTop');
    expect(bottomProps.className).toBe('crumbsBottom');

    render(bottomBreadcrumbsOf(fragment));
    const crumbs = screen.getByRole('navigation', { name: /./ });
    expect(within(crumbs).getByRole('link', { name: 'Каталог' })).toHaveAttribute(
      'href',
      '/catalog',
    );
  });

  it('puts the category trail into the structured data once', async () => {
    get.mockResolvedValue(category);
    const content = await resolveContent(CategoryPage({ params, searchParams: noSearch }));
    const data = jsonLdOf(await resolveProducts(content));
    expect(data['@graph'].filter((node) => node['@type'] === 'BreadcrumbList')).toHaveLength(1);
  });

  it('draws the whole page as placeholders, with no title, until the category is read', () => {
    const [suspense] = childrenOf(CategoryPage({ params, searchParams: noSearch }));
    expect(suspense?.type).toBe(Suspense);
    const fallback = (suspense?.props as { fallback: ReactElement<CatalogSkeletonProps> }).fallback;
    expect(fallback.type).toBe(CatalogSkeleton);
    expect(fallback.props.title).toBeUndefined();
  });

  it('hands the category name to the browser list as its title', async () => {
    get.mockResolvedValue(category);
    const content = await resolveContent(CategoryPage({ params, searchParams: noSearch }));
    expect(browserOf(await resolveProducts(content)).props.title).toBe('Платья');
  });

  it('describes the category trail and products, without the site and the organization', async () => {
    get.mockResolvedValue(category);
    const content = await resolveContent(CategoryPage({ params, searchParams: noSearch }));
    const data = jsonLdOf(await resolveProducts(content));
    expect(data['@graph'].map((node) => node['@type'])).toEqual(['BreadcrumbList', 'ItemList']);
    expect(data['@graph'][0]).toMatchObject({
      itemListElement: [
        { position: 1, item: 'https://site.test/catalog' },
        { position: 2, item: 'https://site.test/catalog/dresses' },
      ],
    });
  });

  it('asks the api for the category own products, with the address filters', async () => {
    get.mockResolvedValue(category);
    const search = Promise.resolve({ hasDiscount: 'true', categoryId: ID2 });
    const content = await resolveContent(CategoryPage({ params, searchParams: search }));
    await resolveProducts(content);
    expect(batchUrls()).toHaveLength(1);
    const url = requested();
    expect(url.searchParams.getAll('categoryId')).toEqual([ID]);
    expect(url.searchParams.get('hasDiscount')).toBe('true');
  });

  it('renders the category cards from the server batch with no browser request', async () => {
    get.mockResolvedValue(category);
    const content = await resolveContent(CategoryPage({ params, searchParams: noSearch }));
    const boundary = await resolveProducts(content);
    fetchMock.mockClear();
    render(
      <QueryClientProvider client={createBrowserQueryClient()}>{boundary}</QueryClientProvider>,
    );
    await act(async () => {});
    expect(screen.getByRole('link', { name: /Летнее платье/ })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a failed batch and hands its text to the browser list with the category query', async () => {
    get.mockResolvedValue(category);
    stubApi({}, 500);
    const content = await resolveContent(CategoryPage({ params, searchParams: noSearch }));
    const element = browserOf(await resolveProducts(content));
    const error = vi.mocked(reportFailure).mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(ApiError);
    expect(element.type).toBe(CatalogBrowser);
    expect(element.props.failureText).toBe(errorText(error));
    expect(element.props.categoryId).toBe(ID);
    expect('categoryId' in element.props.query).toBe(false);

    let answer: (response: Response) => void = () => {};
    fetchMock.mockReset();
    fetchMock.mockImplementation((input: unknown) => {
      const other = side(input);
      return other
        ? Promise.resolve(other)
        : new Promise<Response>((resolve) => (answer = resolve));
    });
    render(
      <QueryClientProvider client={createBrowserQueryClient()}>{element}</QueryClientProvider>,
    );
    await act(async () => {});
    expect(screen.getByRole('alert')).toHaveTextContent(errorText(error));
    expect(requested().searchParams.getAll('categoryId')).toEqual([ID]);
    await act(async () => {
      answer(new Response(JSON.stringify({ items: [product], total: 1, nextCursor: null })));
    });
    expect(await screen.findByRole('link', { name: /Летнее платье/ })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('calls notFound for a missing category', async () => {
    get.mockResolvedValue(null);
    await expect(resolveContent(CategoryPage({ params, searchParams: noSearch }))).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
    expect(notFound).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls notFound for an inactive category', async () => {
    get.mockResolvedValue({ ...category, isActive: false });
    await expect(resolveContent(CategoryPage({ params, searchParams: noSearch }))).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
    expect(notFound).toHaveBeenCalled();
  });

  it('shows the error text and reports the failure when the category read fails', async () => {
    const error = new ApiError('m', { kind: 'http', template: '/t', status: 500 });
    get.mockRejectedValue(error);
    render(await resolveContent(CategoryPage({ params, searchParams: noSearch })));
    expect(screen.getByRole('alert')).toHaveTextContent(errorText(error));
    expect(reportFailure).toHaveBeenCalledWith(error);
    expect(notFound).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
