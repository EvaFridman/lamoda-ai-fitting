// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/entities/category/server', () => ({ findCategoryById: vi.fn() }));
vi.mock('@/entities/product/server', () => ({ findProduct: vi.fn() }));

import { findCategoryById } from '@/entities/category/server';
import type { Category } from '@/entities/category';
import type { ProductDetail } from '@/entities/product';
import { findProduct } from '@/entities/product/server';

import { isProductPath, productProxy } from './product-proxy';

const findP = vi.mocked(findProduct);
const findC = vi.mocked(findCategoryById);

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const CATEGORY_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const product = { id: ID, category: { id: CATEGORY_ID } } as unknown as ProductDetail;
const category = { id: CATEGORY_ID, isActive: true } as unknown as Category;

function request(path: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest(`https://site.test${path}`, { headers });
}

function rewrittenTo(response: Response): string | null {
  return response.headers.get('x-middleware-rewrite');
}

function expectNotFound(response: Response): void {
  expect(new URL(rewrittenTo(response) ?? '').pathname).toBe('/_product-not-found');
}

function expectNext(response: Response): void {
  expect(response.headers.get('x-middleware-next')).toBe('1');
  expect(rewrittenTo(response)).toBeNull();
}

beforeEach(() => {
  findP.mockReset();
  findC.mockReset();
});

describe('isProductPath', () => {
  it.each(['/products/abc', `/products/${ID}`, '/products/%D0%B0'])('takes %s', (path) => {
    expect(isProductPath(path)).toBe(true);
  });

  it.each([
    '/products',
    '/products/',
    '/products/a/b',
    '/product/a',
    '/catalog/a',
    '/x/products/a',
  ])('refuses %s', (path) => {
    expect(isProductPath(path)).toBe(false);
  });
});

describe('productProxy', () => {
  it('lets a prefetch through without asking the api', async () => {
    const response = await productProxy(
      request(`/products/${ID}`, { 'next-router-prefetch': '1' }),
    );
    expectNext(response);
    expect(findP).not.toHaveBeenCalled();
    expect(findC).not.toHaveBeenCalled();
  });

  it('lets the product of an active category through', async () => {
    findP.mockResolvedValue(product);
    findC.mockResolvedValue(category);
    expectNext(await productProxy(request(`/products/${ID}`)));
  });

  it('asks for the decoded id and then for the product category, with the request headers', async () => {
    findP.mockResolvedValue(product);
    findC.mockResolvedValue(category);
    const incoming = request('/products/%D0%B0%D0%B1', { 'x-real-ip': '203.0.113.7' });
    await productProxy(incoming);
    expect(findP).toHaveBeenCalledWith('аб', incoming.headers);
    expect(findC).toHaveBeenCalledWith(CATEGORY_ID, incoming.headers);
  });

  it('rewrites an unknown product to the not-found path, without reading a category', async () => {
    findP.mockResolvedValue(null);
    expectNotFound(await productProxy(request('/products/none')));
    expect(findC).not.toHaveBeenCalled();
  });

  it('rewrites the product of a missing category', async () => {
    findP.mockResolvedValue(product);
    findC.mockResolvedValue(null);
    expectNotFound(await productProxy(request(`/products/${ID}`)));
  });

  it('rewrites the product of an inactive category', async () => {
    findP.mockResolvedValue(product);
    findC.mockResolvedValue({ ...category, isActive: false });
    expectNotFound(await productProxy(request(`/products/${ID}`)));
  });

  it('rewrites a malformed escape without asking the api', async () => {
    expectNotFound(await productProxy(request('/products/%E0%A4%A')));
    expect(findP).not.toHaveBeenCalled();
  });

  it('lets the request through when the product read fails', async () => {
    findP.mockRejectedValue(new Error('down'));
    expectNext(await productProxy(request(`/products/${ID}`)));
  });

  it('lets the request through when the category read fails', async () => {
    findP.mockResolvedValue(product);
    findC.mockRejectedValue(new Error('down'));
    expectNext(await productProxy(request(`/products/${ID}`)));
  });

  it('forwards no extra request headers when it gets none', async () => {
    findP.mockResolvedValue(product);
    findC.mockResolvedValue(category);
    const response = await productProxy(request(`/products/${ID}`));
    expect(response.headers.get('x-middleware-override-headers')).toBeNull();
  });
});

describe('productProxy with request headers', () => {
  const forwarded = new Headers({
    'x-nonce': 'n1',
    'content-security-policy': "default-src 'self'",
  });

  function expectForwarded(response: Response): void {
    expect(response.headers.get('x-middleware-request-x-nonce')).toBe('n1');
    expect(response.headers.get('x-middleware-request-content-security-policy')).toBe(
      "default-src 'self'",
    );
  }

  it('forwards them on a prefetch', async () => {
    const response = await productProxy(
      request(`/products/${ID}`, { 'next-router-prefetch': '1' }),
      forwarded,
    );
    expectNext(response);
    expectForwarded(response);
  });

  it('forwards them for an active product', async () => {
    findP.mockResolvedValue(product);
    findC.mockResolvedValue(category);
    const response = await productProxy(request(`/products/${ID}`), forwarded);
    expectNext(response);
    expectForwarded(response);
  });

  it.each([
    ['unknown product', () => findP.mockResolvedValue(null)],
    [
      'inactive category',
      () => {
        findP.mockResolvedValue(product);
        findC.mockResolvedValue({ ...category, isActive: false });
      },
    ],
    [
      'missing category',
      () => {
        findP.mockResolvedValue(product);
        findC.mockResolvedValue(null);
      },
    ],
  ])('forwards them on the rewrite of an %s', async (_name, arrange) => {
    arrange();
    const response = await productProxy(request(`/products/${ID}`), forwarded);
    expectNotFound(response);
    expectForwarded(response);
  });

  it('forwards them on the rewrite of a malformed escape', async () => {
    const response = await productProxy(request('/products/%E0%A4%A'), forwarded);
    expectNotFound(response);
    expectForwarded(response);
  });

  it('forwards them when the api fails', async () => {
    findP.mockRejectedValue(new Error('down'));
    const response = await productProxy(request(`/products/${ID}`), forwarded);
    expectNext(response);
    expectForwarded(response);
  });
});
