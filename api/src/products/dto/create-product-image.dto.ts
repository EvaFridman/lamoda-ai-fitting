import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  IMAGE_KEY,
  IMAGE_KEY_MAX_LENGTH,
  IsImageKey,
  IsNonNegativeInt,
  IsOmittable,
  LEFT_OUT_IS_ZERO,
  MAX_INT,
} from '../../common/validation/rules.js';

// The product comes from the path, never from the body (spec 0004 E44).
export class CreateProductImageDto {
  @ApiProperty({
    example: 'products/1/1.jpg',
    maxLength: IMAGE_KEY_MAX_LENGTH,
    pattern: IMAGE_KEY.source,
  })
  @IsImageKey()
  imageKey: string;

  // Other images keep their `sortOrder`; ties are ordered by id (E43, E44).
  @ApiPropertyOptional({ minimum: 0, maximum: MAX_INT, description: LEFT_OUT_IS_ZERO })
  @IsOmittable()
  @IsNonNegativeInt()
  sortOrder?: number;
}
