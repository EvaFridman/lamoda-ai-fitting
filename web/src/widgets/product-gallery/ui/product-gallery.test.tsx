import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { track } from '@/shared/analytics/client';

import { ProductGallery } from './product-gallery';

vi.mock('next/navigation', () => ({ usePathname: () => '/products/1' }));
vi.mock('@/shared/analytics/client', () => ({ track: vi.fn() }));

beforeEach(() => {
  vi.mocked(track).mockClear();
});

type Product = Parameters<typeof ProductGallery>[0]['product'];

const base: Product = {
  name: 'Худи',
  brand: { id: '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b', name: 'Brooks' },
  image: null,
  images: [],
};

const image = (n: number, sortOrder: number) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  url: `https://lamoda.test/media/p${n}.webp`,
  sortOrder,
});

function sources(container: HTMLElement) {
  return Array.from(container.querySelectorAll('img')).map((img) => img.getAttribute('src'));
}

describe('ProductGallery', () => {
  it('shows the photos by sort order in a list named «Фото товара»', () => {
    const { container } = render(
      <ProductGallery product={{ ...base, images: [image(1, 2), image(2, 0), image(3, 1)] }} />,
    );

    expect(
      within(screen.getByRole('list', { name: 'Фото товара' })).getAllByRole('listitem'),
    ).toHaveLength(3);
    expect(sources(container)).toEqual([
      'https://lamoda.test/media/p2.webp',
      'https://lamoda.test/media/p3.webp',
      'https://lamoda.test/media/p1.webp',
    ]);
  });

  it('shows two photos that share one address as two photos, with no duplicate key', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const twin = { ...image(2, 1), url: image(1, 0).url };
    const { container } = render(
      <ProductGallery product={{ ...base, images: [image(1, 0), twin] }} />,
    );

    expect(sources(container)).toEqual([
      'https://lamoda.test/media/p1.webp',
      'https://lamoda.test/media/p1.webp',
    ]);
    expect(
      within(screen.getByRole('list', { name: 'Фото товара' })).getAllByRole('listitem'),
    ).toHaveLength(2);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('names the first photo after the brand and the product, the rest have no text', () => {
    render(<ProductGallery product={{ ...base, images: [image(1, 1), image(2, 0)] }} />);

    const named = screen.getByRole('img', { name: 'Brooks Худи' });
    expect(named).toHaveAttribute('src', 'https://lamoda.test/media/p2.webp');
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  it('sends gallery.photo with the photo position from 1 on a click', async () => {
    render(<ProductGallery product={{ ...base, images: [image(1, 0), image(2, 1)] }} />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Открыть фото 2 из 2' }));

    expect(track).toHaveBeenCalledExactlyOnceWith('Element Clicked', {
      element: 'gallery.photo',
      zone: 'product',
      type: 'interaction',
      position: 2,
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not reorder the product it was given', () => {
    const images = [image(1, 2), image(2, 0)];
    render(<ProductGallery product={{ ...base, images }} />);

    expect(images.map((item) => item.sortOrder)).toEqual([2, 0]);
  });

  it('falls back to the cover when the product has no photos', () => {
    const { container } = render(
      <ProductGallery
        product={{ ...base, image: { url: 'https://lamoda.test/media/cover.webp' } }}
      />,
    );

    expect(sources(container)).toEqual(['https://lamoda.test/media/cover.webp']);
    expect(screen.getByRole('img', { name: 'Brooks Худи' })).toBeInTheDocument();
  });

  it('prefers the photos to the cover', () => {
    const { container } = render(
      <ProductGallery
        product={{
          ...base,
          image: { url: 'https://lamoda.test/media/cover.webp' },
          images: [image(1, 0)],
        }}
      />,
    );

    expect(sources(container)).toEqual(['https://lamoda.test/media/p1.webp']);
  });

  it('is an empty frame with neither', () => {
    const { container } = render(<ProductGallery product={base} />);

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(container.firstElementChild).toBeEmptyDOMElement();
  });

  it('passes its class name to the gallery and to the empty frame', () => {
    const { container, rerender } = render(
      <ProductGallery product={{ ...base, images: [image(1, 0)] }} className="mine" />,
    );
    expect(container.firstElementChild).toHaveClass('mine');

    rerender(<ProductGallery product={base} className="mine" />);
    expect(container.firstElementChild).toHaveClass('mine');
  });
});
