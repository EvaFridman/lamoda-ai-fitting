import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PHONE_QUERY } from '@/shared/config';

import { useMediaQuery } from './use-media-query';

type Listener = () => void;

// A media query list that a test can flip.
function stubMedia(initial: boolean) {
  const listeners = new Set<Listener>();
  const state = { matches: initial };
  const addEventListener = vi.fn((_type: string, listener: Listener) => listeners.add(listener));
  const removeEventListener = vi.fn((_type: string, listener: Listener) =>
    listeners.delete(listener),
  );
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query === PHONE_QUERY && state.matches;
    },
    media: query,
    addEventListener,
    removeEventListener,
  }));
  return {
    addEventListener,
    removeEventListener,
    set(matches: boolean) {
      state.matches = matches;
      for (const listener of listeners) listener();
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useMediaQuery', () => {
  it('is false where the window has no matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => useMediaQuery(PHONE_QUERY));

    expect(result.current).toBe(false);
  });

  it('is false when the query does not match', () => {
    stubMedia(false);
    const { result } = renderHook(() => useMediaQuery(PHONE_QUERY));

    expect(result.current).toBe(false);
  });

  it('is true when the query matches', () => {
    stubMedia(true);
    const { result } = renderHook(() => useMediaQuery(PHONE_QUERY));

    expect(result.current).toBe(true);
  });

  it('follows the query as it starts and stops matching', () => {
    const media = stubMedia(false);
    const { result } = renderHook(() => useMediaQuery(PHONE_QUERY));
    expect(media.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

    act(() => media.set(true));
    expect(result.current).toBe(true);

    act(() => media.set(false));
    expect(result.current).toBe(false);
  });

  it('subscribes once per query across re-renders, and again when the query changes', () => {
    const media = stubMedia(false);
    const { rerender } = renderHook(({ query }) => useMediaQuery(query), {
      initialProps: { query: PHONE_QUERY },
    });
    rerender({ query: PHONE_QUERY });
    rerender({ query: PHONE_QUERY });
    expect(media.addEventListener).toHaveBeenCalledTimes(1);
    expect(media.removeEventListener).not.toHaveBeenCalled();

    rerender({ query: '(width < 400px)' });

    expect(media.removeEventListener).toHaveBeenCalledTimes(1);
    expect(media.addEventListener).toHaveBeenCalledTimes(2);
  });

  it('stops listening when it unmounts', () => {
    const media = stubMedia(false);
    const { unmount } = renderHook(() => useMediaQuery(PHONE_QUERY));

    unmount();

    expect(media.removeEventListener).toHaveBeenCalledTimes(1);
    expect(media.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('keeps the phone query for widths under 600px', () => {
    expect(PHONE_QUERY).toBe('(width < 600px)');
  });
});
