import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ProductListItem } from '../model/schemas';
import { CatalogProductCard } from './catalog-product-card';

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';

const product: ProductListItem = {
  id: ID,
  article: 'A-1',
  name: 'Платье',
  brand: { id: ID, name: 'Бренд' },
  category: { id: ID, name: 'Платья', slug: 'dresses' },
  image: null,
  price: 5000,
  discount: 0,
  finalPrice: 5000,
  rating: null,
  createdAt: '2026-10-01T12:00:00.000Z',
};

describe('CatalogProductCard linkEvents', () => {
  it('keeps the href and prevents nothing before the handler runs', () => {
    const seen: boolean[] = [];
    const linkEvents = {
      onClick: vi.fn((event: { defaultPrevented: boolean }) => seen.push(event.defaultPrevented)),
      onPointerEnter: vi.fn(),
      onPointerLeave: vi.fn(),
    };
    render(<CatalogProductCard product={product} href="/products/1" linkEvents={linkEvents} />);
    const link = screen.getByRole('link');
    // jsdom does not navigate; on the document, so it runs after React's handlers.
    const stop = (event: Event) => event.preventDefault();
    document.addEventListener('click', stop);

    expect(link).toHaveAttribute('href', '/products/1');
    fireEvent.click(link);
    fireEvent.pointerEnter(link);
    document.removeEventListener('click', stop);

    expect(seen).toEqual([false]);
    expect(linkEvents.onPointerEnter).toHaveBeenCalledTimes(1);
  });
});
