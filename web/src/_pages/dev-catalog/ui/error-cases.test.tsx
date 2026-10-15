import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import { shouldRetry } from '@/shared/api';

import { UNKNOWN_PRODUCT_ID } from '../config/query';
import { ErrorCases } from './error-cases';

const ERROR_TEXTS = {
  NOT_FOUND: 'Не найдено: возможно, запись удалили',
  VALIDATION_FAILED: 'Некоторые данные указаны неверно',
  SERVICE_UNAVAILABLE: 'Сервис временно недоступен, попробуйте позже',
  TOO_MANY_REQUESTS: 'Слишком много запросов, подождите немного',
};

const fetchMock = vi.fn();

function envelope(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: { code, message: 'x', details: [] } }), { status });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// The app's retry rule with no waiting between attempts.
function Provider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: shouldRetry, retryDelay: 0 } } }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('ErrorCases', () => {
  it('requests nothing until a button is pressed', () => {
    render(<ErrorCases />, { wrapper: Provider });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('asks for the unknown product and shows the NOT_FOUND text, without a retry', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(envelope(404, 'NOT_FOUND')));
    const user = userEvent.setup();
    render(<ErrorCases />, { wrapper: Provider });
    await user.click(screen.getByRole('button', { name: 'Неизвестный товар (404)' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(ERROR_TEXTS.NOT_FOUND);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `${globalThis.location.origin}/api/products/${UNKNOWN_PRODUCT_ID}`,
    );
    expect(UNKNOWN_PRODUCT_ID).toBe('00000000-0000-4000-8000-000000000000');
  });

  it('asks for a price range the wrong way round and shows the VALIDATION_FAILED text', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(envelope(400, 'VALIDATION_FAILED')));
    const user = userEvent.setup();
    render(<ErrorCases />, { wrapper: Provider });
    await user.click(screen.getByRole('button', { name: 'Цена «от» выше «до» (400)' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(ERROR_TEXTS.VALIDATION_FAILED);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/api/products');
    expect(url.searchParams.get('minPrice')).toBe('5000');
    expect(url.searchParams.get('maxPrice')).toBe('1000');
  });

  it('retries a 503 twice, then shows its text', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(envelope(503, 'SERVICE_UNAVAILABLE')));
    const user = userEvent.setup();
    render(<ErrorCases />, { wrapper: Provider });
    await user.click(screen.getByRole('button', { name: 'Неизвестный товар (404)' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(ERROR_TEXTS.SERVICE_UNAVAILABLE);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry a 429 and shows the too-many-requests text', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(envelope(429, 'TOO_MANY_REQUESTS')));
    const user = userEvent.setup();
    render(<ErrorCases />, { wrapper: Provider });
    await user.click(screen.getByRole('button', { name: 'Цена «от» выше «до» (400)' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(ERROR_TEXTS.TOO_MANY_REQUESTS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
