import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FavoriteToggle } from '@/shared/ui';

import type { ProductListItem } from '../model/schemas';

import { CatalogProductCard, CatalogProductCardSkeleton } from './catalog-product-card';

const product: ProductListItem = {
  id: '3f0c1c6e-5f0e-4b7c-9d55-0c1d5a1b2c3d',
  article: 'AB123',
  name: 'Куртка утепленная',
  brand: { id: '8a1d2f3e-4b5c-4d6e-8f70-1a2b3c4d5e6f', name: 'Nordic' },
  category: { id: '9b2e3a4f-5c6d-4e7f-9081-2b3c4d5e6f70', name: 'Куртки', slug: 'kurtki' },
  image: { url: 'https://lamoda-ai-fitting.ru/media/x.webp' },
  price: 10000,
  discount: 0,
  finalPrice: 10000,
  rating: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
};

// Prices are formatted with non-breaking spaces; compare with plain ones.
const plain = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim();

describe('CatalogProductCard', () => {
  it('shows the badge, the struck-out old price and the new price for a discounted product', () => {
    render(
      <CatalogProductCard product={{ ...product, discount: 30, finalPrice: 7000 }} href="/p/1" />,
    );

    expect(screen.getByText('−30%')).toBeInTheDocument();
    const old = document.querySelector('s');
    expect(old).not.toBeNull();
    expect(plain(old?.textContent ?? null)).toBe('Старая цена 10 000 ₽,');
    const link = screen.getByRole('link');
    expect(plain(link.textContent)).toContain('Старая цена 10 000 ₽, цена 7 000 ₽');
  });

  it('shows only the price, with no badge or strike, at full price', () => {
    render(<CatalogProductCard product={product} href="/p/1" />);

    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    expect(document.querySelector('s')).toBeNull();
    expect(plain(screen.getByRole('link').textContent)).toContain('10 000 ₽');
    expect(screen.queryByText(/Старая цена/)).not.toBeInTheDocument();
  });

  it('shows "Нет фото" and no image when the product has no photo', () => {
    render(<CatalogProductCard product={{ ...product, image: null }} href="/p/1" />);

    expect(screen.getByText('Нет фото')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('renders the photo from the image url with an empty alt', () => {
    render(<CatalogProductCard product={product} href="/p/1" />);

    const img = document.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', 'https://lamoda-ai-fitting.ru/media/x.webp');
    expect(img).toHaveAttribute('alt', '');
    expect(screen.queryByText('Нет фото')).not.toBeInTheDocument();
  });

  it('shows no rating when there is none', () => {
    render(<CatalogProductCard product={product} href="/p/1" />);

    expect(screen.queryByRole('img', { name: /Рейтинг/ })).not.toBeInTheDocument();
  });

  it('shows the rating when there is one', () => {
    render(<CatalogProductCard product={{ ...product, rating: 4.7 }} href="/p/1" />);

    expect(screen.getByRole('img', { name: 'Рейтинг 4,7 из 5' })).toBeInTheDocument();
  });

  it('shows the brand and the whole name, however long', () => {
    const name = 'Очень длинное название куртки '.repeat(10).trim();
    render(<CatalogProductCard product={{ ...product, name }} href="/p/1" />);

    expect(screen.getByText('Nordic')).toBeInTheDocument();
    expect(screen.getByText(name)).toBeInTheDocument();
  });

  it('is one link to href holding the brand, name and price', () => {
    render(<CatalogProductCard product={product} href="/catalog/jacket" />);

    const link = screen.getByRole('link');
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(link).toHaveAttribute('href', '/catalog/jacket');
    expect(within(link).getByText('Nordic')).toBeInTheDocument();
    expect(within(link).getByText('Куртка утепленная')).toBeInTheDocument();
    expect(plain(link.textContent)).toContain('10 000 ₽');
  });

  it('puts the action outside the link and a click on it does not reach the link', async () => {
    const user = userEvent.setup();
    const onPressedChange = vi.fn();
    render(
      <CatalogProductCard
        product={product}
        href="/p/1"
        action={<FavoriteToggle size={32} onPressedChange={onPressedChange} />}
      />,
    );

    const link = screen.getByRole('link');
    const linkClick = vi.fn();
    link.addEventListener('click', linkClick);
    const toggle = screen.getByRole('button', { name: 'В избранное' });

    expect(link).not.toContainElement(toggle);
    expect(toggle.closest('a')).toBeNull();

    await user.click(toggle);

    expect(onPressedChange).toHaveBeenCalledTimes(1);
    expect(onPressedChange.mock.calls[0]?.[0]).toBe(true);
    expect(linkClick).not.toHaveBeenCalled();
  });

  it('renders nothing extra without an action', () => {
    render(<CatalogProductCard product={product} href="/p/1" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('article').children).toHaveLength(1);
  });

  it('renders no action wrapper for a false action', () => {
    const show = false as boolean;
    render(
      <CatalogProductCard
        product={product}
        href="/p/1"
        action={show && <FavoriteToggle size={32} />}
      />,
    );

    expect(screen.getByRole('article').children).toHaveLength(1);
  });

  it('keeps "Нет фото" out of the link name, which keeps the brand and the name', () => {
    render(<CatalogProductCard product={{ ...product, image: null }} href="/p/1" />);

    expect(screen.getByText('Нет фото')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('link', { name: /Nordic/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Куртка утепленная/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Нет фото/ })).not.toBeInTheDocument();
  });

  it.each([null, 4.7])('renders the rating row for rating %s', (rating) => {
    const { container } = render(
      <CatalogProductCard product={{ ...product, rating }} href="/p/1" />,
    );

    expect(container.querySelector('.ratingRow')).not.toBeNull();
  });

  it('merges className onto the root', () => {
    render(<CatalogProductCard product={product} href="/p/1" className="extra" />);

    expect(screen.getByRole('article')).toHaveClass('extra');
  });
});

describe('CatalogProductCardSkeleton', () => {
  it('is a busy block of hidden boxes with no link', () => {
    const { container } = render(<CatalogProductCardSkeleton className="extra" />);

    const root = container.firstElementChild;
    expect(root).toHaveAttribute('aria-busy', 'true');
    expect(root).toHaveClass('extra');
    const boxes = container.querySelectorAll('[aria-hidden="true"]');
    expect(boxes.length).toBeGreaterThan(0);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('lays out its rows like the card: three boxes, the last in the name, then an empty rating row', () => {
    const { container } = render(<CatalogProductCardSkeleton />);

    const rows = Array.from(container.querySelector('.description')?.children ?? []);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveStyle({ height: '20px' });
    expect(rows[1]).toHaveStyle({ height: '16px' });
    expect(rows[2]).toHaveClass('name');
    expect(rows[2]?.firstElementChild).toHaveStyle({ height: '16px' });
    expect(rows[2]?.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(rows[3]).toHaveClass('ratingRow');
    expect(rows[3]).toBeEmptyDOMElement();
  });
});
