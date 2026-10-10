import { describe, expect, it } from 'vitest';

import { ValidationError } from '../errors/app.exception.js';
import {
  IsDiscount,
  IsImageKey,
  IsNonNegativeInt,
  IsPrice,
  IsRating,
  IsSlug,
  IsTrimmedText,
  MAX_INT,
  MAX_PRICE,
} from './rules.js';
import { createValidationPipe } from './validation-pipe.js';

class Dto {
  @IsTrimmedText(5)
  text!: string;
}
class LongDto {
  @IsTrimmedText(255)
  text!: string;
}
class SlugDto {
  @IsSlug()
  value!: string;
}
class KeyDto {
  @IsImageKey()
  value!: string;
}
class PriceDto {
  @IsPrice()
  value!: number;
}
class DiscountDto {
  @IsDiscount()
  value!: number;
}
class RatingDto {
  @IsRating()
  value!: number;
}
class IntDto {
  @IsNonNegativeInt()
  value!: number;
}

const pipe = createValidationPipe();

function parse(metatype: new () => object, body: unknown): Promise<unknown> {
  return pipe.transform(body, { type: 'body', metatype });
}

async function codesOf(metatype: new () => object, body: unknown): Promise<string[]> {
  const error: unknown = await parse(metatype, body).then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ValidationError);
  const { code, body: payload } = error as ValidationError;
  expect(code).toBe('VALIDATION_FAILED');
  return payload.error.details.map((detail) => `${detail.field}:${detail.code}`);
}

describe('IsTrimmedText', () => {
  it.each(['a', 'abc', 'a b', 'abcde', 'a  b', 'Плать'])('accepts %j', async (text) => {
    await expect(parse(Dto, { text })).resolves.toMatchObject({ text });
  });

  it.each(['', ' ', ' a', 'a ', '\ta', 'a\n', ' a', 'a '])(
    'refuses %j with MATCHES',
    async (text) => {
      expect(await codesOf(Dto, { text })).toEqual(['text:MATCHES']);
    },
  );

  it('refuses a text over the maximum with MAX_LENGTH', async () => {
    expect(await codesOf(Dto, { text: 'abcdef' })).toEqual(['text:MAX_LENGTH']);
  });

  it('refuses NUL anywhere with MATCHES', async () => {
    expect(await codesOf(Dto, { text: 'a\x00b' })).toEqual(['text:MATCHES']);
  });

  it('counts code points, not UTF-16 units', async () => {
    const wide = (n: number): string => String.fromCodePoint(0x1f600).repeat(n);

    await expect(parse(LongDto, { text: wide(255) })).resolves.toBeDefined();
    expect(await codesOf(LongDto, { text: wide(256) })).toEqual(['text:MAX_LENGTH']);
  });

  it('counts variation selectors as characters', async () => {
    const heart = String.fromCodePoint(0x2764, 0xfe0f);

    expect(await codesOf(LongDto, { text: heart.repeat(255) })).toEqual(['text:MAX_LENGTH']);
    await expect(parse(LongDto, { text: heart.repeat(127) })).resolves.toBeDefined();
  });

  it('refuses a non-string with IS_STRING', async () => {
    expect(await codesOf(Dto, { text: 5 })).toContain('text:IS_STRING');
  });

  it('refuses a missing value', async () => {
    expect(await codesOf(Dto, {})).toContain('text:IS_STRING');
  });
});

describe('IsSlug', () => {
  it.each(['a', 'nike', 'air-max-90', '2024', 'a1-b2'])('accepts %j', async (value) => {
    await expect(parse(SlugDto, { value })).resolves.toMatchObject({ value });
  });

  it.each(['', 'Nike', '-a', 'a-', 'a--b', 'a_b', 'a b', 'a/b', 'бренд', 'a\n'])(
    'refuses %j with MATCHES',
    async (value) => {
      expect(await codesOf(SlugDto, { value })).toEqual(['value:MATCHES']);
    },
  );

  it('accepts 255 characters and refuses 256', async () => {
    await expect(parse(SlugDto, { value: 'a'.repeat(255) })).resolves.toBeDefined();
    expect(await codesOf(SlugDto, { value: 'a'.repeat(256) })).toEqual(['value:MAX_LENGTH']);
  });

  it('refuses a number with IS_STRING', async () => {
    expect(await codesOf(SlugDto, { value: 1 })).toContain('value:IS_STRING');
  });
});

describe('IsImageKey', () => {
  it.each([
    'a.webp',
    '1.webp',
    'products/3f2b8c1e-5d4a-4b6e-9a7c-1d2e3f4a5b6c/1.webp',
    'brands/nike_logo-2.png',
    'a.b.c',
    'a/b/c',
  ])('accepts %j', async (value) => {
    await expect(parse(KeyDto, { value })).resolves.toMatchObject({ value });
  });

  it.each([
    '',
    '/a.webp',
    'a/',
    'a//b',
    '../a',
    'a/../b',
    'a..b',
    '..',
    '.hidden',
    'a/.hidden',
    '_a',
    '-a',
    'a b',
    'a\\b',
    'a?b',
    'a#b',
    'a%2e',
    'https://x.ru/a',
    'фото.webp',
    'a\n',
  ])('refuses %j with MATCHES', async (value) => {
    expect(await codesOf(KeyDto, { value })).toEqual(['value:MATCHES']);
  });

  it('accepts 255 characters and refuses 256', async () => {
    await expect(parse(KeyDto, { value: 'a'.repeat(255) })).resolves.toBeDefined();
    expect(await codesOf(KeyDto, { value: 'a'.repeat(256) })).toEqual(['value:MAX_LENGTH']);
  });
});

