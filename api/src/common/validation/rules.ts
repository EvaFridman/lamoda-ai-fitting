import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateBy,
  ValidateIf,
} from 'class-validator';

// Field rules of the catalog DTOs. They repeat the CHECK constraints of the init migration and
// the column types of schema.prisma (spec 0004 E9), so a caller gets a field-level 400 instead of
// a database error. One copy of each regex: DTOs use these decorators, never their own.

// Column lengths (schema.prisma).
export const NAME_MAX_LENGTH = 255;
export const ATTRIBUTE_NAME_MAX_LENGTH = 100;
export const ATTRIBUTE_VALUE_MAX_LENGTH = 255;
export const SIZE_MAX_LENGTH = 20;
// The product list's name search (spec 0004 plan, "Product listing").
export const SEARCH_MAX_LENGTH = 100;
export const SLUG_MAX_LENGTH = 255;
export const IMAGE_KEY_MAX_LENGTH = 255;
// `text` has no limit; the api sets one (spec 0004 E40).
export const DESCRIPTION_MAX_LENGTH = 5000;

// `Decimal(10, 2)` holds less than 10^8; `Int` columns are 32-bit.
export const MAX_PRICE = 99_999_999.99;
export const MAX_INT = 2_147_483_647;

// `name <> '' AND name = btrim(name)`. Stricter than btrim, which trims spaces only: no whitespace
// of any kind at either end. No NUL anywhere: PostgreSQL text refuses it.
// eslint-disable-next-line no-control-regex -- the NUL is the point of the lookahead
export const TRIMMED_TEXT = /^(?!.*\x00)\S(?:.*\S)?$/su;
// Free text: anything but NUL, line breaks and outer spaces included.
// eslint-disable-next-line no-control-regex -- the NUL is the point of the class
export const FREE_TEXT = /^[^\x00]*$/u;
// Lower-case Latin letters and digits in groups joined by single hyphens.
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Relative object key (spec 0002 C22): segments of ASCII letters, digits, `.`, `_`, `-` joined by
// `/`, each starting with a letter or digit, and no `..` anywhere.
export const IMAGE_KEY = /^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

// A name, article, size or attribute value; with `each`, every item of an array.
export function IsTrimmedText(maxLength: number, { each = false } = {}): PropertyDecorator {
  return applyDecorators(
    IsString({ each }),
    HasMaxCharacters(maxLength, each),
    Matches(TRIMMED_TEXT, {
      each,
      message: '$property must not be empty, start or end with a space or contain NUL',
    }),
  );
}

// A description: free text up to DESCRIPTION_MAX_LENGTH characters (spec 0004 E40).
export function IsDescription(): PropertyDecorator {
  return applyDecorators(
    IsString(),
    HasMaxCharacters(DESCRIPTION_MAX_LENGTH),
    Matches(FREE_TEXT, { message: '$property must not contain NUL' }),
  );
}

// `varchar(n)` counts code points. Not MaxLength: it counts UTF-16 units and skips the variation
// selectors U+FE0E/U+FE0F, so 255 emoji with U+FE0F pass it as 255 but are 510 for PostgreSQL.
// Same code as MaxLength (MAX_LENGTH).
function HasMaxCharacters(max: number, each = false): PropertyDecorator {
  return ValidateBy(
    {
      name: 'maxLength',
      constraints: [max],
      validator: {
        validate: (value: unknown) => typeof value === 'string' && [...value].length <= max,
        defaultMessage: () => `$property must be at most ${max} characters`,
      },
    },
    { each },
  );
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

// A field that may be left out but not sent as null (spec 0004 E40). IsOptional skips the rules
// for null too, and null would reach a NOT NULL column as a database error.
export function IsOmittable(): PropertyDecorator {
  return ValidateIf((_object: object, value: unknown) => value !== undefined);
}

// Swagger text for an omittable field whose column defaults to 0. Not `default: 0`: PartialType
// copies it into the update DTO, where a field left out keeps its value.
export const LEFT_OUT_IS_ZERO = '0 when left out on create; an update without it keeps the value.';

// A boolean in the query string: only `true` or `false` (spec 0004 E39). Not `@Type(() => Boolean)`:
// it turns any non-empty string, `false` included, into true. Anything else stays as sent and
// fails IsBoolean; a repeated parameter comes as an array and fails too.
export function IsBooleanQuery(): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      value === 'true' ? true : value === 'false' ? false : value,
    ),
    IsBoolean(),
  );
}

// Values of one list filter (spec 0004 E45).
export const MAX_QUERY_LIST_VALUES = 50;

// A list in the query string: repeated keys, comma lists or both (`?id=a,b&id=c` is `[a, b, c]`).
// An empty item stays an empty string and fails the item rules. A value that is not a string, or an
// array holding one, stays as sent and fails IsArray or the item rules. The cap counts the values after splitting, duplicates included.
// The item rules are the caller's, with `each: true`.
export function IsListQuery(): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) => {
      const parts = typeof value === 'string' ? [value] : value;
      return Array.isArray(parts) && parts.every((part) => typeof part === 'string')
        ? parts.flatMap((part) => part.split(','))
        : value;
    }),
    IsArray(),
    ArrayMaxSize(MAX_QUERY_LIST_VALUES),
  );
}

