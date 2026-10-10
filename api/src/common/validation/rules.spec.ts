import { IsOptional } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { ValidationError } from '../errors/app.exception.js';
import {
  DESCRIPTION_MAX_LENGTH,
  IsBooleanQuery,
  IsDescription,
  IsDiscount,
  IsImageKey,
  IsListQuery,
  IsNonNegativeInt,
  IsNotBelow,
  IsOmittable,
  IsPrice,
  IsPriceQuery,
  IsRating,
  IsSlug,
  IsTrimmedText,
  MAX_INT,
  MAX_PRICE,
  MAX_QUERY_LIST_VALUES,
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

class DescriptionDto {
  @IsDescription()
  value!: string;
}
class OmittableDto {
  @IsOmittable()
  @IsNonNegativeInt()
  value?: number;
}
class QueryDto {
  @IsOptional()
  @IsBooleanQuery()
  value?: boolean;
}

class ListDto {
  @IsOptional()
  @IsListQuery()
  @IsTrimmedText(5, { each: true })
  value?: string[];
}
class PriceQueryDto {
  @IsOptional()
  @IsPriceQuery()
  minPrice?: number;

  @IsOptional()
  @IsPriceQuery()
  @IsNotBelow('minPrice')
  maxPrice?: number;
}

const pipe = createValidationPipe();

function parse(
  metatype: new () => object,
  body: unknown,
  type: 'body' | 'query' = 'body',
): Promise<unknown> {
  return pipe.transform(body, { type, metatype });
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

describe('IsDescription', () => {
  it('has the maximum 5000', () => {
    expect(DESCRIPTION_MAX_LENGTH).toBe(5000);
  });

  it.each(['', ' a ', 'line one\nline two\r\n', '\ttabbed', 'Плать'])(
    'accepts %j',
    async (value) => {
      await expect(parse(DescriptionDto, { value })).resolves.toMatchObject({ value });
    },
  );

  it('accepts 5000 code points and refuses 5001 with MAX_LENGTH', async () => {
    const wide = (n: number): string => String.fromCodePoint(0x1f600).repeat(n);

    await expect(parse(DescriptionDto, { value: wide(5000) })).resolves.toBeDefined();
    expect(await codesOf(DescriptionDto, { value: wide(5001) })).toEqual(['value:MAX_LENGTH']);
  });

  it('refuses NUL anywhere with MATCHES', async () => {
    expect(await codesOf(DescriptionDto, { value: 'a\x00b' })).toEqual(['value:MATCHES']);
  });

  it.each([5, null, undefined])('refuses %j with IS_STRING', async (value) => {
    expect(await codesOf(DescriptionDto, { value })).toContain('value:IS_STRING');
  });
});

describe('IsOmittable', () => {
  it('accepts a missing field', async () => {
    await expect(parse(OmittableDto, {})).resolves.toBeDefined();
  });

  it('accepts undefined', async () => {
    await expect(parse(OmittableDto, { value: undefined })).resolves.toBeDefined();
  });

  it('validates a value that is present', async () => {
    await expect(parse(OmittableDto, { value: 3 })).resolves.toMatchObject({ value: 3 });
    expect(await codesOf(OmittableDto, { value: -1 })).toEqual(['value:MIN']);
  });

  it('refuses null, which IsOptional would let through', async () => {
    expect(await codesOf(OmittableDto, { value: null })).toContain('value:IS_INT');
  });
});

describe('IsListQuery', () => {
  const values = (n: number): string[] => Array.from({ length: n }, (_, i) => `v${i}`);

  it('makes one string a list of one', async () => {
    await expect(parse(ListDto, { value: 'a' }, 'query')).resolves.toMatchObject({ value: ['a'] });
  });

  it('keeps repeated keys', async () => {
    await expect(parse(ListDto, { value: ['a', 'b'] }, 'query')).resolves.toMatchObject({
      value: ['a', 'b'],
    });
  });

  it('splits a comma list', async () => {
    await expect(parse(ListDto, { value: 'a,b,c' }, 'query')).resolves.toMatchObject({
      value: ['a', 'b', 'c'],
    });
  });

  it('splits commas inside repeated keys', async () => {
    await expect(parse(ListDto, { value: ['a,b', 'c'] }, 'query')).resolves.toMatchObject({
      value: ['a', 'b', 'c'],
    });
  });

  it.each(['', 'a,,b', ',a', 'a,', ['a', '']])(
    'refuses the empty item of %j with MATCHES',
    async (value) => {
      const error: unknown = await parse(ListDto, { value }, 'query').then(
        () => undefined,
        (reason: unknown) => reason,
      );
      expect(error).toBeInstanceOf(ValidationError);
      const codes = (error as ValidationError).body.error.details.map(
        (detail) => `${detail.field}:${detail.code}`,
      );
      expect(codes).toContain('value:MATCHES');
    },
  );

  it('accepts the maximum number of values', async () => {
    expect(MAX_QUERY_LIST_VALUES).toBe(50);
    await expect(parse(ListDto, { value: values(50) }, 'query')).resolves.toBeDefined();
    await expect(parse(ListDto, { value: values(50).join(',') }, 'query')).resolves.toBeDefined();
  });

  it('refuses one value more with ARRAY_MAX_SIZE, counted after splitting', async () => {
    expect(await codesOf(ListDto, { value: values(51) })).toContain('value:ARRAY_MAX_SIZE');
    expect(await codesOf(ListDto, { value: values(51).join(',') })).toContain(
      'value:ARRAY_MAX_SIZE',
    );
    expect(
      await codesOf(ListDto, { value: [values(26).join(','), values(25).join(',')] }),
    ).toContain('value:ARRAY_MAX_SIZE');
  });

  it.each([5, true, { a: 'b' }])('refuses the non-string %j with IS_ARRAY', async (value) => {
    expect(await codesOf(ListDto, { value })).toContain('value:IS_ARRAY');
  });

  it('refuses a non-string inside an array with IS_STRING', async () => {
    expect(await codesOf(ListDto, { value: ['a', 5] })).toContain('value:IS_STRING');
  });

  it('accepts a missing parameter', async () => {
    await expect(parse(ListDto, {}, 'query')).resolves.toBeDefined();
  });
});

describe('IsPriceQuery', () => {
  it.each([
    ['0', 0],
    ['10.5', 10.5],
    ['1999.99', 1999.99],
    ['99999999.99', MAX_PRICE],
  ])('turns %j into %s', async (minPrice, expected) => {
    await expect(parse(PriceQueryDto, { minPrice }, 'query')).resolves.toMatchObject({
      minPrice: expected,
    });
  });

  it.each(['', '0x10', '1e2', ' 5', '5 ', '-1', '+1', '.5', '5.', 'abc', ['1', '2']])(
    'refuses %j with IS_NUMBER',
    async (minPrice) => {
      expect(await codesOf(PriceQueryDto, { minPrice })).toContain('minPrice:IS_NUMBER');
    },
  );

  it('refuses more than 2 decimals with MAX_DECIMAL_PLACES', async () => {
    expect(await codesOf(PriceQueryDto, { minPrice: '1.234' })).toEqual([
      'minPrice:MAX_DECIMAL_PLACES',
    ]);
  });

  it('refuses a price above the maximum with MAX', async () => {
    expect(await codesOf(PriceQueryDto, { minPrice: '100000000' })).toEqual(['minPrice:MAX']);
  });

  it('accepts a missing parameter', async () => {
    await expect(parse(PriceQueryDto, {}, 'query')).resolves.toBeDefined();
  });
});

describe('IsNotBelow', () => {
  it('accepts a larger or equal value', async () => {
    await expect(
      parse(PriceQueryDto, { minPrice: '5', maxPrice: '10' }, 'query'),
    ).resolves.toBeDefined();
    await expect(
      parse(PriceQueryDto, { minPrice: '5', maxPrice: '5' }, 'query'),
    ).resolves.toBeDefined();
  });

  it('refuses a smaller value with IS_NOT_BELOW on the checked field', async () => {
    expect(await codesOf(PriceQueryDto, { minPrice: '10', maxPrice: '5' })).toEqual([
      'maxPrice:IS_NOT_BELOW',
    ]);
  });

  it('passes while the other field is missing', async () => {
    await expect(parse(PriceQueryDto, { maxPrice: '5' }, 'query')).resolves.toBeDefined();
  });

  it('passes while the other field is not a number, which reports itself', async () => {
    const codes = await codesOf(PriceQueryDto, { minPrice: 'x', maxPrice: '5' });

    expect(codes).toContain('minPrice:IS_NUMBER');
    expect(codes.filter((code) => code.startsWith('maxPrice:'))).toEqual([]);
  });

  it('passes while the checked value is not a number', async () => {
    const codes = await codesOf(PriceQueryDto, { minPrice: '5', maxPrice: 'x' });

    expect(codes).toContain('maxPrice:IS_NUMBER');
    expect(codes).not.toContain('maxPrice:IS_NOT_BELOW');
  });
});

describe('IsBooleanQuery', () => {
  it('turns "true" and "false" into booleans', async () => {
    await expect(parse(QueryDto, { value: 'true' }, 'query')).resolves.toMatchObject({
      value: true,
    });
    await expect(parse(QueryDto, { value: 'false' }, 'query')).resolves.toMatchObject({
      value: false,
    });
  });

  it('accepts a missing parameter', async () => {
    await expect(parse(QueryDto, {}, 'query')).resolves.toBeDefined();
  });

  it.each(['yes', '1', '0', '', 'TRUE', ' true', ['true', 'false'], ['true']])(
    'refuses %j with IS_BOOLEAN',
    async (value) => {
      const error: unknown = await parse(QueryDto, { value }, 'query').then(
        () => undefined,
        (reason: unknown) => reason,
      );
      expect(error).toBeInstanceOf(ValidationError);
      const details = (error as ValidationError).body.error.details;
      expect(details.map((detail) => `${detail.field}:${detail.code}`)).toEqual([
        'value:IS_BOOLEAN',
      ]);
    },
  );
});
