import { describe, expect, it } from 'vitest';

import { columnsFor } from './columns';

describe('columnsFor', () => {
  it.each([
    [0, 2],
    [320, 2],
    [767, 2],
    [767.9, 2],
    [768, 3],
    [1023, 3],
    [1023.9, 3],
    [1024, 4],
    [1600, 4],
  ])('gives %s px of width %s columns', (width, columns) => {
    expect(columnsFor(width)).toBe(columns);
  });
});
