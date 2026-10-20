import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { type ReactNode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ failure: undefined as Error | undefined }));

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: () => Promise.resolve() }));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/shared/config/server', () => ({
  getServerEnv: () => {
    if (env.failure) throw env.failure;
    return { API_URL: 'http://api:3000', PROXY_SECRET: '' };
  },
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
// The real `reportFailure`, watched: the page must hand every failure to it and leave the choice of
// what to send to Sentry to it.
vi.mock('@/shared/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/shared/api')>();
  return { ...original, reportFailure: vi.fn(original.reportFailure) };
});

import * as Sentry from '@sentry/nextjs';

import { ApiError, reportFailure, shouldRetry } from '@/shared/api';

const ERROR_TEXTS = {
  NOT_FOUND: 'Не найдено: возможно, запись удалили',
  INTERNAL_ERROR: 'Ошибка на сервере, попробуйте позже',
};

import { CatalogHandoff } from './catalog-handoff';

const BRAND = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const DATE = '2026-10-01T12:00:00.000Z';

const list = {
  items: [
    {
      id: BRAND,
      article: 'A-1',
      name: 'Handed dress',
      brand: { id: BRAND, name: 'Alpha' },
      category: { id: BRAND, name: 'Dresses', slug: 'dresses' },
      image: null,
      price: 5000,
      discount: 0,
      finalPrice: 5000,
      rating: null,
      createdAt: DATE,
    },
  ],
  total: 1,
  nextCursor: null,
};
const facets = {
  total: 1,
  discounted: 0,
  price: { min: 100, max: 9000 },
  categories: [],
  brands: [{ id: BRAND, name: 'Alpha', count: 1 }],
  sizes: [],
  attributes: [],
};

const captureException = vi.mocked(Sentry.captureException);
const fetchMock = vi.fn();

function answer(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function envelope(status: number, code: string): Response {
  return answer(status, { error: { code, message: 'x', details: [] } });
}

function route(products: () => Response, facetsAnswer: () => Response) {
  fetchMock.mockImplementation((input: unknown) =>
    Promise.resolve(String(input).includes('/products/facets') ? facetsAnswer() : products()),
  );
}

// The report limiter keeps one event per cause per minute for the life of the module: each test
// starts ten minutes after the one before, so it never depends on what ran earlier.
let clock = Date.now();

beforeEach(() => {
  fetchMock.mockReset();
  captureException.mockClear();
  vi.mocked(reportFailure).mockClear();
  env.failure = undefined;
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers({ toFake: ['Date'] });
  clock += 10 * 60_000;
  vi.setSystemTime(clock);
});

afterEach(() => {
  vi.useRealTimers();
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

async function renderHandoff() {
  const element = await CatalogHandoff();
  const view = render(element, { wrapper: Provider });
  await act(async () => {});
  return view;
}

describe('CatalogHandoff', () => {
  it('hands the products and brands to the browser with no request from it', async () => {
    route(
      () => answer(200, list),
      () => answer(200, facets),
    );
    await renderHandoff();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.every((url) => url.startsWith('http://api:3000/'))).toBe(true);
    expect(screen.getByText(/Handed dress/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Alpha/ })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('shows a failed products prefetch, leaves the rest, and the browser asks again', async () => {
    route(
      () => envelope(404, 'NOT_FOUND'),
      () => answer(200, facets),
    );
    await renderHandoff();

    // The browser's own request for the products fails the same way and adds its own alert.
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent(
      `На сервере (products): ${ERROR_TEXTS.NOT_FOUND}`,
    );
    expect(screen.getByRole('checkbox', { name: /Alpha/ })).toBeInTheDocument();
    expect(captureException).not.toHaveBeenCalled();

    const browserCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.startsWith(globalThis.location.origin));
    expect(browserCalls).toHaveLength(1);
    expect(new URL(browserCalls[0] ?? '').pathname).toBe('/api/products');
  });

  it('shows a failed facets prefetch', async () => {
    route(
      () => answer(200, list),
      () => envelope(404, 'NOT_FOUND'),
    );
    await renderHandoff();

    // The browser's own request for the facets fails the same way and may add its own alert.
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent(
      `На сервере (facets): ${ERROR_TEXTS.NOT_FOUND}`,
    );
    expect(screen.getByText(/Handed dress/)).toBeInTheDocument();
  });

  it('reports an api failure once, from the api layer, not again from the page', async () => {
    route(
      () => envelope(500, 'INTERNAL_ERROR'),
      () => envelope(500, 'INTERNAL_ERROR'),
    );
    const element = await CatalogHandoff();

    // Server part only: one event for each route, sent by the api layer.
    expect(captureException).toHaveBeenCalledTimes(2);
    for (const call of captureException.mock.calls) expect(call[0]).toBeInstanceOf(ApiError);
    // The page still hands both failures to `reportFailure`, which leaves an ApiError alone.
    expect(reportFailure).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(reportFailure).mock.calls) {
      expect(call[0]).toBeInstanceOf(ApiError);
    }

    render(element, { wrapper: Provider });
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent(ERROR_TEXTS.INTERNAL_ERROR);
  });

  it('reports a failure that is not an api failure', async () => {
    route(
      () => answer(200, list),
      () => answer(200, facets),
    );
    env.failure = new Error('env refused');
    await renderHandoff();

    expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Что-то пошло не так');
    expect(captureException).toHaveBeenCalled();
    expect(captureException.mock.calls[0]?.[0]).toBe(env.failure);
  });
});
