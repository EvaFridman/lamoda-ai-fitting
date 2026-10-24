import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ProductDetail } from '../model/schemas';

import { ProductAbout } from './product-about';

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const DATE = '2026-10-01T12:00:00.000Z';

function attribute(n: number, name: string, values: string[]) {
  return {
    attribute: { id: `7c9e6679-7425-40de-944b-e07fc1f9${String(n).padStart(4, '0')}`, name },
    values: values.map((value, index) => ({
      id: `8c9e6679-7425-40de-944b-e07fc1f9${String(n * 10 + index).padStart(4, '0')}`,
      value,
      colorHex: null,
    })),
  };
}

const product: ProductDetail = {
  id: ID,
  article: 'A-1',
  name: 'Рубашка',
  brand: { id: ID, name: 'Annen' },
  category: { id: ID, name: 'Рубашки', slug: 'shirts' },
  image: null,
  price: 5000,
  discount: 0,
  finalPrice: 5000,
  rating: null,
  createdAt: DATE,
  updatedAt: DATE,
  description: 'Лёгкая рубашка.',
  images: [],
  variations: [],
  attributes: [],
};

describe('ProductAbout', () => {
  it('shows the heading «О товаре» naming its section', () => {
    render(<ProductAbout product={product} />);

    expect(screen.getByRole('heading', { level: 2, name: 'О товаре' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'О товаре' })).toBeInTheDocument();
  });

  it('shows the whole description, and no paragraph without one', () => {
    const { rerender } = render(<ProductAbout product={product} />);
    expect(screen.getByText('Лёгкая рубашка.')).toBeInTheDocument();

    rerender(<ProductAbout product={{ ...product, description: null }} />);
    expect(screen.queryByText('Лёгкая рубашка.')).not.toBeInTheDocument();
    expect(document.querySelector('p')).toBeNull();
  });

  it('lists each attribute with its values joined and capitalised, then the article last', () => {
    render(
      <ProductAbout
        product={{
          ...product,
          attributes: [
            attribute(1, 'Материал', ['хлопок', 'эластан']),
            attribute(2, 'Цвет', ['Синий']),
          ],
        }}
      />,
    );

    const terms = Array.from(document.querySelectorAll('dt')).map((term) => term.textContent);
    expect(terms).toEqual(['Материал', 'Цвет', 'Артикул']);
    const rows = Array.from(document.querySelectorAll('dd')).map((value) => value.textContent);
    expect(rows).toEqual(['Хлопок, эластан', 'Синий', 'A-1']);
  });

  it('skips an attribute with no values', () => {
    render(
      <ProductAbout
        product={{
          ...product,
          attributes: [attribute(1, 'Материал', []), attribute(2, 'Цвет', ['синий'])],
        }}
      />,
    );

    expect(screen.queryByText('Материал')).not.toBeInTheDocument();
    expect(screen.getByText('Цвет')).toBeInTheDocument();
  });

  it('shows only the article when the product has no attributes', () => {
    render(<ProductAbout product={product} />);

    const list = document.querySelector('dl') as HTMLElement;
    expect(within(list).getAllByText(/./)).toHaveLength(2);
    expect(within(list).getByText('Артикул')).toBeInTheDocument();
    expect(within(list).getByText('A-1')).toBeInTheDocument();
  });

  it('merges className onto the section', () => {
    render(<ProductAbout product={product} className="extra" />);

    expect(screen.getByRole('region', { name: 'О товаре' })).toHaveClass('extra');
  });
});
