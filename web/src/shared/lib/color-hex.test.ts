import { describe, expect, it } from 'vitest';

import { COLOR_HEX, colorHexSchema } from '@/shared/lib';

describe('COLOR_HEX', () => {
  it.each(['#000000', '#FFFFFF', '#ffffff', '#a1B2c3'])('accepts %s', (hex) => {
    expect(COLOR_HEX.test(hex)).toBe(true);
  });

  it.each(['#fff', '#1234567', '#GGGGGG', '123456', ''])('refuses %j', (value) => {
    expect(COLOR_HEX.test(value)).toBe(false);
  });
});

describe('colorHexSchema', () => {
  it.each(['#000000', '#FFFFFF', '#a1B2c3'])('accepts %s', (hex) => {
    expect(colorHexSchema.safeParse(hex)).toEqual({ success: true, data: hex });
  });

  it.each([
    ['too short', '#12345'],
    ['too long', '#1234567'],
    ['no hash', '123456'],
    ['not hex digits', '#GGGGGG'],
    ['empty', ''],
    ['a leading space', ' #123456'],
    ['a trailing newline', '#123456\n'],
    ['a number', 123456],
    ['null', null],
  ])('refuses %s', (_name, input) => {
    expect(colorHexSchema.safeParse(input).success).toBe(false);
  });
});
