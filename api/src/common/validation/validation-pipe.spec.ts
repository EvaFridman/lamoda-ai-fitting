import 'reflect-metadata';

import type { ArgumentMetadata } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Min, ValidateNested } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { ValidationError } from '../errors/app.exception.js';
import { createValidationPipe } from './validation-pipe.js';

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

  it('lists several broken rules of one field', async () => {
    const error = await failure({ ...valid, sizes: [{ size: 'M', stock: -1.5 }] });
    const codes = error.body.error.details.map((d) => d.code).sort();

    expect(codes).toEqual(['IS_INT', 'MIN']);
    expect(error.body.error.details.every((d) => d.field === 'sizes.0.stock')).toBe(true);
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

    expect(error.body.error.details).toHaveLength(2);
    expect(error.body.error.details).toContainEqual({
      field: 'sizes.1.stock',
      code: 'IS_INT',
      message: 'stock must be an integer number',
    });
    expect(error.body.error.details).toContainEqual(
      expect.objectContaining({ field: 'sizes.1.stock', code: 'MIN' }),
    );
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

    expect(error.body.error.details.map((d) => d.field)).toEqual(['name', 'name']);
    expect(error.body.error.details.map((d) => d.code).sort()).toEqual([
      'IS_NOT_EMPTY',
      'IS_STRING',
    ]);
  });
});
