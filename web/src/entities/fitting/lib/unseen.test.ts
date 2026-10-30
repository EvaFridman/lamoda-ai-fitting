import { describe, expect, it } from 'vitest';

import { UNSEEN_MAX, unseenBadgeValue, unseenText, withUnseen } from './unseen';

describe('unseenBadgeValue', () => {
  it('tops at nine plus one, the value of «9+»', () => {
    expect(UNSEEN_MAX).toBe(9);
    expect([0, 1, 9, 10, 11, 250].map(unseenBadgeValue)).toEqual([0, 1, 9, 10, 10, 10]);
  });

  it('is 0 for a negative count', () => {
    expect(unseenBadgeValue(-3)).toBe(0);
  });
});

describe('unseenText', () => {
  it.each([
    [1, '1 новая примерка'],
    [2, '2 новые примерки'],
    [3, '3 новые примерки'],
    [4, '4 новые примерки'],
    [5, '5 новых примерок'],
    [9, '9 новых примерок'],
  ])('says %s as «%s»', (count, text) => {
    expect(unseenText(count)).toBe(text);
  });

  it.each([10, 11, 21, 100])('says «больше 9 новых примерок» for %s', (count) => {
    expect(unseenText(count)).toBe('больше 9 новых примерок');
  });
});

describe('withUnseen', () => {
  it('adds the count to the name', () => {
    expect(withUnseen('Профиль', 3)).toBe('Профиль, 3 новые примерки');
    expect(withUnseen('Мои примерки', 1)).toBe('Мои примерки, 1 новая примерка');
    expect(withUnseen('Меню', 12)).toBe('Меню, больше 9 новых примерок');
  });

  it.each([0, -1])('leaves the bare name at %s', (count) => {
    expect(withUnseen('Профиль', count)).toBe('Профиль');
  });
});
