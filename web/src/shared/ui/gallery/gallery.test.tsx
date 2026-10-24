import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Gallery, type GalleryImage } from './gallery';

function photos(count: number): GalleryImage[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `photo-${index + 1}`,
    src: `/media/p/${index + 1}.webp`,
    alt: index === 0 ? 'Худи, спереди' : '',
  }));
}

function items() {
  return within(screen.getByRole('list', { name: 'Фото товара' })).getAllByRole('listitem');
}

function dots(container: HTMLElement) {
  return Array.from(container.querySelectorAll('[aria-hidden="true"] > span'));
}

describe('Gallery', () => {
  it('is a list named by aria-label with one item per photo', () => {
    render(<Gallery images={photos(4)} aria-label="Фото товара" />);

    expect(items()).toHaveLength(4);
  });

  it('draws each photo as an unoptimized image with its own address and the first one named', () => {
    const { container } = render(<Gallery images={photos(3)} aria-label="Фото товара" />);

    const images = Array.from(container.querySelectorAll('img'));
    expect(images.map((image) => image.getAttribute('src'))).toEqual([
      '/media/p/1.webp',
      '/media/p/2.webp',
      '/media/p/3.webp',
    ]);
    expect(screen.getByRole('img', { name: 'Худи, спереди' })).toBe(images[0]);
  });

  it('loads the first two photos eagerly and the rest lazily', () => {
    const { container } = render(<Gallery images={photos(4)} aria-label="Фото товара" />);

    const images = Array.from(container.querySelectorAll('img'));
    expect(images.map((image) => image.getAttribute('loading'))).toEqual([
      'eager',
      'eager',
      'lazy',
      'lazy',
    ]);
  });

  it('makes the photos after the first two small', () => {
    render(<Gallery images={photos(5)} aria-label="Фото товара" />);

    expect(items().map((item) => item.classList.contains('small'))).toEqual([
      false,
      false,
      true,
      true,
      true,
    ]);
  });

  it('offers no «Показать ещё фото» for five photos or fewer', () => {
    render(<Gallery images={photos(5)} aria-label="Фото товара" />);

    expect(screen.queryByRole('button', { name: 'Показать ещё фото' })).not.toBeInTheDocument();
    expect(items().some((item) => item.classList.contains('extra'))).toBe(false);
  });

  it('puts the button in the fifth item and marks the sixth and later as extra', () => {
    render(<Gallery images={photos(7)} aria-label="Фото товара" />);

    const list = items();
    const button = screen.getByRole('button', { name: 'Показать ещё фото' });
    expect(list[4]).toContainElement(button);
    expect(list.map((item) => item.classList.contains('extra'))).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      true,
    ]);
  });

  it('shows every photo large and drops the button after «Показать ещё фото»', async () => {
    render(<Gallery images={photos(7)} aria-label="Фото товара" />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Показать ещё фото' }));

    expect(screen.queryByRole('button', { name: 'Показать ещё фото' })).not.toBeInTheDocument();
    expect(items()).toHaveLength(7);
    for (const item of items()) {
      expect(item).not.toHaveClass('small');
      expect(item).not.toHaveClass('extra');
    }
  });

  it('hides the dots from assistive technology and draws one per photo', () => {
    const { container } = render(<Gallery images={photos(4)} aria-label="Фото товара" />);

    expect(dots(container)).toHaveLength(4);
    expect(dots(container)[0]).toHaveClass('on');
  });

  it('draws no dots for a single photo', () => {
    const { container } = render(<Gallery images={photos(1)} aria-label="Фото товара" />);

    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('moves the lit dot with the strip scrolled by whole slides', () => {
    const { container } = render(<Gallery images={photos(4)} aria-label="Фото товара" />);
    const strip = screen.getByRole('list', { name: 'Фото товара' });
    Object.defineProperty(strip, 'clientWidth', { configurable: true, value: 390 });

    fireEvent.scroll(strip, { target: { scrollLeft: 780 } });
    expect(dots(container).map((dot) => dot.classList.contains('on'))).toEqual([
      false,
      false,
      true,
      false,
    ]);

    // Half way to the next slide rounds to the nearer one.
    fireEvent.scroll(strip, { target: { scrollLeft: 400 } });
    expect(dots(container).map((dot) => dot.classList.contains('on'))).toEqual([
      false,
      true,
      false,
      false,
    ]);
  });

  it('keeps the lit dot where it was when the strip has no width', () => {
    const { container } = render(<Gallery images={photos(3)} aria-label="Фото товара" />);
    const strip = screen.getByRole('list', { name: 'Фото товара' });

    fireEvent.scroll(strip, { target: { scrollLeft: 500 } });

    expect(dots(container)[0]).toHaveClass('on');
  });

  it('keeps two photos with one address as two items and two dots, with no duplicate key', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { container } = render(
      <Gallery
        images={[
          { id: 'a', src: '/media/p/same.webp', alt: 'Худи' },
          { id: 'b', src: '/media/p/same.webp', alt: '' },
        ]}
        aria-label="Фото товара"
      />,
    );

    expect(items()).toHaveLength(2);
    expect(dots(container)).toHaveLength(2);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('passes the class name to the root', () => {
    const { container } = render(
      <Gallery images={photos(2)} aria-label="Фото товара" className="mine" />,
    );

    expect(container.firstElementChild).toHaveClass('mine');
  });
});
