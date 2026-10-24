import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FIXED_BAR_HEIGHT_VAR, useFixedBarHeight } from './use-fixed-bar-height';

type ObserverCallback = () => void;

const observers: {
  callback: ObserverCallback;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}[] = [];

class FakeResizeObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  constructor(callback: ObserverCallback) {
    observers.push({ callback, observe: this.observe, disconnect: this.disconnect });
  }
}

function barWithHeight(height: number): {
  element: HTMLElement;
  setHeight: (value: number) => void;
} {
  const element = document.createElement('div');
  let current = height;
  element.getBoundingClientRect = () => ({ height: current }) as DOMRect;
  return {
    element,
    setHeight: (value) => {
      current = value;
    },
  };
}

describe('useFixedBarHeight', () => {
  beforeEach(() => {
    observers.length = 0;
    document.body.style.removeProperty(FIXED_BAR_HEIGHT_VAR);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.style.removeProperty(FIXED_BAR_HEIGHT_VAR);
  });

  it('sets the height rounded up on the body when the observer calls back', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const { element } = barWithHeight(71.2);
    renderHook(() => {
      useFixedBarHeight({ current: element });
    });

    expect(observers).toHaveLength(1);
    expect(observers[0]?.observe).toHaveBeenCalledWith(element, { box: 'border-box' });
    observers[0]?.callback();

    expect(document.body.style.getPropertyValue(FIXED_BAR_HEIGHT_VAR)).toBe('72px');
  });

  it('follows the bar on a later callback', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const { element, setHeight } = barWithHeight(60);
    renderHook(() => {
      useFixedBarHeight({ current: element });
    });

    observers[0]?.callback();
    expect(document.body.style.getPropertyValue(FIXED_BAR_HEIGHT_VAR)).toBe('60px');
    setHeight(104.5);
    observers[0]?.callback();

    expect(document.body.style.getPropertyValue(FIXED_BAR_HEIGHT_VAR)).toBe('105px');
  });

  it('disconnects and removes the property on unmount', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const { element } = barWithHeight(80);
    const { unmount } = renderHook(() => {
      useFixedBarHeight({ current: element });
    });
    observers[0]?.callback();
    expect(document.body.style.getPropertyValue(FIXED_BAR_HEIGHT_VAR)).toBe('80px');

    unmount();

    expect(observers[0]?.disconnect).toHaveBeenCalledTimes(1);
    expect(document.body.style.getPropertyValue(FIXED_BAR_HEIGHT_VAR)).toBe('');
  });

  it('does nothing without ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const { element } = barWithHeight(80);
    const { unmount } = renderHook(() => {
      useFixedBarHeight({ current: element });
    });

    expect(observers).toHaveLength(0);
    expect(document.body.style.getPropertyValue(FIXED_BAR_HEIGHT_VAR)).toBe('');
    expect(() => {
      unmount();
    }).not.toThrow();
  });

  it('does nothing with an empty ref', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    document.body.style.setProperty(FIXED_BAR_HEIGHT_VAR, '10px');
    const { unmount } = renderHook(() => {
      useFixedBarHeight({ current: null });
    });

    expect(observers).toHaveLength(0);
    unmount();

    expect(document.body.style.getPropertyValue(FIXED_BAR_HEIGHT_VAR)).toBe('10px');
  });
});
