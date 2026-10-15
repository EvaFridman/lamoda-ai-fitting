import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { track } from '@/shared/analytics';

import { ButtonsSection } from './buttons-section';

// A hover counts after 500 ms (spec 0008 J8).
const HOVER_MS = 500;

const pathname = vi.hoisted(() => ({ current: '/ui-kit' }));

vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));
vi.mock('@/shared/analytics/client', () => ({ track: vi.fn() }));

function trackedButton() {
  // The "Варианты" row comes first in the document.
  return screen.getAllByRole('button', { name: 'Добавить в корзину' })[0]!;
}

// The hover state lives at module level, so every test gets a path of its own.
let testNumber = 0;

describe('ButtonsSection analytics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(track).mockClear();
    testNumber += 1;
    pathname.current = `/ui-kit-${testNumber}`;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends one Element Clicked for the first primary button', () => {
    render(<ButtonsSection />);
    fireEvent.click(trackedButton());
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('Element Clicked', { element: 'ui-kit.button-primary' });
  });

  it('sends Element Hovered after a mouse hover of 500 ms, once per page view', () => {
    render(<ButtonsSection />);
    fireEvent.pointerEnter(trackedButton(), { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(HOVER_MS));
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('Element Hovered', { element: 'ui-kit.button-primary' });

    fireEvent.pointerEnter(trackedButton(), { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(HOVER_MS));
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('sends nothing for a hover shorter than 500 ms', () => {
    render(<ButtonsSection />);
    fireEvent.pointerEnter(trackedButton(), { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(HOVER_MS - 1));
    fireEvent.pointerLeave(trackedButton(), { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(HOVER_MS));
    expect(track).not.toHaveBeenCalled();
  });

  it('sends nothing for clicks and hovers on the other buttons', () => {
    render(<ButtonsSection />);
    const others = screen
      .getAllByRole('button')
      .filter((button) => button !== trackedButton() && !button.hasAttribute('disabled'));
    expect(others.length).toBeGreaterThan(5);
    for (const button of others) {
      fireEvent.pointerEnter(button, { pointerType: 'mouse' });
      act(() => vi.advanceTimersByTime(HOVER_MS));
      fireEvent.click(button);
    }
    expect(track).not.toHaveBeenCalled();
  });

  it('does not put the element name into the DOM', () => {
    const { container } = render(<ButtonsSection />);
    expect(container.innerHTML).not.toContain('ui-kit.button-primary');
  });
});
