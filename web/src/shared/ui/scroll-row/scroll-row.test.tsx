import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ScrollRow } from './scroll-row';

// jsdom has no layout: the list's sizes are what the test says.
const layout = { scrollWidth: 400, clientWidth: 400, scrollLeft: 0 };
const scrollBy = vi.fn();

beforeEach(() => {
  Object.assign(layout, { scrollWidth: 400, clientWidth: 400, scrollLeft: 0 });
  scrollBy.mockReset();
  vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(() => layout.scrollWidth);
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(() => layout.clientWidth);
  vi.spyOn(Element.prototype, 'scrollLeft', 'get').mockImplementation(() => layout.scrollLeft);
  Object.defineProperty(Element.prototype, 'scrollBy', {
    value: scrollBy,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(Element.prototype, 'scrollBy');
});

function items() {
  return [1, 2, 3].map((n) => <li key={n}>Элемент {n}</li>);
}

function overflow(at = 0) {
  Object.assign(layout, { scrollWidth: 1000, clientWidth: 400, scrollLeft: at });
}

// jsdom has no ResizeObserver: a stub that records what the row does with it.
function stubResizeObserver() {
  const state = {
    created: 0,
    observed: [] as Element[],
    callbacks: [] as (() => void)[],
    disconnect: vi.fn(),
  };
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        state.created += 1;
        state.callbacks.push(callback);
      }
      observe(element: Element) {
        state.observed.push(element);
      }
      disconnect = state.disconnect;
    },
  );
  return state;
}

const prev = () => screen.getByRole('button', { name: 'Предыдущие' });
const next = () => screen.getByRole('button', { name: 'Следующие' });

