import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

import {
  DESCRIPTION_MAX_LENGTH,
  IsDescription,
  IsDiscount,
  IsOmittable,
  IsPrice,
  IsRating,
  IsTrimmedText,
  LEFT_OUT_IS_ZERO,
  MAX_PRICE,
  NAME_MAX_LENGTH,
} from '../../common/validation/rules.js';

// Images, sizes and attribute values are edited through their own routes (spec 0004 T10).
export class CreateProductDto {
  @ApiProperty({ example: 'MP002XW0ABCD', maxLength: NAME_MAX_LENGTH })
  @IsTrimmedText(NAME_MAX_LENGTH)
  article: string;

  @ApiProperty({ example: 'Платье миди', maxLength: NAME_MAX_LENGTH })
  @IsTrimmedText(NAME_MAX_LENGTH)
  name: string;

  // `null` means no description; in an update it clears it (spec 0004 E43).
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: DESCRIPTION_MAX_LENGTH })
  @IsOptional()
  @IsDescription()
  description?: string | null;

  // `null` means no rating; in an update it clears it (spec 0004 E43).
  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0, maximum: 5, example: 4.5 })
  @IsOptional()
  @IsRating()
  rating?: number | null;

  @ApiProperty({ example: 1999.99, exclusiveMinimum: true, minimum: 0, maximum: MAX_PRICE })
  @IsPrice()
  price: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, description: LEFT_OUT_IS_ZERO })
  @IsOmittable()
  @IsDiscount()
  discount?: number;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  brandId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId: string;
}
