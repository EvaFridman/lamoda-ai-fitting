import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FooterLink } from './footer-link';

const mocks = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  track: mocks.track,
  reset: vi.fn(),
}));

// next/link cancels the click to navigate on the client; a plain anchor does not.
vi.mock('next/link', async () => {
  const { createElement } = await import('react');
  return {
    default: ({
      onClick,
      ...props
    }: {
      href: string;
      onClick?: (event: { preventDefault: () => void }) => void;
    }) =>
      createElement('a', {
        ...props,
        onClick: (event: { preventDefault: () => void }) => {
          onClick?.(event);
          event.preventDefault();
        },
      }),
  };
});

// Records whether the click was already cancelled by the link (next/link cancels it to navigate on
// the client), then cancels it so jsdom does not try to navigate.
function watchClicks() {
  const cancelled: boolean[] = [];
  const listener = (event: Event) => {
    cancelled.push(event.defaultPrevented);
    event.preventDefault();
  };
  document.addEventListener('click', listener);
  return { cancelled, stop: () => document.removeEventListener('click', listener) };
}

describe('FooterLink', () => {
  beforeEach(() => {
    mocks.track.mockReset();
  });

  it('is next/link without fullLoad: the click is cancelled for a client navigation', async () => {
    const user = userEvent.setup();
    render(<FooterLink href="/privacy" label="Политика" track="stores" />);

    const watch = watchClicks();
    await user.click(screen.getByRole('link', { name: 'Политика' }));
    watch.stop();

    expect(watch.cancelled).toEqual([true]);
  });

  it('is a plain anchor to the stores page with fullLoad and the class it is given', async () => {
    const user = userEvent.setup();
    render(
      <FooterLink
        href="/customer/stores"
        label="Магазины Lamoda Sport"
        track="stores"
        fullLoad
        className="mine"
      />,
    );

    const link = screen.getByRole('link', { name: 'Магазины Lamoda Sport' });
    expect(link).toHaveAttribute('href', '/customer/stores');
    expect(link).toHaveClass('mine');
    const watch = watchClicks();
    await user.click(link);
    watch.stop();

    expect(watch.cancelled).toEqual([false]);
  });

  it('sends the click as footer.link with link stores', async () => {
    const user = userEvent.setup();
    render(<FooterLink href="/customer/stores" label="Магазины Lamoda Sport" track="stores" />);

    const watch = watchClicks();
    await user.click(screen.getByRole('link', { name: 'Магазины Lamoda Sport' }));
    watch.stop();

    expect(mocks.track).toHaveBeenCalledExactlyOnceWith('Element Clicked', {
      element: 'footer.link',
      zone: 'footer',
      type: 'navigation',
      link: 'stores',
    });
  });

  it('sends the hover once it lasts 500 ms', async () => {
    vi.useFakeTimers();
    try {
      render(<FooterLink href="/customer/stores" label="Магазины Lamoda Sport" track="stores" />);

      fireEvent.pointerEnter(screen.getByRole('link', { name: 'Магазины Lamoda Sport' }), {
        pointerType: 'mouse',
      });
      vi.advanceTimersByTime(499);
      expect(mocks.track).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);

      expect(mocks.track).toHaveBeenCalledExactlyOnceWith('Element Hovered', {
        element: 'footer.link',
        zone: 'footer',
        type: 'navigation',
        link: 'stores',
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
