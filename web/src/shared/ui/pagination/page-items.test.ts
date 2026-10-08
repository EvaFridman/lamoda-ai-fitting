import { describe, expect, it } from 'vitest';

import { pageItems } from './page-items';

describe('pageItems', () => {
  it('has no pages when there are none', () => {
    expect(pageItems(1, 0)).toEqual([]);
  });

  it('shows a single page and two pages in full', () => {
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(1, 2)).toEqual([1, 2]);
    expect(pageItems(2, 2)).toEqual([1, 2]);
  });

  it('clamps a page below 1 and above the count', () => {
    expect(pageItems(0, 10)).toEqual(pageItems(1, 10));
    expect(pageItems(-5, 10)).toEqual(pageItems(1, 10));
    expect(pageItems(99, 10)).toEqual(pageItems(10, 10));
  });

  it('gaps the end from the first page', () => {
    expect(pageItems(1, 10)).toEqual([1, 2, 'gap-end', 10]);
  });

  it('gaps both sides from the middle', () => {
    expect(pageItems(5, 10)).toEqual([1, 'gap-start', 4, 5, 6, 'gap-end', 10]);
  });

  it('gaps the start from the last page', () => {
    expect(pageItems(10, 10)).toEqual([1, 'gap-start', 9, 10]);
  });

  it('never lets a gap hide a single page', () => {
    expect(pageItems(4, 10)).toEqual([1, 2, 3, 4, 5, 'gap-end', 10]);
    expect(pageItems(7, 10)).toEqual([1, 'gap-start', 6, 7, 8, 9, 10]);
    expect(pageItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
