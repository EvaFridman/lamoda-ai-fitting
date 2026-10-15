import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { productListOptions as browserOptions } from '@/entities/product';
import { productListOptions as serverOptions } from '@/entities/product/server';

import { PAGE_SIZE, productPageQuery } from './query';

describe('productPageQuery', () => {
  it('page 1 with no brand starts at offset 0 with the page size', () => {
    expect(productPageQuery([], 1)).toEqual({ brandId: [], limit: PAGE_SIZE, offset: 0 });
  });

  it('page 2 starts after one page', () => {
    expect(productPageQuery([], 2).offset).toBe(PAGE_SIZE);
  });

  it('passes the brand ids as brandId', () => {
    expect(productPageQuery(['b1', 'b2'], 1).brandId).toEqual(['b1', 'b2']);
  });

  it('gives the server and the browser the same query key for page 1', () => {
    const query = productPageQuery([], 1);
    expect(serverOptions(query).queryKey).toEqual(browserOptions(query).queryKey);
  });

  it('gives different keys to different pages and brands', () => {
    const first = browserOptions(productPageQuery([], 1)).queryKey;
    expect(browserOptions(productPageQuery([], 2)).queryKey).not.toEqual(first);
    expect(browserOptions(productPageQuery(['b1'], 1)).queryKey).not.toEqual(first);
  });
});