// Digits with an optional fraction. Not `@Type(() => Number)`: it reads `''` as 0, and `0x10`,
// `1e2` or ` 5` as numbers.
const DECIMAL_QUERY = /^\d+(?:\.\d+)?$/;

// A price bound in the query string: rubles from 0, at most 2 decimals (spec 0004 E45). Anything
// but plain digits stays a string and fails IsNumber.
export function IsPriceQuery(): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' && DECIMAL_QUERY.test(value) ? Number(value) : value,
    ),
    IsNumber({ allowNaN: false, allowInfinity: false }),
    HasMaxDecimalPlaces(2),
    Min(0),
    Max(MAX_PRICE),
  );
}

// Users (spec 0004 E10, E47). Lengths and regexes of the `users_*` CHECK constraints.
export const EMAIL_MAX_LENGTH = 254;
export const PERSON_NAME_MIN_LENGTH = 2;
export const PERSON_NAME_MAX_LENGTH = 50;
export const MIN_AGE = 14;
export const MIN_DATE_OF_BIRTH = '1900-01-01';

// A Russian mobile number, the only stored form.
export const PHONE = /^\+79\d{9}$/;
// Phone input: digits, spaces, brackets and hyphens, with an optional leading `+`.
const PHONE_INPUT = /^\+?[\d ()-]+$/;
// `something@domain.zone` with no whitespace (`[^@[:space:]]` in the database), no control
// characters (Cc, NUL included: PostgreSQL text refuses it) and no invisible formatting characters
// (Cf: zero-width, direction marks), so an address cannot look like another one (E47).
export const EMAIL = /^[^@\s\p{Cc}\p{Cf}]+@[^@\s\p{Cc}\p{Cf}]+\.[^@\s\p{Cc}\p{Cf}]+$/u;
// Cyrillic or Latin letters; a space, apostrophe or hyphen only between letters.
export const PERSON_NAME = /^[A-Za-zА-ЯЁа-яё]+(?:[ '-][A-Za-zА-ЯЁа-яё]+)*$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// `8 (999) 123-45-67`, `+7 999 123 45 67` or `999 123-45-67` → `+79991234567` (E47). Input that
// does not normalize stays as sent and fails PHONE.
export function normalizePhone(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const input = value.trim();
  if (!PHONE_INPUT.test(input)) return value;
  const plus = input.startsWith('+');
  const digits = input.replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('7') || (!plus && digits.startsWith('8')))) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.length === 10 && !plus) return `+7${digits}`;
  return value;
}

// Trimmed, lower-cased and in NFC, so a decomposed `й` is the same address as a composed one (E47).
export function normalizeEmail(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase().normalize('NFC') : value;
}

// A real calendar date `YYYY-MM-DD` from MIN_DATE_OF_BIRTH to today (UTC) minus MIN_AGE years,
// inclusive. The bound is compared as text: on 2026-02-28 someone born 2012-02-29 is still 13.
export function isDateOfBirth(value: unknown, now: Date = new Date()): boolean {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE.exec(value);
  if (match === null) return false;
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1) return false;
  const latest = `${String(now.getUTCFullYear() - MIN_AGE).padStart(4, '0')}-${now
    .toISOString()
    .slice(5, 10)}`;
  return value >= MIN_DATE_OF_BIRTH && value <= latest;
}

export function IsPhone(): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) => normalizePhone(value)),
    IsString(),
    Matches(PHONE, { message: '$property must be a Russian mobile number, e.g. +79991234567' }),
  );
}

// One validator, the length first: EMAIL backtracks quadratically (the domain class includes `.`),
// and class-validator runs every rule of a field, so a separate Matches would still scan a long
// string.
export function IsUserEmail(): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) => normalizeEmail(value)),
    ValidateBy({
      name: 'isUserEmail',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && [...value].length <= EMAIL_MAX_LENGTH && EMAIL.test(value),
        defaultMessage: () =>
          `$property must be an email address of at most ${EMAIL_MAX_LENGTH} characters`,
      },
    }),
  );
}

export function IsPersonName(): PropertyDecorator {
  return applyDecorators(
    IsString(),
    MinLength(PERSON_NAME_MIN_LENGTH),
    MaxLength(PERSON_NAME_MAX_LENGTH),
    Matches(PERSON_NAME, {
      message:
        '$property must be Cyrillic or Latin letters, with a space, apostrophe or hyphen only between letters',
    }),
  );
}

export function IsDateOfBirth(): PropertyDecorator {
  return ValidateBy({
    name: 'isDateOfBirth',
    validator: {
      validate: (value: unknown) => isDateOfBirth(value),
      defaultMessage: () =>
        `$property must be a date YYYY-MM-DD from ${MIN_DATE_OF_BIRTH}, at least ${MIN_AGE} years ago`,
    },
  });
}

// A number not below another field of the same object (`maxPrice` and `minPrice`). Passes while
// either is not a number: their own rules report that.
export function IsNotBelow(property: string): PropertyDecorator {
  return ValidateBy({
    name: 'isNotBelow',
    constraints: [property],
    validator: {
      validate: (value: unknown, args) => {
        const other = (args?.object as Record<string, unknown> | undefined)?.[property];
        return typeof value !== 'number' || typeof other !== 'number' || value >= other;
      },
      defaultMessage: () => `$property must not be below ${property}`,
    },
  });
}
