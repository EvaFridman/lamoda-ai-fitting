import { act, render, renderHook, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  isSubmitFresh,
  markSearchSubmitted,
  type SubmittedSearch,
  useSubmittedSearch,
} from './submitted-search';

function Reader({ onRead }: { onRead?: (submitted: SubmittedSearch | null) => void }) {
  const submitted = useSubmittedSearch();
  useEffect(() => onRead?.(submitted), [submitted, onRead]);
  return <p>{submitted === null ? 'none' : `${submitted.q}:${submitted.id}`}</p>;
}

const idOf = (element: HTMLElement) => Number(element.textContent?.split(':')[1]);

describe('isSubmitFresh', () => {
  const submit = { q: 'a', id: 1, at: 1_000_000 };

  it('counts a submit up to exactly 60 seconds old', () => {
    expect(isSubmitFresh(submit, submit.at)).toBe(true);
    expect(isSubmitFresh(submit, submit.at + 59_999)).toBe(true);
    expect(isSubmitFresh(submit, submit.at + 60_000)).toBe(true);
  });

  it('refuses one older than that', () => {
    expect(isSubmitFresh(submit, submit.at + 60_001)).toBe(false);
  });
});

// The ids count from the module's start: only their differences are checked.
describe('useSubmittedSearch', () => {
  it('reads nothing before a submit, then renders readers again with a new id for each', () => {
    render(<Reader />);
    render(<Reader />);
    expect(screen.getAllByText('none')).toHaveLength(2);

    act(() => markSearchSubmitted('shirt'));
    const readers = screen.getAllByText(/^shirt:\d+$/);
    expect(readers).toHaveLength(2);
    const first = idOf(readers[0]!);

    act(() => markSearchSubmitted('shirt'));
    const second = idOf(screen.getAllByText(/^shirt:\d+$/)[0]!);
    expect(second).toBe(first + 1);

    act(() => markSearchSubmitted('dress'));
    expect(screen.getAllByText(`dress:${second + 1}`)).toHaveLength(2);
  });

  it('gives a reader mounted later the last submit', () => {
    act(() => markSearchSubmitted('late'));
    render(<Reader />);
    expect(screen.getByText(/^late:\d+$/)).toBeInTheDocument();
  });

  it('stops notifying a reader that unmounted', () => {
    const onRead = vi.fn();
    const view = render(<Reader onRead={onRead} />);
    view.unmount();
    onRead.mockClear();
    act(() => markSearchSubmitted('gone'));
    expect(onRead).not.toHaveBeenCalled();
  });

  it('stamps a submit with the time it was made, which isSubmitFresh reads by default', () => {
    vi.useFakeTimers();
    vi.setSystemTime(5_000_000);
    act(() => markSearchSubmitted('stamp'));
    const { result } = renderHook(() => useSubmittedSearch());
    expect(result.current).toMatchObject({ q: 'stamp', at: 5_000_000 });
    vi.advanceTimersByTime(60_000);
    expect(isSubmitFresh(result.current!)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isSubmitFresh(result.current!)).toBe(false);
    vi.useRealTimers();
  });
});
