import 'reflect-metadata';

import type { ArgumentMetadata, ValidationError as ClassValidatorError } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Min, ValidateNested } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { type ErrorDetail, ValidationError } from '../errors/app.exception.js';
import { capDetails, createValidationPipe, toDetails } from './validation-pipe.js';

interface ValidationErrorShape {
  property: string;
  constraints?: Record<string, string> | undefined;
  children?: ValidationErrorShape[];
}

class SizeDto {
  @IsString()
  size!: string;

  @IsInt()
  @Min(0)
  stock!: number;
}

class AddressDto {
  @IsString()
  @IsNotEmpty()
  city!: string;
}

class ProductDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ValidateNested()
  @Type(() => AddressDto)
  address!: AddressDto;

  @ValidateNested({ each: true })
  @Type(() => SizeDto)
  sizes!: SizeDto[];
}

const metadata: ArgumentMetadata = { type: 'body', metatype: ProductDto };

async function failure(value: unknown): Promise<ValidationError> {
  const error: unknown = await createValidationPipe()
    .transform(value, metadata)
    .catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ValidationError);
  return error as ValidationError;
}

describe('createValidationPipe', () => {
  const valid = {
    name: 'Shirt',
    address: { city: 'Moscow' },
    sizes: [{ size: 'M', stock: 3 }],
  };

  it('passes a valid body, as an instance of the DTO', async () => {
    const result = await createValidationPipe().transform(valid, metadata);
    expect(result).toBeInstanceOf(ProductDto);
    expect(result).toMatchObject(valid);
  });

  it('answers 400 VALIDATION_FAILED with one detail per broken rule, code in UPPER_SNAKE', async () => {
    const error = await failure({ ...valid, name: '' });

    expect(error.getStatus()).toBe(400);
    expect(error.body.error.code).toBe('VALIDATION_FAILED');
    expect(error.body.error.details).toEqual([
      { field: 'name', code: 'IS_NOT_EMPTY', message: 'name should not be empty' },
    ]);
  });

  it('gives a value of the wrong type only the type detail (E61)', async () => {
    const error = await failure({ ...valid, sizes: [{ size: 'M', stock: -1.5 }] });

    expect(error.body.error.details.map((d) => `${d.field}:${d.code}`)).toEqual([
      'sizes.0.stock:IS_INT',
    ]);
  });

  it('gives a nested object field as a dotted path', async () => {
    const error = await failure({ ...valid, address: { city: '' } });

    expect(error.body.error.details).toEqual([
      { field: 'address.city', code: 'IS_NOT_EMPTY', message: 'city should not be empty' },
    ]);
  });

  it('gives a field of an array item as a dotted path with the index', async () => {
    const error = await failure({
      ...valid,
      sizes: [
        { size: 'M', stock: 1 },
        { size: 'L', stock: 'many' },
      ],
    });

    expect(error.body.error.details).toEqual([
      { field: 'sizes.1.stock', code: 'IS_INT', message: 'stock must be an integer number' },
    ]);
  });

  it('refuses an unknown field (forbidNonWhitelisted)', async () => {
    const error = await failure({ ...valid, role: true });

    expect(error.body.error.details).toEqual([
      {
        field: 'role',
        code: 'WHITELIST_VALIDATION',
        message: 'property role should not exist',
      },
    ]);
  });

  it('refuses an unknown field inside a nested object with its dotted path', async () => {
    const error = await failure({ ...valid, address: { city: 'Moscow', zip: '1' } });

    expect(error.body.error.details.map((d) => d.field)).toEqual(['address.zip']);
  });

  it('reports a missing required field', async () => {
    const { name: _name, ...withoutName } = valid;
    const error = await failure(withoutName);

    expect(error.body.error.details.map((d) => `${d.field}:${d.code}`)).toEqual(['name:IS_STRING']);
  });

  it('gives a value of the wrong type (name: 5) only IS_STRING', async () => {
    const error = await failure({ ...valid, name: 5 });

    expect(error.body.error.details.map((d) => `${d.field}:${d.code}`)).toEqual(['name:IS_STRING']);
  });

  it('caps 60 unknown fields at 50 details plus one TOO_MANY_ERRORS entry (AC16)', async () => {
    const unknown = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`extra${i}`, i]));
    const error = await failure({ ...valid, ...unknown });
    const details = error.body.error.details;

    expect(error.body.error.code).toBe('VALIDATION_FAILED');
    expect(details).toHaveLength(51);
    expect(details.slice(0, 50).every((d) => d.code === 'WHITELIST_VALIDATION')).toBe(true);
    expect(details[50]).toEqual({ field: '', code: 'TOO_MANY_ERRORS', message: '10 more errors' });
  });
});

