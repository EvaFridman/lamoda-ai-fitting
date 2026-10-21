import { describe, expect, it } from 'vitest';

import { columnsFor } from './columns';

describe('columnsFor', () => {
  it.each([
    [0, 2],
    [320, 2],
    [599, 2],
    [599.9, 2],
    [600, 3],
    [899, 3],
    [899.9, 3],
    [900, 4],
    [952, 4],
    [1600, 4],
  ])('gives %s px of width %s columns', (width, columns) => {
    expect(columnsFor(width)).toBe(columns);
  });
});
