import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import type { ProductListItem } from '../model/schemas';

import { CatalogProductCard } from './catalog-product-card';

const product: ProductListItem = {
  id: '3f0c1c6e-5f0e-4b7c-9d55-0c1d5a1b2c3d',
  article: 'AB123',
  name: 'Куртка',
  brand: { id: '8a1d2f3e-4b5c-4d6e-8f70-1a2b3c4d5e6f', name: 'Nordic' },
  category: { id: '9b2e3a4f-5c6d-4e7f-9081-2b3c4d5e6f70', name: 'Куртки', slug: 'kurtki' },
  image: null,
  price: 10000,
  discount: 0,
  finalPrice: 10000,
  rating: null,
  createdAt: '2026-10-01T10:00:00.000Z',
};

beforeEach(() => {
  linkProps.mockClear();
});

describe('CatalogProductCard prefetch', () => {
  it.each([false, true])('passes prefetch=%s to the link', (prefetch) => {
    render(<CatalogProductCard product={product} href="/p/1" prefetch={prefetch} />);
    expect(linkProps).toHaveBeenCalledWith(expect.objectContaining({ href: '/p/1', prefetch }));
  });

  it('leaves prefetch undefined, Next default, when not given', () => {
    render(<CatalogProductCard product={product} href="/p/1" />);
    expect(linkProps.mock.calls[0]?.[0].prefetch).toBeUndefined();
  });
});
