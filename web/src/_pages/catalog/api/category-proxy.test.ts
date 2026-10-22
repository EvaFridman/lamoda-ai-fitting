// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/entities/category/server', () => ({ findCategoryBySlug: vi.fn() }));

import { findCategoryBySlug } from '@/entities/category/server';

import { categoryProxy } from './category-proxy';

const find = vi.mocked(findCategoryBySlug);

const category = {
  id: '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b',
  name: 'Dresses',
  slug: 'dresses',
  isActive: true,
  description: null,
  sortOrder: 1,
  slot: null,
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
};

function request(path: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest(`https://site.test${path}`, { headers });
}

function rewrittenTo(response: Response): string | null {
  return response.headers.get('x-middleware-rewrite');
}

beforeEach(() => {
  find.mockReset();
});

describe('categoryProxy', () => {
  it('lets a prefetch through without asking the api', async () => {
    const response = await categoryProxy(
      request('/catalog/dresses', { 'next-router-prefetch': '1' }),
    );
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(find).not.toHaveBeenCalled();
  });

  it.each(['/catalog/opengraph-image', '/catalog/twitter-image'])(
    'lets %s through without asking the api',
    async (path) => {
      const response = await categoryProxy(request(path));
      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(rewrittenTo(response)).toBeNull();
      expect(find).not.toHaveBeenCalled();
    },
  );

  it('lets an active category through', async () => {
    find.mockResolvedValue(category);
    const response = await categoryProxy(request('/catalog/dresses'));
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(rewrittenTo(response)).toBeNull();
  });

  it('asks for the second path segment, decoded, with the request headers', async () => {
    find.mockResolvedValue(category);
    const incoming = request('/catalog/%D0%BF%D0%BB%D0%B0%D1%82%D1%8C%D1%8F', {
      'x-real-ip': '203.0.113.7',
    });
    await categoryProxy(incoming);
    expect(find).toHaveBeenCalledWith('платья', incoming.headers);
  });

  it('rewrites a missing category to the not-found path', async () => {
    find.mockResolvedValue(null);
    const response = await categoryProxy(request('/catalog/none'));
    expect(new URL(rewrittenTo(response) ?? '').pathname).toBe('/_category-not-found');
  });

  it('rewrites an inactive category to the not-found path', async () => {
    find.mockResolvedValue({ ...category, isActive: false });
    const response = await categoryProxy(request('/catalog/dresses'));
    expect(new URL(rewrittenTo(response) ?? '').pathname).toBe('/_category-not-found');
  });

  it('rewrites a malformed escape without asking the api', async () => {
    const response = await categoryProxy(request('/catalog/%E0%A4%A'));
    expect(new URL(rewrittenTo(response) ?? '').pathname).toBe('/_category-not-found');
    expect(find).not.toHaveBeenCalled();
  });

  it('lets the request through when the api fails', async () => {
    find.mockRejectedValue(new Error('down'));
    const response = await categoryProxy(request('/catalog/dresses'));
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(rewrittenTo(response)).toBeNull();
  });

  it('forwards no extra request headers when it gets none', async () => {
    find.mockResolvedValue(category);
    const response = await categoryProxy(request('/catalog/dresses'));
    expect(response.headers.get('x-middleware-override-headers')).toBeNull();
  });
});

describe('categoryProxy with request headers', () => {
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
    const response = await categoryProxy(
      request('/catalog/dresses', { 'next-router-prefetch': '1' }),
      forwarded,
    );
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expectForwarded(response);
  });

  it('forwards them on the catalog own routes', async () => {
    const response = await categoryProxy(request('/catalog/opengraph-image'), forwarded);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expectForwarded(response);
  });

  it('forwards them for an active category', async () => {
    find.mockResolvedValue(category);
    const response = await categoryProxy(request('/catalog/dresses'), forwarded);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expectForwarded(response);
  });

  it.each([
    ['missing', null],
    ['inactive', { ...category, isActive: false }],
  ])('forwards them on the rewrite of a %s category', async (_name, found) => {
    find.mockResolvedValue(found);
    const response = await categoryProxy(request('/catalog/none'), forwarded);
    expect(new URL(rewrittenTo(response) ?? '').pathname).toBe('/_category-not-found');
    expectForwarded(response);
  });

  it('forwards them on the rewrite of a malformed escape', async () => {
    const response = await categoryProxy(request('/catalog/%E0%A4%A'), forwarded);
    expect(new URL(rewrittenTo(response) ?? '').pathname).toBe('/_category-not-found');
    expectForwarded(response);
  });

  it('forwards them when the api fails', async () => {
    find.mockRejectedValue(new Error('down'));
    const response = await categoryProxy(request('/catalog/dresses'), forwarded);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expectForwarded(response);
  });
});
