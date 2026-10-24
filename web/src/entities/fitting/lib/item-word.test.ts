import { describe, expect, it } from 'vitest';

import { itemWord } from './item-word';

describe('itemWord', () => {
  it('lowers the first letter of a name', () => {
    expect(itemWord('Сарафан на бретелях')).toBe('сарафан на бретелях');
  });

  it('keeps a name that starts with two capitals', () => {
    expect(itemWord('LA Dress')).toBe('LA Dress');
  });

  it('handles a one-letter and an empty name', () => {
    expect(itemWord('Я')).toBe('я');
    expect(itemWord('')).toBe('');
  });
});
