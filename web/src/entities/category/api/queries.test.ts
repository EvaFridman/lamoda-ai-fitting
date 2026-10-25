import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/shared/config/server', () => ({
  getServerEnv: () => ({ API_URL: 'http://api:3000', PROXY_SECRET: '' }),
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import { ApiError } from '@/shared/api';

import * as browser from './queries';
import * as server from './server-queries';

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const DATE = '2026-10-01T12:00:00.000Z';
const category = {
  id: ID,
  name: 'Dresses',
  slug: 'dresses',
  isActive: true,
  description: null,
  sortOrder: 1,
  slot: 'top',
  createdAt: DATE,
  updatedAt: DATE,
};

const fetchMock = vi.fn();

function requested(): URL {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  return new URL(String(fetchMock.mock.calls[0]?.[0]));
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify({ items: [category], total: 1 }))),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('category browser options', () => {
  it.each([
    ['no input', undefined],
    ['empty', {}],
    ['page and filter', { limit: 5, offset: 10, isActive: true, junk: 1 } as object],
  ])('share the list key of the server for %s', (_name, input) => {
    expect(browser.categoryListOptions(input).queryKey).toEqual(
      server.categoryListOptions(input).queryKey,
    );
  });

  it('share the detail key of the server', () => {
    expect(browser.categoryOptions(ID).queryKey).toEqual(server.categoryOptions(ID).queryKey);
  });

  it('ask /api/categories on the site origin and return the validated page', async () => {
    const result = await new QueryClient().query(browser.categoryListOptions({ limit: 5 }));
    expect(result).toEqual({ items: [category], total: 1 });
    const url = requested();
    expect(url.origin).toBe(globalThis.location.origin);
    expect(url.pathname).toBe('/api/categories');
    expect(url.searchParams.get('limit')).toBe('5');
  });

  it('ask /api/categories/:id with the id in one segment', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify(category))));
    await expect(new QueryClient().query(browser.categoryOptions('a/b'))).resolves.toEqual(
      category,
    );
    expect(requested().pathname).toBe('/api/categories/a%2Fb');
  });

  it('reject a body that fails the schema', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ id: 1 }))));
    const error = await new QueryClient().query(browser.categoryOptions(ID)).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'schema' });
  });

  it('pass an abortable signal to fetch', async () => {
    const client = new QueryClient();
    const options = browser.categoryListOptions();
    await client.query(options);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('the active categories (the slots of the cards, spec 0019 A90.8)', () => {
  it('are one request of every active category, under the catalog’s own key', async () => {
    await new QueryClient().query(browser.categoryListOptions(browser.ACTIVE_CATEGORIES_QUERY));

    const url = requested();
    expect(url.searchParams.get('isActive')).toBe('true');
    expect(url.searchParams.get('limit')).toBe('100');
    expect(browser.categoryListOptions(browser.ACTIVE_CATEGORIES_QUERY).queryKey).toEqual(
      server.categoryListOptions({ isActive: true, limit: 100 }).queryKey,
    );
  });
});

describe('categorySlots', () => {
  const other = { ...category, id: '7c9e6679-7425-40de-944b-e07fc1f90ae7', slot: null };

  it('maps the id of each category that has a slot to it', () => {
    const shoes = {
      ...category,
      id: '9b2e3a4f-5c6d-4e7f-9081-2b3c4d5e6f70',
      slot: 'shoes' as const,
    };

    const slots = browser.categorySlots([{ ...category, slot: 'top' as const }, other, shoes]);

    expect([...slots]).toEqual([
      [ID, 'top'],
      [shoes.id, 'shoes'],
    ]);
  });

  it('leaves out a category with no slot', () => {
    expect(browser.categorySlots([other]).size).toBe(0);
  });

  it('is empty while the categories load', () => {
    expect(browser.categorySlots(undefined).size).toBe(0);
  });
});