describe('ScrollRow', () => {
  it('shows the list with its name and no arrows when everything fits', () => {
    render(<ScrollRow aria-label="Ряд">{items()}</ScrollRow>);

    expect(screen.getByRole('list', { name: 'Ряд' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('counts less than a pixel of overflow as fitting', () => {
    Object.assign(layout, { scrollWidth: 400.5 });
    render(<ScrollRow>{items()}</ScrollRow>);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows both arrows when it overflows, «‹» disabled at the start', () => {
    overflow();
    render(<ScrollRow>{items()}</ScrollRow>);

    expect(prev()).toHaveAttribute('aria-disabled', 'true');
    expect(next()).toHaveAttribute('aria-disabled', 'false');
  });

  it('enables «‹» after a scroll and turns «›» off at the end', () => {
    overflow();
    render(<ScrollRow>{items()}</ScrollRow>);
    const list = screen.getByRole('list');

    layout.scrollLeft = 200;
    fireEvent.scroll(list);
    expect(prev()).toHaveAttribute('aria-disabled', 'false');
    expect(next()).toHaveAttribute('aria-disabled', 'false');

    layout.scrollLeft = 600;
    fireEvent.scroll(list);
    expect(prev()).toHaveAttribute('aria-disabled', 'false');
    expect(next()).toHaveAttribute('aria-disabled', 'true');
  });

  it('keeps the focus on «›» when it turns off at the end', () => {
    overflow();
    render(<ScrollRow>{items()}</ScrollRow>);
    next().focus();

    layout.scrollLeft = 600;
    fireEvent.scroll(screen.getByRole('list'));

    expect(next()).toHaveFocus();
    expect(next()).toHaveAttribute('aria-disabled', 'true');
  });

  it('measures again when an item is added, with no scroll', async () => {
    stubResizeObserver();
    const { rerender } = render(<ScrollRow>{items()}</ScrollRow>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    overflow();
    rerender(
      <ScrollRow>
        {items()}
        <li>Элемент 4</li>
      </ScrollRow>,
    );

    expect(await screen.findByRole('button', { name: 'Следующие' })).toBeInTheDocument();
  });

  it('observes the list and each item, and again with a new item', async () => {
    const resize = stubResizeObserver();
    const { rerender } = render(<ScrollRow>{items()}</ScrollRow>);

    expect(resize.observed).toEqual([screen.getByRole('list'), ...screen.getAllByRole('listitem')]);

    resize.observed.length = 0;
    rerender(
      <ScrollRow>
        {items()}
        <li>Элемент 4</li>
      </ScrollRow>,
    );

    await vi.waitFor(() => expect(resize.observed).toHaveLength(5));
    expect(resize.observed).toEqual([screen.getByRole('list'), ...screen.getAllByRole('listitem')]);
    expect(resize.disconnect).toHaveBeenCalled();
  });

  it('keeps one observer through a render of the parent with the same items', () => {
    const resize = stubResizeObserver();
    const { rerender } = render(<ScrollRow>{items()}</ScrollRow>);
    rerender(<ScrollRow>{items()}</ScrollRow>);

    expect(resize.created).toBe(1);
  });

  it('disconnects both observers on unmount', () => {
    const resize = stubResizeObserver();
    const mutationDisconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const { unmount } = render(<ScrollRow>{items()}</ScrollRow>);
    resize.disconnect.mockClear();

    unmount();

    expect(resize.disconnect).toHaveBeenCalledOnce();
    expect(mutationDisconnect).toHaveBeenCalledOnce();
  });

  it('measures again when the list is resized', () => {
    const resize = stubResizeObserver();
    const callbacks = resize.callbacks;
    const { unmount } = render(<ScrollRow>{items()}</ScrollRow>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    overflow();
    act(() => callbacks.forEach((callback) => callback()));
    expect(next()).toHaveAttribute('aria-disabled', 'false');

    layout.scrollWidth = 400;
    act(() => callbacks.forEach((callback) => callback()));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    unmount();
    expect(resize.disconnect).toHaveBeenCalled();
  });

  it('scrolls by the width in view: forward on «›», back on «‹»', async () => {
    overflow(300);
    const user = userEvent.setup();
    render(<ScrollRow>{items()}</ScrollRow>);

    await user.click(next());
    expect(scrollBy).toHaveBeenLastCalledWith({ left: 400 });
    await user.click(prev());
    expect(scrollBy).toHaveBeenLastCalledWith({ left: -400 });
    expect(scrollBy).toHaveBeenCalledTimes(2);
  });

  it("calls the direction's onClick before it scrolls", async () => {
    overflow();
    const user = userEvent.setup();
    const order: string[] = [];
    scrollBy.mockImplementation(() => order.push('scroll'));
    const onClick = vi.fn(() => order.push('click'));
    const other = vi.fn();
    render(
      <ScrollRow events={{ next: { onClick }, prev: { onClick: other } }}>{items()}</ScrollRow>,
    );

    await user.click(next());

    expect(onClick).toHaveBeenCalledOnce();
    expect(other).not.toHaveBeenCalled();
    expect(order).toEqual(['click', 'scroll']);
  });

  it('gives a disabled arrow no hover, and an enabled one its hover and leave', () => {
    overflow();
    const prevEnter = vi.fn();
    const prevLeave = vi.fn();
    const nextEnter = vi.fn();
    render(
      <ScrollRow
        events={{
          prev: { onPointerEnter: prevEnter, onPointerLeave: prevLeave },
          next: { onPointerEnter: nextEnter },
        }}
      >
        {items()}
      </ScrollRow>,
    );

    fireEvent.pointerEnter(prev());
    fireEvent.pointerLeave(prev());
    fireEvent.pointerEnter(next());

    expect(prevEnter).not.toHaveBeenCalled();
    expect(prevLeave).toHaveBeenCalledOnce();
    expect(nextEnter).toHaveBeenCalledOnce();
  });

  it('does not scroll or call onClick from a disabled arrow', async () => {
    overflow();
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<ScrollRow events={{ prev: { onClick } }}>{items()}</ScrollRow>);

    await user.click(prev());

    expect(onClick).not.toHaveBeenCalled();
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('sends nothing for a scroll of the list itself', () => {
    overflow();
    const onClick = vi.fn();
    render(<ScrollRow events={{ next: { onClick }, prev: { onClick } }}>{items()}</ScrollRow>);

    layout.scrollLeft = 300;
    fireEvent.scroll(screen.getByRole('list'));

    expect(onClick).not.toHaveBeenCalled();
    expect(scrollBy).not.toHaveBeenCalled();
  });
});
