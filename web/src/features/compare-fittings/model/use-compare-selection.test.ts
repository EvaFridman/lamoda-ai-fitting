import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { COMPARE_MAX, useCompareSelection } from './use-compare-selection';

describe('useCompareSelection', () => {
  it('starts inactive with nothing chosen', () => {
    const { result } = renderHook(() => useCompareSelection());
    expect(result.current.active).toBe(false);
    expect(result.current.ids).toEqual([]);
    expect(COMPARE_MAX).toBe(2);
  });

  it('start turns the mode on, with an entry already chosen when given', () => {
    const { result } = renderHook(() => useCompareSelection());
    act(() => result.current.start());
    expect(result.current).toMatchObject({ active: true, ids: [] });
    act(() => result.current.start('a'));
    expect(result.current).toMatchObject({ active: true, ids: ['a'] });
  });

  it('toggle chooses in order and lets an entry go', () => {
    const { result } = renderHook(() => useCompareSelection());
    act(() => result.current.start());
    act(() => result.current.toggle('b'));
    act(() => result.current.toggle('a'));
    expect(result.current.ids).toEqual(['b', 'a']);
    act(() => result.current.toggle('b'));
    expect(result.current.ids).toEqual(['a']);
  });

  it('ignores a third entry but still lets a chosen one go', () => {
    const { result } = renderHook(() => useCompareSelection());
    act(() => result.current.start('a'));
    act(() => result.current.toggle('b'));
    act(() => result.current.toggle('c'));
    expect(result.current.ids).toEqual(['a', 'b']);
    act(() => result.current.toggle('a'));
    act(() => result.current.toggle('c'));
    expect(result.current.ids).toEqual(['b', 'c']);
  });

  it('counts only the chosen entries the list can still compare', () => {
    const { result, rerender } = renderHook(
      ({ selectable }: { selectable?: string[] }) => useCompareSelection(selectable),
      { initialProps: { selectable: ['a', 'b', 'c'] } as { selectable?: string[] } },
    );
    act(() => result.current.start('a'));
    act(() => result.current.toggle('b'));
    expect(result.current.ids).toEqual(['a', 'b']);

    rerender({ selectable: ['a', 'c'] });
    expect(result.current.ids).toEqual(['a']);

    act(() => result.current.toggle('c'));
    expect(result.current.ids).toEqual(['a', 'c']);
  });

  it('keeps every chosen entry without a list of selectable ones', () => {
    const { result, rerender } = renderHook(
      ({ selectable }: { selectable?: string[] }) => useCompareSelection(selectable),
      { initialProps: {} as { selectable?: string[] } },
    );
    act(() => result.current.start('a'));
    act(() => result.current.toggle('b'));

    rerender({});
    expect(result.current.ids).toEqual(['a', 'b']);
    act(() => result.current.toggle('c'));
    expect(result.current.ids).toEqual(['a', 'b']);
  });

  it('cancel turns the mode off and clears the choice', () => {
    const { result } = renderHook(() => useCompareSelection());
    act(() => result.current.start('a'));
    act(() => result.current.cancel());
    expect(result.current).toMatchObject({ active: false, ids: [] });
  });
});
