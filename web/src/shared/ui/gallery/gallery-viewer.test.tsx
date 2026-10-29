import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GalleryImage } from './gallery';
import { GalleryViewer } from './gallery-viewer';

function photos(count: number): GalleryImage[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `photo-${index + 1}`,
    src: `/media/p/${index + 1}.webp`,
    alt: `Фото ${index + 1}`,
  }));
}

function stubMouse(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

function setup(index: number | null, count = 4, onClose = vi.fn()) {
  render(
    <GalleryViewer images={photos(count)} index={index} onClose={onClose} title="Фото товара" />,
  );
  return onClose;
}

function slides() {
  return within(screen.getByRole('dialog')).getAllByRole('listitem', { hidden: true });
}

function visible() {
  return slides().map((slide) => slide.getAttribute('aria-hidden') !== 'true');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GalleryViewer', () => {
  it('renders nothing while closed', () => {
    setup(null);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens at the given photo with its counter and only that slide readable', () => {
    setup(2);

    expect(screen.getByRole('dialog', { name: 'Фото товара' })).toBeInTheDocument();
    expect(screen.getByText('3 из 4')).toBeInTheDocument();
    expect(visible()).toEqual([false, false, true, false]);
  });

  it('turns photos with the arrow keys and stops at both ends', () => {
    setup(1);
    const dialog = screen.getByRole('dialog');

    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    expect(screen.getByText('3 из 4')).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    expect(screen.getByText('4 из 4')).toBeInTheDocument();
    expect(visible()).toEqual([false, false, false, true]);

    fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
    expect(screen.getByText('1 из 4')).toBeInTheDocument();
    expect(visible()).toEqual([true, false, false, false]);
  });

  it('follows the strip scrolled by whole slides', () => {
    setup(0);
    const strip = within(screen.getByRole('dialog')).getByRole('list', { hidden: true });
    Object.defineProperty(strip, 'clientWidth', { configurable: true, value: 400 });

    fireEvent.scroll(strip, { target: { scrollLeft: 800 } });

    expect(screen.getByText('3 из 4')).toBeInTheDocument();
    expect(visible()).toEqual([false, false, true, false]);
  });

  it('closes with the × and calls back', async () => {
    const onClose = setup(1);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Закрыть' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes with Escape and calls back', async () => {
    const onClose = setup(1);

    await userEvent.setup().keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has no «Предыдущее фото» and «Следующее фото» without a mouse', () => {
    stubMouse(false);
    setup(1);

    expect(screen.queryByRole('button', { name: 'Предыдущее фото' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Следующее фото' })).not.toBeInTheDocument();
  });

  it('turns photos with the buttons under a mouse and does nothing at the ends', async () => {
    stubMouse(true);
    setup(0, 3);
    const user = userEvent.setup();
    const previous = screen.getByRole('button', { name: 'Предыдущее фото' });
    const next = screen.getByRole('button', { name: 'Следующее фото' });

    expect(previous).toHaveAttribute('aria-disabled', 'true');
    expect(next).toHaveAttribute('aria-disabled', 'false');
    await user.click(previous);
    expect(screen.getByText('1 из 3')).toBeInTheDocument();

    await user.click(next);
    await user.click(next);
    expect(screen.getByText('3 из 3')).toBeInTheDocument();
    expect(next).toHaveAttribute('aria-disabled', 'true');
    await user.click(next);
    expect(screen.getByText('3 из 3')).toBeInTheDocument();

    await user.click(previous);
    expect(screen.getByText('2 из 3')).toBeInTheDocument();
  });

  it('has no buttons for a single photo', () => {
    stubMouse(true);
    setup(0, 1);

    expect(screen.queryByRole('button', { name: 'Следующее фото' })).not.toBeInTheDocument();
  });
});

describe('GalleryViewer smooth turning', () => {
  function stubQueries(reduced: boolean) {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? reduced : true,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
  }

  function openStrip(index = 0) {
    setup(index);
    const strip = within(screen.getByRole('dialog')).getByRole('list', { hidden: true });
    Object.defineProperty(strip, 'clientWidth', { configurable: true, value: 400 });
    const scrollTo = vi.fn();
    Object.defineProperty(strip, 'scrollTo', { configurable: true, value: scrollTo });
    return { strip, scrollTo };
  }

  it('scrolls smoothly to the next photo with the button', async () => {
    stubQueries(false);
    const { scrollTo } = openStrip(0);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Следующее фото' }));

    expect(scrollTo).toHaveBeenCalledWith({ left: 400, behavior: 'smooth' });
  });

  it('scrolls smoothly with the arrow keys, both ways', () => {
    stubQueries(false);
    const { scrollTo } = openStrip(1);
    const dialog = screen.getByRole('dialog');

    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 800, behavior: 'smooth' });
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 400, behavior: 'smooth' });
  });

  it('jumps at once under reduced motion', () => {
    stubQueries(true);
    const { scrollTo } = openStrip(0);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });

    expect(scrollTo).toHaveBeenCalledWith({ left: 400, behavior: 'instant' });
  });

  it('does not scroll at the ends', () => {
    stubQueries(false);
    const { scrollTo } = openStrip(0);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' });

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('keeps the counter on the target while the glide passes other photos', () => {
    stubQueries(false);
    const { strip } = openStrip(0);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
    expect(screen.getByText('3 из 4')).toBeInTheDocument();

    fireEvent.scroll(strip, { target: { scrollLeft: 100 } });
    expect(screen.getByText('3 из 4')).toBeInTheDocument();
    fireEvent.scroll(strip, { target: { scrollLeft: 500 } });
    expect(screen.getByText('3 из 4')).toBeInTheDocument();

    fireEvent.scroll(strip, { target: { scrollLeft: 800 } });
    expect(screen.getByText('3 из 4')).toBeInTheDocument();
    // The glide is over: scrolling follows the strip again.
    fireEvent.scroll(strip, { target: { scrollLeft: 400 } });
    expect(screen.getByText('2 из 4')).toBeInTheDocument();
  });

  it('clears the glide by the index when the slide width is fractional', () => {
    stubQueries(false);
    const { strip } = openStrip(0);
    for (let step = 0; step < 3; step += 1) {
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
    }

    fireEvent.scroll(strip, { target: { scrollLeft: 1201.5 } });
    expect(screen.getByText('4 из 4')).toBeInTheDocument();
    fireEvent.scroll(strip, { target: { scrollLeft: 400 } });

    expect(screen.getByText('2 из 4')).toBeInTheDocument();
  });

  it.each([
    ['pointerdown', (strip: Element) => fireEvent.pointerDown(strip)],
    ['touchstart', (strip: Element) => fireEvent.touchStart(strip)],
    ['wheel', (strip: Element) => fireEvent.wheel(strip)],
  ])('lets a %s on the strip take it over from the glide', (_name, act) => {
    stubQueries(false);
    const { strip } = openStrip(0);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });

    act(strip);
    fireEvent.scroll(strip, { target: { scrollLeft: 400 } });

    expect(screen.getByText('2 из 4')).toBeInTheDocument();
  });

  it('follows every scroll under reduced motion', () => {
    stubQueries(true);
    const { strip } = openStrip(0);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });

    fireEvent.scroll(strip, { target: { scrollLeft: 400 } });

    expect(screen.getByText('2 из 4')).toBeInTheDocument();
  });
});
