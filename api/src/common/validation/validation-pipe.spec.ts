import 'reflect-metadata';

import type { ArgumentMetadata, ValidationError as ClassValidatorError } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Min, ValidateNested } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { ValidationError } from '../errors/app.exception.js';
import { createValidationPipe, toDetails } from './validation-pipe.js';

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
    const error = await failure({ ...valid, admin: true });

    expect(error.body.error.details).toEqual([
      {
        field: 'admin',
        code: 'WHITELIST_VALIDATION',
        message: 'property admin should not exist',
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
