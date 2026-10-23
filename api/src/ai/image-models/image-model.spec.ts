import { describe, expect, it } from 'vitest';

import { assertFittingItems, MAX_FITTING_ITEMS } from './image-model.js';

const item = {
  name: 'Shirt',
  category: 'Shirts',
  colour: null,
  image: { bytes: new Uint8Array([1]), mimeType: 'image/png' as const },
};
const itemsOf = (count: number) => Array.from({ length: count }, () => item);

describe('assertFittingItems', () => {
  it('allows at most five items', () => {
    expect(MAX_FITTING_ITEMS).toBe(5);
  });

  it.each([1, 5])('passes %i items', (count) => {
    expect(() => assertFittingItems({ items: itemsOf(count) })).not.toThrow();
  });

  it.each([0, 6])('throws for %i items', (count) => {
    expect(() => assertFittingItems({ items: itemsOf(count) })).toThrow(
      `A fitting takes 1 to 5 items, got ${count}`,
    );
  });
});
