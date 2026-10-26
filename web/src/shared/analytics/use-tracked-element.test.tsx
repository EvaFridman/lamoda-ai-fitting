import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { track } from './client';
import {
  HOVER_MS,
  trackElementClick,
  useHoverReset,
  useTrackedElement,
  useTrackedElements,
} from './use-tracked-element';

const pathname = vi.hoisted(() => ({ current: '/a' }));

vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));
vi.mock('./client', () => ({ track: vi.fn() }));

function Probe() {
  const props = useTrackedElement('ui-kit.button-primary');
  return (
    <button type="button" {...props}>
      probe
    </button>
  );
}

function hover(pointerType: string, index = 0) {
  fireEvent.pointerEnter(screen.getAllByRole('button').at(index)!, { pointerType });
}

// The hook keeps the "hover sent" state at module level, so every test gets a path of its own
// instead of reloading modules (a second React copy would break the hooks).
let testNumber = 0;

describe('trackElementClick', () => {
  beforeEach(() => {
    vi.mocked(track).mockClear();
  });

  it('sends the click of a listed element with its zone, type and properties, outside React', () => {
    trackElementClick('room.undo', { slot: 'top', action: 'replace' });
    expect(track).toHaveBeenCalledExactlyOnceWith('Element Clicked', {
      element: 'room.undo',
      zone: 'fitting',
      type: 'interaction',
      slot: 'top',
      action: 'replace',
    });
  });

  it('sends an element without properties with nothing else', () => {
    trackElementClick('ui-kit.button-primary');
    expect(track).toHaveBeenCalledExactlyOnceWith('Element Clicked', {
      element: 'ui-kit.button-primary',
      zone: 'service',
      type: 'service',
    });
  });

  it('drops a property the catalog does not declare for the element', () => {
    const extra = { slot: 'top', action: 'remove', email: 'a@b.c' } as const;
    trackElementClick('room.undo', extra);
    expect(track).toHaveBeenCalledExactlyOnceWith('Element Clicked', {
      element: 'room.undo',
      zone: 'fitting',
      type: 'interaction',
      slot: 'top',
      action: 'remove',
    });
  });

  it('sends no hover', () => {
    vi.useFakeTimers();
    try {
      trackElementClick('room.open', { source: 'toast', items: 2 });
      vi.advanceTimersByTime(HOVER_MS * 2);
      expect(track).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('useTrackedElements', () => {
  function Photos() {
    const photo = useTrackedElements('gallery.photo');
    return (
      <>
        {[1, 2].map((position) => (
          <button key={position} type="button" {...photo({ position })}>
            photo {position}
          </button>
        ))}
      </>
    );
  }

  const event = (position: number) => ({
    element: 'gallery.photo',
    zone: 'product',
    type: 'interaction',
    position,
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(track).mockClear();
    testNumber += 1;
    pathname.current = `/photos-${testNumber}`;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends a click with the properties of that copy', () => {
    render(<Photos />);
    fireEvent.click(screen.getByRole('button', { name: 'photo 2' }));
    expect(track).toHaveBeenCalledExactlyOnceWith('Element Clicked', event(2));
  });

  it('sends a hover of a mouse after 500 ms, once per set of properties', () => {
    render(<Photos />);
    hover('mouse', 0);
    act(() => vi.advanceTimersByTime(HOVER_MS - 1));
    expect(track).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(track).toHaveBeenCalledExactlyOnceWith('Element Hovered', event(1));

    hover('mouse', 0);
    act(() => vi.advanceTimersByTime(HOVER_MS));
    expect(track).toHaveBeenCalledTimes(1);

    hover('mouse', 1);
    act(() => vi.advanceTimersByTime(HOVER_MS));
    expect(track).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenLastCalledWith('Element Hovered', event(2));
  });

  it('shares one timer: moving to the next copy cancels the first hover', () => {
    render(<Photos />);
    hover('mouse', 0);
    act(() => vi.advanceTimersByTime(HOVER_MS - 1));
    hover('mouse', 1);
    act(() => vi.advanceTimersByTime(HOVER_MS));
    expect(track).toHaveBeenCalledExactlyOnceWith('Element Hovered', event(2));
  });

  it('cancels the hover when the pointer leaves early', () => {
    render(<Photos />);
    hover('mouse');
    act(() => vi.advanceTimersByTime(HOVER_MS - 1));
    fireEvent.pointerLeave(screen.getAllByRole('button')[0]!, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(HOVER_MS));
    expect(track).not.toHaveBeenCalled();
  });

  it('ignores a touch pointer', () => {
    render(<Photos />);
    hover('touch');
    act(() => vi.advanceTimersByTime(HOVER_MS * 2));
    expect(track).not.toHaveBeenCalled();
  });

  it('sends the hover again after the path changes', () => {
    const { rerender } = render(<Photos />);
    hover('mouse');
    act(() => vi.advanceTimersByTime(HOVER_MS));
    pathname.current += '/next';
    rerender(<Photos />);
    hover('mouse');
    act(() => vi.advanceTimersByTime(HOVER_MS));
    expect(track).toHaveBeenCalledTimes(2);
  });
});

describe('useTrackedElement', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(track).mockClear();
    testNumber += 1;
    pathname.current = `/page-${testNumber}`;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends Element Clicked on click', () => {
    render(<Probe />);
    fireEvent.click(screen.getByRole('button'));
    expect(track).toHaveBeenCalledWith('Element Clicked', {
      element: 'ui-kit.button-primary',
      zone: 'service',
      type: 'service',
    });
  });

  it('sends Element Hovered once after 500 ms, not before', () => {
    render(<Probe />);
    hover('mouse');
    act(() => vi.advanceTimersByTime(HOVER_MS - 1));
    expect(track).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('Element Hovered', {
      element: 'ui-kit.button-primary',
      zone: 'service',
      type: 'service',
    });
  });

  it('cancels the hover when the pointer leaves early', () => {
    render(<Probe />);
    hover('mouse');
    act(() => vi.advanceTimersByTime(HOVER_MS - 1));
    fireEvent.pointerLeave(screen.getByRole('button'), { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(HOVER_MS));
    expect(track).not.toHaveBeenCalled();
  });

  it.each(['touch', 'pen'])('ignores %s pointers', (pointerType) => {
    render(<Probe />);
    hover(pointerType);
    act(() => vi.advanceTimersByTime(HOVER_MS * 2));
    expect(track).not.toHaveBeenCalled();
  });

  it('sends the hover once per page view and again after the path changes', () => {
    const { rerender } = render(<Probe />);
    hover('mouse');
    act(() => vi.advanceTimersByTime(HOVER_MS));
    hover('mouse');
    act(() => vi.advanceTimersByTime(HOVER_MS));
    expect(track).toHaveBeenCalledTimes(1);

    pathname.current += '/next';
    rerender(<Probe />);
    hover('mouse');
    act(() => vi.advanceTimersByTime(HOVER_MS));
    expect(track).toHaveBeenCalledTimes(2);
  });

  it('sends one hover for two copies of the same element', () => {
    render(
      <>
        <Probe />
        <Probe />
      </>,
    );
    hover('mouse', 0);
    act(() => vi.advanceTimersByTime(HOVER_MS));
    hover('mouse', 1);
    act(() => vi.advanceTimersByTime(HOVER_MS));
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('sends no second hover after unmount and remount on the same path', () => {
    const first = render(<Probe />);
    hover('mouse');
    act(() => vi.advanceTimersByTime(HOVER_MS));
    first.unmount();
    render(<Probe />);
    hover('mouse');
    act(() => vi.advanceTimersByTime(HOVER_MS));
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('cancels a hover started before the path changed', () => {
    const { rerender } = render(<Probe />);
    hover('mouse');
    act(() => vi.advanceTimersByTime(HOVER_MS - 1));
    pathname.current += '/next';
    rerender(<Probe />);
    act(() => vi.advanceTimersByTime(HOVER_MS));
    expect(track).not.toHaveBeenCalled();
  });

  describe('returning to a path after a page with no tracked element', () => {
    function Page({ withReset, show }: { withReset: boolean; show: boolean }) {
      return (
        <>
          {withReset ? <Reset /> : null}
          {show ? <Probe /> : null}
        </>
      );
    }
    function Reset() {
      useHoverReset();
      return null;
    }

    function visitAThenBThenA(withReset: boolean) {
      const a = pathname.current;
      const { rerender } = render(<Page withReset={withReset} show />);
      hover('mouse');
      act(() => vi.advanceTimersByTime(HOVER_MS));
      pathname.current = `${a}/b`;
      rerender(<Page withReset={withReset} show={false} />);
      pathname.current = a;
      rerender(<Page withReset={withReset} show />);
      hover('mouse');
      act(() => vi.advanceTimersByTime(HOVER_MS));
    }

    it('sends the hover again on the second visit when useHoverReset is mounted', () => {
      visitAThenBThenA(true);
      expect(track).toHaveBeenCalledTimes(2);
    });

    it('sends it once without useHoverReset (the fallback)', () => {
      visitAThenBThenA(false);
      expect(track).toHaveBeenCalledTimes(1);
    });

    it('still sends no second hover on the same path with useHoverReset mounted', () => {
      render(<Page withReset show />);
      hover('mouse');
      act(() => vi.advanceTimersByTime(HOVER_MS));
      hover('mouse');
      act(() => vi.advanceTimersByTime(HOVER_MS));
      expect(track).toHaveBeenCalledTimes(1);
    });
  });

  it('sends nothing after unmount', () => {
    const { unmount } = render(<Probe />);
    hover('mouse');
    unmount();
    act(() => vi.advanceTimersByTime(HOVER_MS * 2));
    expect(track).not.toHaveBeenCalled();
  });
});
