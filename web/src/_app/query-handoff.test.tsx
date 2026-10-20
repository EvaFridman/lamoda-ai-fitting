import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { type ReactNode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/shared/config/server', () => ({
  getServerEnv: () => ({ API_URL: 'http://api:3000', PROXY_SECRET: '' }),
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import * as attributeServer from '@/entities/attribute/server';
import * as brandServer from '@/entities/brand/server';
import * as categoryServer from '@/entities/category/server';
import * as productServer from '@/entities/product/server';
import { useAttribute, useAttributes, useAttributeValues } from '@/entities/attribute';
import { useBrand, useBrands } from '@/entities/brand';
import { useCategories, useCategory } from '@/entities/category';
import {
  useProduct,
  useProductAttributeValues,
  useProductFacets,
  useProductImages,
  useProducts,
  useProductVariations,
} from '@/entities/product';
import { prefetch } from '@/shared/api/server';

import { createBrowserQueryClient } from './providers';

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const ID2 = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const DATE = '2026-10-01T12:00:00.000Z';

const listItem = {
  id: ID,
  article: 'A-1',
  name: 'Dress',
  brand: { id: ID2, name: 'Brand' },
  category: { id: ID2, name: 'Dresses', slug: 'dresses' },
  image: { url: 'https://cdn.example/a.jpg' },
  price: 5000,
  discount: 10,
  finalPrice: 4500,
  rating: null,
  createdAt: DATE,
};
const detail = {
  ...listItem,
  description: null,
  images: [{ id: ID, url: 'https://cdn.example/a.jpg', sortOrder: 0 }],
  variations: [{ id: ID, size: 'M', stock: 3 }],
  attributes: [{ attribute: { id: ID, name: 'Color' }, values: [{ id: ID2, value: 'Red' }] }],
};
const facets = {
  total: 10,
  discounted: 2,
  price: { min: 100, max: 9000 },
  categories: [{ id: ID, name: 'Dresses', count: 4 }],
  brands: [{ id: ID2, name: 'Brand', count: 4 }],
  sizes: [{ size: 'M', count: 3 }],
  attributes: [
    {
      id: ID,
      name: 'Color',
      values: [
        { id: ID2, value: 'Red', colorHex: '#FF0000', count: 1 },
        { id: ID, value: 'Striped', colorHex: null, count: 2 },
      ],
    },
  ],
};
const image = {
  id: ID,
  productId: ID2,
  imageKey: 'a.jpg',
  url: 'https://cdn.example/a.jpg',
  sortOrder: 0,
  createdAt: DATE,
  updatedAt: DATE,
};
const variation = { id: ID, productId: ID2, size: 'M', stock: 3, createdAt: DATE, updatedAt: DATE };
const productAttributeValue = {
  productId: ID,
  attributeValueId: ID2,
  attribute: { id: ID, name: 'Color' },
  value: { id: ID2, value: 'Red' },
  createdAt: DATE,
};
const category = {
  id: ID,
  name: 'Dresses',
  slug: 'dresses',
  isActive: true,
  description: null,
  sortOrder: 1,
  createdAt: DATE,
  updatedAt: DATE,
};
const brand = { id: ID, name: 'Brand', createdAt: DATE, updatedAt: DATE };
const attribute = { id: ID, name: 'Color', createdAt: DATE, updatedAt: DATE };
const attributeValue = {
  id: ID2,
  attributeId: ID,
  value: 'Red',
  colorHex: null,
  createdAt: DATE,
  updatedAt: DATE,
};

const page = (item: unknown) => ({ items: [item], total: 1 });

const LIST_QUERY = { q: 'dress', size: ['M'], sort: 'price_asc', limit: 12 } as const;

type Hook = () => { data: unknown; isPending: boolean };
type Case = readonly [
  name: string,
  run: (client: QueryClient) => Promise<unknown>,
  body: unknown,
  hook: Hook,
];

// Each case: the server prefetch of a slice's options (the call type-checks that `prefetch` accepts
// them), the body the api answers, and the browser hook of the same data. The options are built
// lazily, after the mocks are set up.
const cases: Case[] = [
  [
    'productListOptions',
    (c) => prefetch(c, productServer.productListOptions(LIST_QUERY)),
    { ...page(listItem), nextCursor: null },
    () => useProducts(LIST_QUERY),
  ],
  [
    'productFacetsOptions',
    (c) => prefetch(c, productServer.productFacetsOptions({ q: 'dress' })),
    facets,
    () => useProductFacets({ q: 'dress' }),
  ],
  [
    'productOptions',
    (c) => prefetch(c, productServer.productOptions(ID)),
    detail,
    () => useProduct(ID),
  ],
  [
    'productImageListOptions',
    (c) => prefetch(c, productServer.productImageListOptions(ID, { limit: 5 })),
    page(image),
    () => useProductImages(ID, { limit: 5 }),
  ],
  [
    'productVariationListOptions',
    (c) => prefetch(c, productServer.productVariationListOptions(ID)),
    page(variation),
    () => useProductVariations(ID),
  ],
  [
    'productAttributeValueListOptions',
    (c) => prefetch(c, productServer.productAttributeValueListOptions(ID)),
    page(productAttributeValue),
    () => useProductAttributeValues(ID),
  ],
  [
    'categoryListOptions',
    (c) => prefetch(c, categoryServer.categoryListOptions({ limit: 10 })),
    page(category),
    () => useCategories({ limit: 10 }),
  ],
  [
    'categoryOptions',
    (c) => prefetch(c, categoryServer.categoryOptions(ID)),
    category,
    () => useCategory(ID),
  ],
  [
    'brandListOptions',
    (c) => prefetch(c, brandServer.brandListOptions({ limit: 10 })),
    page(brand),
    () => useBrands({ limit: 10 }),
  ],
  ['brandOptions', (c) => prefetch(c, brandServer.brandOptions(ID)), brand, () => useBrand(ID)],
  [
    'attributeListOptions',
    (c) => prefetch(c, attributeServer.attributeListOptions()),
    page(attribute),
    () => useAttributes(),
  ],
  [
    'attributeOptions',
    (c) => prefetch(c, attributeServer.attributeOptions(ID)),
    attribute,
    () => useAttribute(ID),
  ],
  [
    'attributeValueListOptions',
    (c) => prefetch(c, attributeServer.attributeValueListOptions(ID)),
    page(attributeValue),
    () => useAttributeValues(ID),
  ],
];

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function Probe({ use }: { use: () => { data: unknown; isPending: boolean } }): ReactNode {
  const { data, isPending } = use();
  return <output>{isPending ? 'pending' : JSON.stringify(data)}</output>;
}

describe('server prefetch to browser hook handoff', () => {
  it.each(cases)(
    '%s: the hook has the data at first render, with no request',
    async (_name, run, body, hook) => {
      fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify(body))));
      const serverClient = new QueryClient();
      expect(await run(serverClient)).toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0]?.[0]).startsWith('http://api:3000/')).toBe(true);

      const state = JSON.parse(JSON.stringify(dehydrate(serverClient))) as ReturnType<
        typeof dehydrate
      >;
      expect(state.queries).toHaveLength(1);
      fetchMock.mockReset();

      const view = render(
        <HydrationBoundary state={state}>
          <Probe use={hook} />
        </HydrationBoundary>,
        {
          wrapper: ({ children }) => <Provider>{children}</Provider>,
        },
      );
      await act(async () => {});
      expect(view.container.textContent).toBe(JSON.stringify(body));
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('does not hand a failed prefetch over: the hook asks the api itself', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response('{}', { status: 503 })));
    const serverClient = new QueryClient();
    const error = await prefetch(serverClient, productServer.productOptions(ID));
    expect(error).toMatchObject({ kind: 'http', status: 503 });
    const state = dehydrate(serverClient);
    expect(state.queries).toHaveLength(0);

    fetchMock.mockReset();
    let answer: (response: Response) => void = () => {};
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => (answer = resolve)));
    const view = render(
      <HydrationBoundary state={state}>
        <Probe use={() => useProduct(ID)} />
      </HydrationBoundary>,
      { wrapper: ({ children }) => <Provider>{children}</Provider> },
    );
    await act(async () => {});
    expect(view.container.textContent).toBe('pending');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      answer(new Response(JSON.stringify(detail)));
    });
    await vi.waitFor(() => {
      expect(view.container.textContent).toBe(JSON.stringify(detail));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `${globalThis.location.origin}/api/products/${ID}`,
    );
  });
});

// A fresh browser client per render, as `Providers` makes it.
function Provider({ children }: { children: ReactNode }) {
  const [client] = useState(createBrowserQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
