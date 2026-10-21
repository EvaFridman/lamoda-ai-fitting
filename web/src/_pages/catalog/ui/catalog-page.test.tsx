import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { isValidElement, type ReactElement, Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/shared/config/server', () => ({
  getServerEnv: () => ({ API_URL: 'http://api:3000', PROXY_SECRET: '' }),
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/entities/category/server', () => ({ getCategoryBySlug: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
  useRouter: () => routerMock,
}));
vi.mock('@/shared/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/shared/api')>();
  return { ...original, reportFailure: vi.fn() };
});

import { notFound, permanentRedirect, redirect } from 'next/navigation';

import { createBrowserQueryClient } from '@/_app/providers';
import { getCategoryBySlug } from '@/entities/category/server';
import { ApiError, errorText, reportFailure } from '@/shared/api';

import { CatalogBrowser, type CatalogBrowserProps } from './catalog-browser';
import { CatalogPage, CategoryPage } from './catalog-page';

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
  const suspense = childrenOf(page).at(-1) as ReactElement;
  const content = childrenOf(suspense)[0] as ReactElement;
  return (content.type as Server)(content.props);
}

// The heading CategoryContent puts ahead of the products.
function headingOf(fragment: ReactElement): ReactElement {
  return childrenOf(fragment)[0] as ReactElement;
}

// CategoryContent returns a fragment: the heading, then a Suspense holding the products.
function productsSuspenseOf(fragment: ReactElement): ReactElement {
  return childrenOf(fragment)[1] as ReactElement;
}

async function resolveProducts(fragment: ReactElement): Promise<ReactElement> {
  const products = childrenOf(productsSuspenseOf(fragment))[0] as ReactElement;
  return (products.type as Server)(products.props);
}

function stubApi(body: unknown = { items: [product], total: 1, nextCursor: null }, status = 200) {
  fetchMock.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  );
}

function requested(call = 0): URL {
  return new URL(String(fetchMock.mock.calls[call]?.[0]));
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
  it('shows the catalog heading', () => {
    render(<CatalogPage searchParams={noSearch} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Каталог' })).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
      const element = (await (content.type as Server)(
        content.props,
      )) as ReactElement<CatalogBrowserProps>;
      fetchMock.mockReset();
      return element;
    }

    it('reports it and hands the text to the browser list, with no hydration', async () => {
      const element = await failOnServer();
      const error = vi.mocked(reportFailure).mock.calls[0]?.[0];
      expect(error).toBeInstanceOf(ApiError);
      expect(element.type).toBe(CatalogBrowser);
      expect(element.props.failureText).toBe(errorText(error));
    });

    it('shows the text first, then the cards once the browser request answers', async () => {
      const element = await failOnServer();
      let answer: (response: Response) => void = () => {};
      fetchMock.mockImplementation(() => new Promise<Response>((resolve) => (answer = resolve)));
      render(
        <QueryClientProvider client={createBrowserQueryClient()}>{element}</QueryClientProvider>,
      );
      await act(async () => {});
      expect(screen.getByRole('alert')).toHaveTextContent(element.props.failureText ?? '');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        answer(new Response(JSON.stringify({ items: [product], total: 1, nextCursor: null })));
      });
      expect(await screen.findByRole('link', { name: /Летнее платье/ })).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('shows the browser error text and reports it when the browser request fails too', async () => {
      const element = await failOnServer();
      fetchMock.mockImplementation(() => Promise.resolve(new Response('{}', { status: 429 })));
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
      expect(fetchMock).toHaveBeenCalledTimes(1);
      fetchMock.mockClear();

      const client = createBrowserQueryClient();
      render(<QueryClientProvider client={client}>{boundary}</QueryClientProvider>);
      await act(async () => {});
      const link = screen.getByRole('link', { name: /Летнее платье/ });
      expect(link).toHaveAttribute('href', `/products/${ID2}`);
      expect(fetchMock).not.toHaveBeenCalled();
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
  it('shows the name of an active category', async () => {
    get.mockResolvedValue(category);
    render(headingOf(await resolveContent(CategoryPage({ params, searchParams: noSearch }))));
    expect(get).toHaveBeenCalledWith('dresses');
    expect(screen.getByRole('heading', { level: 1, name: 'Платья' })).toBeInTheDocument();
  });

  it('puts the heading outside the Suspense that holds the products', async () => {
    get.mockResolvedValue(category);
    const fragment = await resolveContent(CategoryPage({ params, searchParams: noSearch }));
    const [heading, suspense] = childrenOf(fragment);
    expect(heading?.type).toBe('h1');
    expect(suspense?.type).toBe(Suspense);
    expect(childrenOf(suspense as ReactElement)).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks the api for the category own products, with the address filters', async () => {
    get.mockResolvedValue(category);
    const search = Promise.resolve({ hasDiscount: 'true', categoryId: ID2 });
    const content = await resolveContent(CategoryPage({ params, searchParams: search }));
    await resolveProducts(content);
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    const element = (await resolveProducts(content)) as ReactElement<CatalogBrowserProps>;
    const error = vi.mocked(reportFailure).mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(ApiError);
    expect(element.type).toBe(CatalogBrowser);
    expect(element.props.failureText).toBe(errorText(error));
    expect(element.props.query.categoryId).toEqual([ID]);

    let answer: (response: Response) => void = () => {};
    fetchMock.mockReset();
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => (answer = resolve)));
    render(
      <QueryClientProvider client={createBrowserQueryClient()}>{element}</QueryClientProvider>,
    );
    await act(async () => {});
    expect(screen.getByRole('alert')).toHaveTextContent(errorText(error));
    expect(
      new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://localhost').searchParams.getAll(
        'categoryId',
      ),
    ).toEqual([ID]);
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
