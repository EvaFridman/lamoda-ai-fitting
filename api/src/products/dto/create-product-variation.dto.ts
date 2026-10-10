import { ApiProperty } from '@nestjs/swagger';

import {
  IsNonNegativeInt,
  IsTrimmedText,
  MAX_INT,
  SIZE_MAX_LENGTH,
} from '../../common/validation/rules.js';

// The product comes from the path, never from the body (spec 0004 E44).
export class CreateProductVariationDto {
  // Unique within the product: a taken size is 409 ALREADY_EXISTS (E44).
  @ApiProperty({ example: 'M', maxLength: SIZE_MAX_LENGTH })
  @IsTrimmedText(SIZE_MAX_LENGTH)
  size: string;

  // Required: the column has no default (E44).
  @ApiProperty({ minimum: 0, maximum: MAX_INT, example: 3 })
  @IsNonNegativeInt()
  stock: number;
}
