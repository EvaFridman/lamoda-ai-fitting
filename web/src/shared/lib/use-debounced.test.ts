import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDebounced } from './use-debounced';

interface Props {
  value: string;
  delayMs?: number;
  atOnce?: boolean;
}

function setup(initial: Props) {
  return renderHook(
    ({ value, delayMs = 500, atOnce = false }: Props) => useDebounced(value, delayMs, atOnce),
    { initialProps: initial },
  );
}

function pass(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('useDebounced', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns the first value at once', () => {
    const { result } = setup({ value: 'a' });
    expect(result.current).toBe('a');
  });

  it('returns a changed value only after the delay', () => {
    const { result, rerender } = setup({ value: 'a' });
    rerender({ value: 'b' });
    expect(result.current).toBe('a');
    pass(499);
    expect(result.current).toBe('a');
    pass(1);
    expect(result.current).toBe('b');
  });

  it('restarts the wait on each change and brings only the last value', () => {
    const { result, rerender } = setup({ value: 'a' });
    rerender({ value: 'b' });
    pass(300);
    rerender({ value: 'c' });
    pass(300);
    expect(result.current).toBe('a');
    pass(200);
    expect(result.current).toBe('c');
  });

  it('returns the value in the same render with atOnce, and drops a pending timer', () => {
    const { result, rerender } = setup({ value: 'a' });
    rerender({ value: 'b' });
    rerender({ value: 'c', atOnce: true });
    expect(result.current).toBe('c');
    pass(1000);
    expect(result.current).toBe('c');
  });

  it('does not bring back the value from before an atOnce one', () => {
    const { result, rerender } = setup({ value: 'a' });
    rerender({ value: 'b' });
    pass(500);
    expect(result.current).toBe('b');
    rerender({ value: '', atOnce: true });
    expect(result.current).toBe('');
    rerender({ value: 'c' });
    expect(result.current).toBe('');
    pass(499);
    expect(result.current).toBe('');
    pass(1);
    expect(result.current).toBe('c');
  });

  it('waits for the new delay when it changes', () => {
    const { result, rerender } = setup({ value: 'a' });
    rerender({ value: 'b' });
    pass(300);
    rerender({ value: 'b', delayMs: 100 });
    pass(99);
    expect(result.current).toBe('a');
    pass(1);
    expect(result.current).toBe('b');
  });

  it('clears the timer on unmount', () => {
    const { rerender, unmount } = setup({ value: 'a' });
    rerender({ value: 'b' });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