describe('IsPrice', () => {
  it.each([0.01, 1, 10.5, 1999.99, MAX_PRICE])('accepts %s', async (value) => {
    await expect(parse(PriceDto, { value })).resolves.toMatchObject({ value });
  });

  it('has the maximum 99999999.99', () => {
    expect(MAX_PRICE).toBe(99_999_999.99);
  });

  it.each([0, -1, -0.01])('refuses %s with IS_POSITIVE', async (value) => {
    expect(await codesOf(PriceDto, { value })).toEqual(['value:IS_POSITIVE']);
  });

  it('refuses a price above the maximum with MAX', async () => {
    expect(await codesOf(PriceDto, { value: 100_000_000 })).toEqual(['value:MAX']);
    expect(await codesOf(PriceDto, { value: 99_999_999.995 })).toContain('value:MAX');
  });

  it('refuses more than 2 decimals with MAX_DECIMAL_PLACES', async () => {
    expect(await codesOf(PriceDto, { value: 1.005 })).toEqual(['value:MAX_DECIMAL_PLACES']);
  });

  it('answers 400, not a thrown error, for an exponent-form price', async () => {
    expect(await codesOf(PriceDto, { value: 1e-7 })).toEqual(['value:MAX_DECIMAL_PLACES']);
  });

  it('refuses NaN with IS_NUMBER', async () => {
    expect(await codesOf(PriceDto, { value: Number.NaN })).toContain('value:IS_NUMBER');
  });

  it.each(['10', null, true])('refuses the non-number %j with IS_NUMBER', async (value) => {
    expect(await codesOf(PriceDto, { value })).toContain('value:IS_NUMBER');
  });

  it('refuses a missing price', async () => {
    expect(await codesOf(PriceDto, {})).toContain('value:IS_NUMBER');
  });
});

describe('IsDiscount', () => {
  it.each([0, 1, 50, 100])('accepts %s', async (value) => {
    await expect(parse(DiscountDto, { value })).resolves.toMatchObject({ value });
  });

  it('refuses -1 with MIN', async () => {
    expect(await codesOf(DiscountDto, { value: -1 })).toEqual(['value:MIN']);
  });

  it('refuses 101 with MAX', async () => {
    expect(await codesOf(DiscountDto, { value: 101 })).toEqual(['value:MAX']);
  });

  it('refuses a fraction with IS_INT', async () => {
    expect(await codesOf(DiscountDto, { value: 10.5 })).toEqual(['value:IS_INT']);
  });

  it('refuses a string with IS_INT', async () => {
    expect(await codesOf(DiscountDto, { value: '10' })).toContain('value:IS_INT');
  });
});

describe('IsRating', () => {
  it.each([0, 0.1, 4.5, 4.9, 5])('accepts %s', async (value) => {
    await expect(parse(RatingDto, { value })).resolves.toMatchObject({ value });
  });

  it('refuses a negative rating with MIN', async () => {
    expect(await codesOf(RatingDto, { value: -0.1 })).toEqual(['value:MIN']);
  });

  it('refuses a rating above 5 with MAX', async () => {
    expect(await codesOf(RatingDto, { value: 5.1 })).toEqual(['value:MAX']);
    expect(await codesOf(RatingDto, { value: 6 })).toEqual(['value:MAX']);
  });

  it('refuses more than 1 decimal with MAX_DECIMAL_PLACES', async () => {
    expect(await codesOf(RatingDto, { value: 4.55 })).toEqual(['value:MAX_DECIMAL_PLACES']);
  });

  it('answers 400, not a thrown error, for an exponent-form rating', async () => {
    expect(await codesOf(RatingDto, { value: 5e-7 })).toEqual(['value:MAX_DECIMAL_PLACES']);
  });

  it('refuses NaN with IS_NUMBER', async () => {
    expect(await codesOf(RatingDto, { value: Number.NaN })).toContain('value:IS_NUMBER');
  });

  it('refuses a string with IS_NUMBER', async () => {
    expect(await codesOf(RatingDto, { value: '4' })).toContain('value:IS_NUMBER');
  });
});

describe('IsNonNegativeInt', () => {
  it.each([0, 1, 100, MAX_INT])('accepts %s', async (value) => {
    await expect(parse(IntDto, { value })).resolves.toMatchObject({ value });
  });

  it('has the maximum 2^31 - 1', () => {
    expect(MAX_INT).toBe(2 ** 31 - 1);
  });

  it('refuses -1 with MIN', async () => {
    expect(await codesOf(IntDto, { value: -1 })).toEqual(['value:MIN']);
  });

  it('refuses 2^31 with MAX', async () => {
    expect(await codesOf(IntDto, { value: MAX_INT + 1 })).toEqual(['value:MAX']);
  });

  it('refuses a fraction with IS_INT', async () => {
    expect(await codesOf(IntDto, { value: 1.5 })).toEqual(['value:IS_INT']);
  });

  it.each(['1', null, Number.NaN])('refuses %j with IS_INT', async (value) => {
    expect(await codesOf(IntDto, { value })).toContain('value:IS_INT');
  });
});
