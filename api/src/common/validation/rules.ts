import { applyDecorators } from '@nestjs/common';
import {
  IsInt,
  IsNumber,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateBy,
} from 'class-validator';

// Field rules of the catalog DTOs. They repeat the CHECK constraints of the init migration and
// the column types of schema.prisma (spec 0004 E9), so a caller gets a field-level 400 instead of
// a database error. One copy of each regex: DTOs use these decorators, never their own.

// Column lengths (schema.prisma).
export const NAME_MAX_LENGTH = 255;
export const ATTRIBUTE_NAME_MAX_LENGTH = 100;
export const SIZE_MAX_LENGTH = 20;
export const SLUG_MAX_LENGTH = 255;
export const IMAGE_KEY_MAX_LENGTH = 255;

// `Decimal(10, 2)` holds less than 10^8; `Int` columns are 32-bit.
export const MAX_PRICE = 99_999_999.99;
export const MAX_INT = 2_147_483_647;

// `name <> '' AND name = btrim(name)`. Stricter than btrim, which trims spaces only: no whitespace
// of any kind at either end. No NUL anywhere: PostgreSQL text refuses it.
// eslint-disable-next-line no-control-regex -- the NUL is the point of the lookahead
export const TRIMMED_TEXT = /^(?!.*\x00)\S(?:.*\S)?$/su;
// Lower-case Latin letters and digits in groups joined by single hyphens.
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Relative object key (spec 0002 C22): segments of ASCII letters, digits, `.`, `_`, `-` joined by
// `/`, each starting with a letter or digit, and no `..` anywhere.
export const IMAGE_KEY = /^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

// A name, article, size or attribute value.
export function IsTrimmedText(maxLength: number): PropertyDecorator {
  return applyDecorators(
    IsString(),
    HasMaxCharacters(maxLength),
    Matches(TRIMMED_TEXT, {
      message: '$property must not be empty, start or end with a space or contain NUL',
    }),
  );
}

// `varchar(n)` counts code points. Not MaxLength: it counts UTF-16 units and skips the variation
// selectors U+FE0E/U+FE0F, so 255 emoji with U+FE0F pass it as 255 but are 510 for PostgreSQL.
// Same code as MaxLength (MAX_LENGTH).
function HasMaxCharacters(max: number): PropertyDecorator {
  return ValidateBy({
    name: 'maxLength',
    constraints: [max],
    validator: {
      validate: (value: unknown) => typeof value === 'string' && [...value].length <= max,
      defaultMessage: () => `$property must be at most ${max} characters`,
    },
  });
}

export function IsSlug(): PropertyDecorator {
  return applyDecorators(
    IsString(),
    MaxLength(SLUG_MAX_LENGTH),
    Matches(SLUG, {
      message: '$property must be lower-case Latin letters and digits joined by single hyphens',
    }),
  );
}

export function IsImageKey(): PropertyDecorator {
  return applyDecorators(
    IsString(),
    MaxLength(IMAGE_KEY_MAX_LENGTH),
    Matches(IMAGE_KEY, {
      message: '$property must be a relative key of letters, digits, ".", "_", "-" and "/"',
    }),
  );
}

// At most `places` digits after the point. Not IsNumber's `maxDecimalPlaces`: it reads the digits
// from `toString()` and throws on `1e-7` (no point there), which answers 500 instead of 400.
// `toFixed` rounds to the nearest such decimal; a value with more digits comes back different.
function HasMaxDecimalPlaces(places: number): PropertyDecorator {
  return ValidateBy({
    name: 'maxDecimalPlaces',
    constraints: [places],
    validator: {
      validate: (value: unknown) =>
        typeof value === 'number' &&
        Number.isFinite(value) &&
        Number(value.toFixed(places)) === value,
      defaultMessage: () => `$property must have at most ${places} decimal places`,
    },
  });
}

// Rubles: more than 0, at most 2 decimals.
export function IsPrice(): PropertyDecorator {
  return applyDecorators(
    IsNumber({ allowNaN: false, allowInfinity: false }),
    HasMaxDecimalPlaces(2),
    IsPositive(),
    Max(MAX_PRICE),
  );
}

// Percent, a whole number from 0 to 100.
export function IsDiscount(): PropertyDecorator {
  return applyDecorators(IsInt(), Min(0), Max(100));
}

// 0 to 5 with 1 decimal (`Decimal(2, 1)`).
export function IsRating(): PropertyDecorator {
  return applyDecorators(
    IsNumber({ allowNaN: false, allowInfinity: false }),
    HasMaxDecimalPlaces(1),
    Min(0),
    Max(5),
  );
}

// Sort order and stock: 0 or more.
export function IsNonNegativeInt(): PropertyDecorator {
  return applyDecorators(IsInt(), Min(0), Max(MAX_INT));
}
