import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('opens the full screen at the clicked photo and closes it', async () => {
    const user = userEvent.setup();
    render(<Gallery images={photos(4)} aria-label="Фото товара" />);

    await user.click(screen.getByRole('button', { name: 'Открыть фото 3 из 4' }));

    const dialog = screen.getByRole('dialog', { name: 'Фото товара' });
    expect(within(dialog).getByText('3 из 4')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('names every photo button by its position and, when it has one, its description', () => {
    render(<Gallery images={photos(3)} aria-label="Фото товара" />);

    expect(
      screen.getByRole('button', { name: 'Открыть фото 1 из 3: Худи, спереди' }),
    ).toBeInTheDocument();
    for (const position of [2, 3]) {
      expect(
        screen.getByRole('button', { name: `Открыть фото ${position} из 3` }),
      ).toBeInTheDocument();
    }
  });

  it('moves the focus to «Закрыть» when the full screen opens', async () => {
    render(<Gallery images={photos(4)} aria-label="Фото товара" />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Открыть фото 2 из 4' }));

    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Закрыть' })).toHaveFocus());
  });

  it.each([
    ['Escape', async (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
    [
      '×',
      async (user: ReturnType<typeof userEvent.setup>) =>
        user.click(screen.getByRole('button', { name: 'Закрыть' })),
    ],
  ])(
    'returns the focus to the photo it opened from after %s, though the click did not focus it',
    async (_, close) => {
      render(<Gallery images={photos(4)} aria-label="Фото товара" />);

      fireEvent.click(screen.getByRole('button', { name: 'Открыть фото 2 из 4' }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await close(userEvent.setup());

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await vi.waitFor(() =>
        expect(screen.getByRole('button', { name: 'Открыть фото 2 из 4' })).toHaveFocus(),
      );
    },
  );

  it('calls the photo events with the photo index and still opens the full screen', async () => {
    const events = {
      onClick: vi.fn(),
      onPointerEnter: vi.fn(),
      onPointerLeave: vi.fn(),
    };
    const photoEvents = vi.fn((index: number) => {
      void index;
      return events;
    });
    const user = userEvent.setup();
    render(<Gallery images={photos(3)} aria-label="Фото товара" photoEvents={photoEvents} />);
    expect(photoEvents.mock.calls.map(([index]) => index)).toEqual([0, 1, 2]);
    const second = screen.getByRole('button', { name: 'Открыть фото 2 из 3' });

    fireEvent.pointerEnter(second, { pointerType: 'mouse' });
    fireEvent.pointerLeave(second, { pointerType: 'mouse' });
    expect(events.onPointerEnter).toHaveBeenCalledTimes(1);
    expect(events.onPointerLeave).toHaveBeenCalledTimes(1);
    expect(events.onClick).not.toHaveBeenCalled();

    await user.click(second);

    expect(events.onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByText('2 из 3')).toBeInTheDocument();
  });

  it('keeps «Показать ещё фото» a separate button that does not open the full screen', async () => {
    render(<Gallery images={photos(7)} aria-label="Фото товара" />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Показать ещё фото' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('draws no lens without a mouse', () => {
    const { container } = render(<Gallery images={photos(3)} aria-label="Фото товара" />);

    expect(container.querySelectorAll('.lens')).toHaveLength(0);
  });

  describe('with a mouse', () => {
    beforeEach(() => {
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }));
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function frameOf(button: HTMLElement, width: number, height: number) {
      button.getBoundingClientRect = () =>
        ({ left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0 }) as DOMRect;
    }

    it('draws one lens per photo with the photo as its background, hidden from assistive technology', () => {
      const { container } = render(<Gallery images={photos(2)} aria-label="Фото товара" />);

      const lenses = Array.from(container.querySelectorAll<HTMLElement>('.lens'));
      expect(lenses).toHaveLength(2);
      expect(lenses[1]).toHaveAttribute('aria-hidden', 'true');
      expect(lenses[1]?.style.backgroundImage).toContain('/media/p/2.webp');
      expect(lenses[0]).not.toHaveAttribute('data-on');
    });

    it('moves the lens under the pointer, enlarged by the covered photo, and hides it on leave', () => {
      const { container } = render(<Gallery images={photos(1)} aria-label="Фото товара" />);
      const button = screen.getByRole('button', { name: /^Открыть фото 1 из 1/ });
      const lens = container.querySelector<HTMLElement>('.lens')!;
      frameOf(button, 200, 300);
      const img = button.querySelector('img')!;
      Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 400 });
      Object.defineProperty(img, 'naturalHeight', { configurable: true, value: 400 });

      fireEvent.pointerMove(button, { pointerType: 'mouse', clientX: 100, clientY: 150 });

      expect(lens).toHaveAttribute('data-on');
      // Covered: 300 x 300 drawn in a 200 x 300 frame, offset -50 px; lens 160 px, zoom 2.5.
      expect(lens.style.transform).toBe('translate(20px, 70px)');
      expect(lens.style.backgroundSize).toBe('750px 750px');
      expect(lens.style.backgroundPosition).toBe('-295px -295px');

      fireEvent.pointerLeave(button, { pointerType: 'mouse' });
      expect(lens).not.toHaveAttribute('data-on');
    });

    it('shows the lens on pointer enter', () => {
      const { container } = render(<Gallery images={photos(1)} aria-label="Фото товара" />);
      const button = screen.getByRole('button', { name: /^Открыть фото 1 из 1/ });
      frameOf(button, 200, 300);

      fireEvent.pointerEnter(button, { pointerType: 'mouse', clientX: 10, clientY: 10 });

      expect(container.querySelector('.lens')).toHaveAttribute('data-on');
    });

    it('stops at the last photo on ArrowRight and turns the next arrow off', async () => {
      const user = userEvent.setup();
      render(<Gallery images={photos(3)} aria-label="Фото товара" />);

      await user.click(screen.getByRole('button', { name: 'Открыть фото 2 из 3' }));
      const dialog = screen.getByRole('dialog');
      const next = within(dialog).getByRole('button', { name: 'Следующее фото' });
      expect(next).toHaveAttribute('aria-disabled', 'false');
      await vi.waitFor(() =>
        expect(within(dialog).getByRole('button', { name: 'Закрыть' })).toHaveFocus(),
      );

      await user.keyboard('{ArrowRight}');
      expect(within(dialog).getByText('3 из 3')).toBeInTheDocument();
      expect(next).toHaveAttribute('aria-disabled', 'true');

      await user.keyboard('{ArrowRight}');
      expect(within(dialog).getByText('3 из 3')).toBeInTheDocument();
    });

    it('returns the focus to the opening photo after moving to another and pressing Escape', async () => {
      const user = userEvent.setup();
      render(<Gallery images={photos(4)} aria-label="Фото товара" />);

      fireEvent.click(screen.getByRole('button', { name: 'Открыть фото 2 из 4' }));
      await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Закрыть' })).toHaveFocus());
      await user.keyboard('{ArrowRight}');
      expect(within(screen.getByRole('dialog')).getByText('3 из 4')).toBeInTheDocument();
      await user.keyboard('{Escape}');

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await vi.waitFor(() =>
        expect(screen.getByRole('button', { name: 'Открыть фото 2 из 4' })).toHaveFocus(),
      );
    });

    it('ignores a touch pointer', () => {
      const { container } = render(<Gallery images={photos(1)} aria-label="Фото товара" />);
      const button = screen.getByRole('button', { name: /^Открыть фото 1 из 1/ });
      frameOf(button, 200, 300);

      fireEvent.pointerMove(button, { pointerType: 'touch', clientX: 10, clientY: 10 });

      expect(container.querySelector('.lens')).not.toHaveAttribute('data-on');
    });
  });

  it('passes the class name to the root', () => {
    const { container } = render(
      <Gallery images={photos(2)} aria-label="Фото товара" className="mine" />,
    );

    expect(container.firstElementChild).toHaveClass('mine');
  });
});
