import { describe, expect, it } from 'vitest';

import { scrollTarget, underStuck } from './scroll-target';

describe('underStuck', () => {
  it('puts the top right under the stuck block', () => {
    expect(underStuck(600, 90)).toBe(510);
  });

  it('never goes above the page top', () => {
    expect(underStuck(40, 90)).toBe(0);
  });

  it('is the top itself for a stuck block of height 0', () => {
    expect(underStuck(300, 0)).toBe(300);
  });
});

describe('scrollTarget', () => {
  it('puts the list under the stuck block', () => {
    expect(scrollTarget({ stuckHeight: 100, barTop: 80, columnTop: 400 })).toBe(300);
  });

  it('never goes above the page top', () => {
    expect(scrollTarget({ stuckHeight: 100, barTop: null, columnTop: 40 })).toBe(0);
  });

  it('takes a stuck block of height 0 as stuck', () => {
    expect(scrollTarget({ stuckHeight: 0, barTop: 80, columnTop: 400 })).toBe(400);
  });

  it('goes to the bar when it shows and nothing sticks', () => {
    expect(scrollTarget({ stuckHeight: null, barTop: 120, columnTop: 400 })).toBe(120);
  });

  it('goes to the column when the bar is hidden', () => {
    expect(scrollTarget({ stuckHeight: null, barTop: null, columnTop: 400 })).toBe(400);
  });
});
