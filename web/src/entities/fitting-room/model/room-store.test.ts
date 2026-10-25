import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { isRoomOwner, openRoom, ROOM_WISHES_MAX, useRoomStore, useRoomWishes } from './room-store';

beforeEach(() => {
  useRoomStore.setState({ open: false, wishes: null, userId: undefined });
});

describe('setUser', () => {
  it('remembers who is signed in', () => {
    useRoomStore.getState().setUser('u1');

    expect(useRoomStore.getState().userId).toBe('u1');
  });

  it('keeps the wishes of the same user', () => {
    useRoomStore.getState().setWishes('u1', 'шарф');

    useRoomStore.getState().setUser('u1');

    expect(useRoomStore.getState().wishes).toEqual({ userId: 'u1', text: 'шарф' });
  });

  it('drops the wishes of another user', () => {
    useRoomStore.getState().setWishes('u1', 'шарф');

    useRoomStore.getState().setUser('u2');

    expect(useRoomStore.getState().wishes).toBeNull();
    expect(useRoomStore.getState().userId).toBe('u2');
  });

  it('drops the wishes when signed out', () => {
    useRoomStore.getState().setWishes('u1', 'шарф');

    useRoomStore.getState().setUser(null);

    expect(useRoomStore.getState().wishes).toBeNull();
    expect(useRoomStore.getState().userId).toBeNull();
  });
});

describe('isRoomOwner', () => {
  it('accepts a signed-in owner while the store does not know the user yet', () => {
    expect(isRoomOwner('u1')).toBe(true);
  });

  it('accepts the user the store knows', () => {
    useRoomStore.getState().setUser('u1');

    expect(isRoomOwner('u1')).toBe(true);
  });

  it('refuses another user than the store knows', () => {
    useRoomStore.getState().setUser('u2');

    expect(isRoomOwner('u1')).toBe(false);
  });

  it('refuses everyone once the store knows nobody is signed in', () => {
    useRoomStore.getState().setUser(null);

    expect(isRoomOwner('u1')).toBe(false);
  });

  it('refuses a null owner, known user or not', () => {
    expect(isRoomOwner(null)).toBe(false);

    useRoomStore.getState().setUser(null);
    expect(isRoomOwner(null)).toBe(false);

    useRoomStore.getState().setUser('u1');
    expect(isRoomOwner(null)).toBe(false);
  });
});

describe('openRoom', () => {
  it('opens the drawer from outside React, as a toast does', () => {
    expect(useRoomStore.getState().open).toBe(false);

    openRoom();

    expect(useRoomStore.getState().open).toBe(true);
  });

  it('keeps it open when called twice', () => {
    openRoom();
    openRoom();

    expect(useRoomStore.getState().open).toBe(true);
  });
});

describe('the wishes', () => {
  it('are kept for the user who wrote them', () => {
    useRoomStore.getState().setWishes('u1', 'заправить рубашку');

    const { result } = renderHook(() => useRoomWishes('u1'));

    expect(result.current).toBe('заправить рубашку');
  });

  it('are empty for another user signed in at the same tab', () => {
    useRoomStore.getState().setWishes('u1', 'заправить рубашку');

    const { result } = renderHook(() => useRoomWishes('u2'));

    expect(result.current).toBe('');
  });

  it('are empty before anyone wrote them', () => {
    const { result } = renderHook(() => useRoomWishes('u1'));

    expect(result.current).toBe('');
  });

  it('are replaced, not mixed, when another user writes', () => {
    useRoomStore.getState().setWishes('u1', 'первое');
    useRoomStore.getState().setWishes('u2', 'второе');

    expect(renderHook(() => useRoomWishes('u1')).result.current).toBe('');
    expect(renderHook(() => useRoomWishes('u2')).result.current).toBe('второе');
  });

  it(`are cut to ${ROOM_WISHES_MAX} characters`, () => {
    useRoomStore.getState().setWishes('u1', 'я'.repeat(ROOM_WISHES_MAX + 50));

    const { result } = renderHook(() => useRoomWishes('u1'));

    expect(result.current).toHaveLength(ROOM_WISHES_MAX);
  });

  it('keep exactly the limit', () => {
    useRoomStore.getState().setWishes('u1', 'я'.repeat(ROOM_WISHES_MAX));

    expect(renderHook(() => useRoomWishes('u1')).result.current).toHaveLength(ROOM_WISHES_MAX);
  });

  it('update the component that reads them', () => {
    const { result } = renderHook(() => useRoomWishes('u1'));

    act(() => useRoomStore.getState().setWishes('u1', 'новое'));

    expect(result.current).toBe('новое');
  });

  it('are never written to the browser storage (personal text)', () => {
    useRoomStore.getState().setWishes('u1', 'личное');

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});