describe('clipping of field and message (F25)', () => {
  const valid = { name: 'Shirt', address: { city: 'Moscow' }, sizes: [{ size: 'M', stock: 3 }] };

  async function unknownKeyDetail(key: string): Promise<{ field: string; message: string }> {
    const error = await failure({ ...valid, [key]: 1 });
    expect(error.body.error.details).toHaveLength(1);
    return error.body.error.details[0] as { field: string; message: string };
  }

  it('cuts a 5000-character key to 100 code points in field and 200 in message, each ending in …', async () => {
    const { field, message } = await unknownKeyDetail('k'.repeat(5000));

    expect(Array.from(field)).toHaveLength(100);
    expect(field.endsWith('…')).toBe(true);
    expect(field).toBe(`${'k'.repeat(99)}…`);
    expect(Array.from(message)).toHaveLength(200);
    expect(message.endsWith('…')).toBe(true);
  });

  it('does not clip a field of exactly 100 characters, and clips one of 101', async () => {
    const exact = await unknownKeyDetail('k'.repeat(100));
    const over = await unknownKeyDetail('k'.repeat(101));

    expect(exact.field).toBe('k'.repeat(100));
    expect(over.field).toBe(`${'k'.repeat(99)}…`);
  });

  it('cuts astral characters on a code point boundary, leaving no lone surrogate', async () => {
    const { field, message } = await unknownKeyDetail('😀'.repeat(300));

    expect(Array.from(field)).toHaveLength(100);
    expect(field).toBe(`${'😀'.repeat(99)}…`);
    expect(Array.from(message)).toHaveLength(200);
    for (const text of [field, message]) {
      expect(text.isWellFormed()).toBe(true);
    }
  });

  it('clips a nested path longer than 100', () => {
    const [detail] = toDetails([
      {
        property: 'address',
        children: [{ property: 'z'.repeat(120), constraints: { whitelistValidation: 'x' } }],
      },
    ] as ClassValidatorError[]);

    expect(detail?.field).toBe(`address.${'z'.repeat(91)}…`);
    expect(Array.from(detail?.field ?? '')).toHaveLength(100);
  });

  it('leaves short fields and messages unchanged', async () => {
    expect(await unknownKeyDetail('role')).toMatchObject({
      field: 'role',
      message: 'property role should not exist',
    });
  });
});

describe('capDetails', () => {
  function details(count: number): ErrorDetail[] {
    return Array.from({ length: count }, (_, i) => ({
      field: `f${i}`,
      code: 'X',
      message: `m${i}`,
    }));
  }

  it('leaves exactly 50 details unchanged', () => {
    const input = details(50);
    const result = capDetails(input);

    expect(result).toEqual(input);
    expect(result.some((d) => d.code === 'TOO_MANY_ERRORS')).toBe(false);
  });

  it('keeps 50 of 51 and counts the one dropped', () => {
    const input = details(51);

    expect(capDetails(input)).toEqual([
      ...input.slice(0, 50),
      { field: '', code: 'TOO_MANY_ERRORS', message: '1 more errors' },
    ]);
  });

  it('leaves an empty list unchanged', () => {
    expect(capDetails([])).toEqual([]);
  });
});

describe('toDetails (E61)', () => {
  function error(
    property: string,
    constraints: Record<string, string> | undefined,
    children: ValidationErrorShape[] = [],
  ): ValidationErrorShape {
    return { property, constraints, children };
  }

  function codes(errors: ValidationErrorShape[]): string[] {
    return toDetails(errors as ClassValidatorError[]).map((d) => `${d.field}:${d.code}`);
  }

  it('keeps only isNumber when the value is not a number', () => {
    const details = toDetails([
      error('price', {
        isNumber: 'price must be a number',
        maxDecimalPlaces: 'decimals',
        min: 'min',
        max: 'max',
      }),
    ] as ClassValidatorError[]);

    expect(details).toEqual([
      { field: 'price', code: 'IS_NUMBER', message: 'price must be a number' },
    ]);
  });

  it('keeps only isInt', () => {
    expect(codes([error('n', { isInt: 'x', min: 'x', max: 'x' })])).toEqual(['n:IS_INT']);
  });

  it('keeps only isArray', () => {
    expect(codes([error('ids', { isArray: 'x', arrayMaxSize: 'x' })])).toEqual(['ids:IS_ARRAY']);
  });

  it.each([
    ['isString', 'IS_STRING'],
    ['isBoolean', 'IS_BOOLEAN'],
  ])('keeps only %s', (rule, code) => {
    expect(codes([error('f', { [rule]: 'x', matches: 'x', maxLength: 'x' })])).toEqual([
      `f:${code}`,
    ]);
  });

  it('keeps only the type rule next to isNotEmpty', () => {
    expect(codes([error('f', { isNotEmpty: 'x', isString: 'x', minLength: 'x' })])).toEqual([
      'f:IS_STRING',
    ]);
  });

  it('keeps only the type rule next to isDefined', () => {
    expect(codes([error('f', { isDefined: 'x', isInt: 'x' })])).toEqual(['f:IS_INT']);
  });

  it('keeps only the type rule when no presence rule failed', () => {
    expect(codes([error('f', { isString: 'x', maxLength: 'x' })])).toEqual(['f:IS_STRING']);
  });

  it('lists every broken rule of a value of the right type', () => {
    expect(codes([error('f', { minLength: 'x', matches: 'x' })])).toEqual([
      'f:MIN_LENGTH',
      'f:MATCHES',
    ]);
  });

  it('keeps the dotted path of a nested child that has a type rule', () => {
    const details = codes([
      error('sizes', undefined, [
        error('1', undefined, [error('stock', { isInt: 'x', min: 'x' })]),
      ]),
    ]);

    expect(details).toEqual(['sizes.1.stock:IS_INT']);
  });

  it('keeps the parent rules and the children', () => {
    expect(
      codes([
        error('a', { isArray: 'x', arrayMaxSize: 'x' }, [error('0', { min: 'x', max: 'x' })]),
      ]),
    ).toEqual(['a:IS_ARRAY', 'a.0:MIN', 'a.0:MAX']);
  });
});
