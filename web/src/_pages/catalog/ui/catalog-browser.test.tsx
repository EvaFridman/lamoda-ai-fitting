import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const linkProps = vi.hoisted(() => vi.fn());

vi.mock('next/link', () => ({
  default: (props: { href: string; className?: string; children?: ReactNode }) => {
    linkProps(props);
    return (
      <a href={props.href} className={props.className}>
        {props.children}
      </a>
    );
  },
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/shared/api')>();
  return { ...original, reportFailure: vi.fn() };
});

import { createBrowserQueryClient } from '@/_app/providers';
import { ApiError, errorText, reportFailure } from '@/shared/api';

import { CatalogBrowser } from './catalog-browser';

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const ID2 = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const DATE = '2026-10-01T12:00:00.000Z';

function product(id: string, name: string) {
  return {
    id,
    article: 'A-1',
    name,
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

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.mocked(reportFailure).mockClear();
  linkProps.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderBrowser() {
  return render(
    <QueryClientProvider client={createBrowserQueryClient()}>
      <CatalogBrowser query={{ q: 'платье' }} />
    </QueryClientProvider>,
  );
}

describe('CatalogBrowser', () => {
  it('shows a card per product linking to its page', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            items: [product(ID, 'Первое платье'), product(ID2, 'Второе платье')],
            total: 2,
            nextCursor: null,
          }),
        ),
      ),
    );
    renderBrowser();
    expect(await screen.findByRole('link', { name: /Первое платье/ })).toHaveAttribute(
      'href',
      `/products/${ID}`,
    );
    expect(screen.getByRole('link', { name: /Второе платье/ })).toHaveAttribute(
      'href',
      `/products/${ID2}`,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(reportFailure).not.toHaveBeenCalled();
  });

  it('turns the cards link prefetch off (O75)', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ items: [product(ID, 'Первое платье')], total: 1, nextCursor: null }),
        ),
      ),
    );
    renderBrowser();
    await screen.findByRole('link', { name: /Первое платье/ });
    expect(linkProps).toHaveBeenCalledWith(expect.objectContaining({ prefetch: false }));
  });

  it('shows nothing before its first answer when the server gave no failure text', () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    renderBrowser();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows the server failure text until its own request answers', () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    render(
      <QueryClientProvider client={createBrowserQueryClient()}>
        <CatalogBrowser query={{}} failureText="Ошибка сервера" />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Ошибка сервера');
  });

  it('asks the api for the first batch of its query', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ items: [], total: 0, nextCursor: null }))),
    );
    renderBrowser();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/api/products');
    expect(url.searchParams.get('q')).toBe('платье');
    expect(url.searchParams.has('cursor')).toBe(false);
  });

  it('shows the error text and reports the failure when there is no data', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response('{}', { status: 500 })));
    renderBrowser();
    const alert = await screen.findByRole('alert');
    const error = new ApiError('m', { kind: 'http', template: '/t', status: 500 });
    expect(alert).toHaveTextContent(errorText(error));
    await vi.waitFor(() => expect(reportFailure).toHaveBeenCalled());
    expect(vi.mocked(reportFailure).mock.calls[0]?.[0]).toBeInstanceOf(ApiError);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
